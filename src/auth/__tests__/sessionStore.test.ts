import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, migrate } from '../../db';
import { AuthType, saveSession, loadLatestValidSession, clearSessions, isSessionValid } from '../sessionStore';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

describe('SessionStore', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbpia-session-test-'));
    db = openDb({ dbDir: tempDir });
    migrate(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should save and load the latest valid session', () => {
    const session1 = {
      id: 'session-1',
      cookiesJson: JSON.stringify([{ name: 'c1', value: 'v1' }]),
      authType: AuthType.INSTITUTION,
      institutionName: 'Test Univ',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    const session2 = {
      id: 'session-2',
      cookiesJson: JSON.stringify([{ name: 'c2', value: 'v2' }]),
      authType: AuthType.PERSONAL,
      expiresAt: new Date(Date.now() + 7200000).toISOString(),
    };

    saveSession(db, session1);
    saveSession(db, session2);

    const latest = loadLatestValidSession(db);
    expect(latest).toBeDefined();
    expect(latest?.id).toBe('session-2');
    expect(latest?.authType).toBe(AuthType.PERSONAL);
  });

  it('should not load expired sessions', () => {
    const expiredSession = {
      id: 'expired',
      cookiesJson: '[]',
      authType: AuthType.UNKNOWN,
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
    };

    saveSession(db, expiredSession);

    const latest = loadLatestValidSession(db);
    expect(latest).toBeNull();
  });

  it('should filter sessions by provided "now" date', () => {
    const session = {
      id: 'future-expired',
      cookiesJson: '[]',
      authType: AuthType.UNKNOWN,
      expiresAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    };

    saveSession(db, session);

    const validBefore = loadLatestValidSession(db, new Date('2025-12-31T23:59:59Z'));
    expect(validBefore).not.toBeNull();

    const invalidAfter = loadLatestValidSession(db, new Date('2026-01-02T00:00:00Z'));
    expect(invalidAfter).toBeNull();
  });

  it('should handle sessions without expiration', () => {
    const permanentSession = {
      id: 'permanent',
      cookiesJson: '[]',
      authType: AuthType.PERSONAL,
      expiresAt: null,
    };

    saveSession(db, permanentSession);

    const latest = loadLatestValidSession(db);
    expect(latest?.id).toBe('permanent');
  });

  it('should clear all sessions', () => {
    saveSession(db, {
      id: 's1',
      cookiesJson: '[]',
      authType: AuthType.UNKNOWN,
    });

    clearSessions(db);

    const latest = loadLatestValidSession(db);
    expect(latest).toBeNull();
  });

  it('should correctly identify valid/invalid sessions', () => {
    const validSession = {
      cookiesJson: '[]',
      authType: AuthType.UNKNOWN,
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };

    const expiredSession = {
      cookiesJson: '[]',
      authType: AuthType.UNKNOWN,
      expiresAt: new Date(Date.now() - 10000).toISOString(),
    };

    const permanentSession = {
      cookiesJson: '[]',
      authType: AuthType.UNKNOWN,
      expiresAt: null,
    };

    expect(isSessionValid(validSession)).toBe(true);
    expect(isSessionValid(expiredSession)).toBe(false);
    expect(isSessionValid(permanentSession)).toBe(true);
  });
});
