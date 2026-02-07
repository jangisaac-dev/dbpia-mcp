import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export enum AuthType {
  INSTITUTION = 'institution',
  PERSONAL = 'personal',
  UNKNOWN = 'unknown',
}

export interface Session {
  id?: string;
  cookiesJson: string;
  authType: AuthType;
  institutionName?: string | null;
  expiresAt?: string | null; // ISO string
  createdAt?: string; // ISO string
}

interface SessionRow {
  id: string;
  cookies_json: string;
  auth_type: AuthType;
  institution_name: string | null;
  expires_at: string | null;
  created_at: string;
}

export function saveSession(db: Database.Database, session: Session): void {
  const id = session.id || randomUUID();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, cookies_json, auth_type, institution_name, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      cookies_json = excluded.cookies_json,
      auth_type = excluded.auth_type,
      institution_name = excluded.institution_name,
      expires_at = excluded.expires_at
  `);

  stmt.run(
    id,
    session.cookiesJson,
    session.authType,
    session.institutionName || null,
    session.expiresAt || null
  );
}

export function loadLatestValidSession(db: Database.Database, now = new Date()): Session | null {
  const nowIso = now.toISOString();
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE expires_at IS NULL OR expires_at > ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get(nowIso) as SessionRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    cookiesJson: row.cookies_json,
    authType: row.auth_type as AuthType,
    institutionName: row.institution_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function clearSessions(db: Database.Database): void {
  db.prepare('DELETE FROM sessions').run();
}

export function isSessionValid(session: Session, now = new Date()): boolean {
  if (!session.expiresAt) {
    return true;
  }
  return new Date(session.expiresAt) > now;
}
