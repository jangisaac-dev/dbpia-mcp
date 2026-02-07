import { Database } from 'better-sqlite3';
import fs from 'fs/promises';
import crypto from 'crypto';
import { openPdf, deletePdf as deleteFile } from './fileOps.js';

export interface PdfListItem {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  pdfPath: string;
  downloadedAt: string;
  source: 'dbpia' | 'external';
}

export interface PdfInfo extends PdfListItem {
  fulltext?: string;
}

export interface PdfFilters {
  year?: number;
  journal?: string;
  title?: string;
}

export interface RegisterExternalPdfInput {
  pdfPath: string;
  articleId?: string;
  title?: string;
  authors?: string;
  year?: number;
  source?: string;
}

interface ArticlePdfRow {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  pdfPath: string;
  downloadedAt: string;
  source: 'dbpia';
  fulltext?: string;
}

interface ExternalPdfRow {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  journal: null;
  pdfPath: string;
  downloadedAt: string;
  source: 'external';
  fulltext?: string;
}

/**
 * Lists all downloaded PDFs from both articles and external_pdfs tables.
 */
export function listPdfs(db: Database, filters?: PdfFilters): PdfListItem[] {
  const articleQuery = `
    SELECT 
      'article:' || id as id,
      title,
      authors,
      pub_year as year,
      journal,
      pdf_path as pdfPath,
      downloaded_at as downloadedAt,
      'dbpia' as source
    FROM articles 
    WHERE download_status = 'downloaded' AND pdf_path IS NOT NULL
  `;

  const externalQuery = `
    SELECT 
      'external:' || id as id,
      title,
      authors,
      year,
      NULL as journal,
      pdf_path as pdfPath,
      created_at as downloadedAt,
      'external' as source
    FROM external_pdfs
    WHERE pdf_path IS NOT NULL
  `;

  let combinedQuery = `
    SELECT * FROM (
      ${articleQuery}
      UNION ALL
      ${externalQuery}
    )
  `;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.year) {
    conditions.push('year = ?');
    params.push(filters.year);
  }
  if (filters?.journal) {
    conditions.push('journal LIKE ?');
    params.push(`%${filters.journal}%`);
  }
  if (filters?.title) {
    conditions.push('title LIKE ?');
    params.push(`%${filters.title}%`);
  }

  if (conditions.length > 0) {
    combinedQuery += ' WHERE ' + conditions.join(' AND ');
  }

  combinedQuery += ' ORDER BY downloadedAt DESC';

  return db.prepare(combinedQuery).all(...params) as PdfListItem[];
}

/**
 * Gets detailed info for a specific PDF by ID.
 */
export function getPdfInfo(db: Database, id: string): PdfInfo | null {
  if (id.startsWith('article:')) {
    const articleId = id.replace('article:', '');
    const row = db.prepare(`
      SELECT 
        'article:' || id as id,
        title,
        authors,
        pub_year as year,
        journal,
        pdf_path as pdfPath,
        downloaded_at as downloadedAt,
        'dbpia' as source,
        fulltext
      FROM articles
      WHERE id = ? AND download_status = 'downloaded'
    `).get(articleId) as ArticlePdfRow | undefined;

    if (!row) return null;
    return {
      ...row,
      year: row.year ? Number(row.year) : null
    };
  } else if (id.startsWith('external:')) {
    const externalId = id.replace('external:', '');
    const row = db.prepare(`
      SELECT 
        'external:' || id as id,
        title,
        authors,
        year,
        NULL as journal,
        pdf_path as pdfPath,
        created_at as downloadedAt,
        'external' as source,
        fulltext
      FROM external_pdfs
      WHERE id = ?
    `).get(externalId) as ExternalPdfRow | undefined;

    if (!row) return null;
    return {
      ...row,
      year: row.year ? Number(row.year) : null
    };
  }
  return null;
}

/**
 * Opens a PDF file by ID using the platform's default viewer.
 */
export async function openPdfById(db: Database, id: string): Promise<{ success: boolean; message: string }> {
  const info = getPdfInfo(db, id);
  if (!info) {
    return { success: false, message: `PDF with ID ${id} not found.` };
  }

  if (!info.pdfPath) {
    return { success: false, message: `PDF path for ID ${id} is missing.` };
  }

  return openPdf(info.pdfPath);
}

/**
 * Deletes a PDF record and its associated file.
 */
export async function deletePdf(db: Database, id: string): Promise<{ success: boolean; message: string }> {
  const info = getPdfInfo(db, id);
  if (!info) {
    return { success: false, message: `PDF with ID ${id} not found.` };
  }

  if (info.pdfPath) {
    await deleteFile(info.pdfPath);
  }

  if (id.startsWith('article:')) {
    const articleId = id.replace('article:', '');
    db.prepare(`
      UPDATE articles 
      SET pdf_path = NULL, 
          download_status = 'pending', 
          downloaded_at = NULL 
      WHERE id = ?
    `).run(articleId);
  } else if (id.startsWith('external:')) {
    const externalId = id.replace('external:', '');
    db.prepare('DELETE FROM external_pdfs WHERE id = ?').run(externalId);
  }

  return { success: true, message: `Successfully deleted PDF ${id}` };
}

/**
 * Registers an external PDF file to an article or as a standalone record.
 */
export async function registerExternalPdf(
  db: Database,
  input: RegisterExternalPdfInput
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    await fs.stat(input.pdfPath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { success: false, message: `PDF file not found at path: ${input.pdfPath}` };
    }
    throw error;
  }

  if (input.articleId) {
    db.prepare(`
      UPDATE articles 
      SET pdf_path = ?, 
          download_status = 'downloaded', 
          downloaded_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(input.pdfPath, input.articleId);
    return { success: true, message: 'Successfully linked PDF to article', id: `article:${input.articleId}` };
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO external_pdfs (id, title, authors, year, source, pdf_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.title || 'Unknown Title',
      input.authors || null,
      input.year || null,
      input.source || 'external',
      input.pdfPath
    );
    return { success: true, message: 'Successfully registered external PDF', id: `external:${id}` };
  }
}
