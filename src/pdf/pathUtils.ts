import path from 'path';
import os from 'os';

/**
 * Returns the base path for PDF storage.
 * Reads from DBPIA_PDF_PATH environment variable or defaults to ~/.dbpia-mcp/pdfs/
 */
export function getPdfBasePath(): string {
  const envPath = process.env.DBPIA_PDF_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  return path.join(os.homedir(), '.dbpia-mcp', 'pdfs');
}

/**
 * Replaces forbidden path characters (/:*?"<>|) with _ and trims.
 */
export function sanitizePath(str: string): string {
  return str.replace(/[/:*?"<>|]/g, '_').trim();
}

/**
 * Builds the PDF file path.
 * Returns {base}/{year}/{journal}/{articleId}/{articleId}.pdf
 */
export function buildPdfPath(year: string, journal: string, articleId: string): string {
  const base = getPdfBasePath();
  const sanitizedYear = sanitizePath(year);
  const sanitizedJournal = sanitizePath(journal);
  const sanitizedArticleId = sanitizePath(articleId);

  return path.join(
    base,
    sanitizedYear,
    sanitizedJournal,
    sanitizedArticleId,
    `${sanitizedArticleId}.pdf`
  );
}
