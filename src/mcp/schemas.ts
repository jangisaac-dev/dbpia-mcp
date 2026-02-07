import { z } from 'zod';

export const SearchSchema = {
  searchall: z.string().describe('Search query for all fields'),
  page: z.number().optional().describe('Page number'),
  pagecount: z.number().optional().describe('Items per page'),
  refresh: z.boolean().optional().describe('Force refresh from remote'),
  extraParams: z.record(z.string(), z.any()).optional().describe('Additional DBpia API parameters'),
};

export const AdvancedSearchSchema = {
  searchall: z.string().optional().describe('Search query for all fields'),
  searchauthor: z.string().optional().describe('Search query for author'),
  searchpublisher: z.string().optional().describe('Search query for publisher'),
  searchbook: z.string().optional().describe('Search query for book/journal title'),
  page: z.number().optional().describe('Page number'),
  pagecount: z.number().optional().describe('Items per page'),
  refresh: z.boolean().optional().describe('Force refresh from remote'),
  extraParams: z.record(z.string(), z.any()).optional().describe('Additional DBpia API parameters'),
};

export const TopPapersSchema = {
  pyear: z.string().optional().describe('Publication year (YYYY)'),
  pmonth: z.string().optional().describe('Publication month (MM)'),
  category: z.string().optional().describe('Category code (e.g., L, G, M...)'),
  page: z.number().optional().describe('Page number'),
  pagecount: z.number().optional().describe('Items per page'),
  refresh: z.boolean().optional().describe('Force refresh from remote'),
  extraParams: z.record(z.string(), z.any()).optional().describe('Additional DBpia API parameters'),
};

export const LocalSearchSchema = {
  query: z.string().describe('Search query for title, authors, or abstract'),
  remoteFallback: z.boolean().optional().default(false).describe('Fallback to remote search if no local results (default: false)'),
  page: z.number().optional().describe('Page number (for remote fallback)'),
  pagecount: z.number().optional().describe('Items per page (for remote fallback)'),
};

export const ExportSchema = {
  outputPath: z.string().describe('File path to save JSONL output'),
};

export const DetailSchema = {
  id: z.string().describe('Article ID'),
  refresh: z.boolean().optional().describe('Force refresh from remote'),
};

export const OpenArticleSchema = {
  articleId: z.string().describe('Article ID (nodeId) to open in browser'),
};

export const LoginSchema = {
  userId: z.string().optional().describe('DBpia user ID (optional if set in env)'),
  userPw: z.string().optional().describe('DBpia user password (optional if set in env)'),
  autoLogin: z.enum(['Y', 'N']).optional().default('Y').describe('DBpia site auto-login preference'),
  idSave: z.enum(['Y', 'N']).optional().default('Y').describe('DBpia remember-id preference'),
};

export const SessionStatusSchema = {
  remote: z.boolean().optional().default(true).describe('Check /member/me with saved cookies when true'),
};

export const CiteSchema = {
  articleId: z.string().describe('Article ID to generate citation for'),
  style: z.enum(['chicago', 'apa', 'mla', 'bibtex', 'harvard', 'vancouver']).optional().default('chicago').describe('Citation style (default: chicago)'),
};

export const CiteasySchema = {
  articleId: z.string().describe('Article ID for citation/download pipeline'),
  style: z.enum(['chicago', 'apa', 'mla', 'bibtex', 'harvard', 'vancouver']).optional().default('chicago').describe('Citation style (default: chicago)'),
  download: z.boolean().optional().default(true).describe('Attempt PDF download before citation'),
  overwrite: z.boolean().optional().default(false).describe('Overwrite existing downloaded PDF'),
  timeoutMs: z.number().int().positive().optional().describe('Download timeout in milliseconds'),
  autoLogin: z.boolean().optional().default(false).describe('Use DBpia site-side auto-login session only; do not open interactive login when missing'),
};

export const FulltextIndexSchema = {
  articleId: z.string().describe('Article ID to index'),
  pdfPath: z.string().optional().describe('Path to PDF file (if already downloaded)'),
  ocrCommand: z.string().optional().describe('Legacy OCR CLI command template (use {input} and {output} placeholders)'),
  provider: z.enum(['auto', 'owlocr', 'tesseract', 'ocrmypdf', 'paddleocr', 'easyocr', 'google-vision', 'azure-read', 'aws-textract', 'ocr-space', 'pdftotext', 'custom']).optional().describe('OCR provider (default: auto)'),
  fallbackProviders: z.array(z.enum(['owlocr', 'tesseract', 'ocrmypdf', 'paddleocr', 'easyocr', 'google-vision', 'azure-read', 'aws-textract', 'ocr-space', 'pdftotext', 'custom'])).optional().describe('Fallback providers in order if primary fails'),
  languages: z.array(z.string()).optional().describe('OCR languages (e.g., ["ko", "en"])'),
  pages: z.union([z.string(), z.array(z.number().int().positive())]).optional().describe('Page selection: "all", "1-3", "1,3" or [1,2,3]'),
  dpi: z.number().int().positive().optional().describe('OCR DPI (default: 300)'),
  timeoutMs: z.number().int().positive().optional().describe('Provider command timeout in milliseconds'),
  commandTemplate: z.string().optional().describe('Custom command template for provider=custom'),
  providerCommands: z.record(z.string(), z.string()).optional().describe('Per-provider command templates, keyed by provider name'),
};

export const FulltextSearchSchema = {
  query: z.string().describe('Full-text search query'),
  limit: z.number().optional().default(20).describe('Max results to return'),
};

export const CheckDownloadSchema = {
  articleId: z.string().describe('Article ID to check download availability for'),
};

export const DownloadSchema = {
  articleId: z.string().describe('Article ID to download PDF for'),
  overwrite: z.boolean().optional().default(false).describe('Overwrite existing downloaded PDF'),
  timeoutMs: z.number().int().positive().optional().describe('Download timeout in milliseconds'),
  autoLogin: z.boolean().optional().default(false).describe('Use DBpia site-side auto-login session only; do not open interactive login when missing'),
};

export const DownloadLinkSchema = {
  articleId: z.string().describe('Article ID or nodeId to parse download URL for'),
  depth: z.string().optional().describe('Optional override for downloadData depth'),
  shape: z.string().optional().describe('Optional override for downloadData shape'),
  systemCode: z.string().optional().describe('Optional override for downloadData systemCode'),
};

export const PdfListSchema = {
  year: z.number().int().optional().describe('Filter by publication year'),
  journal: z.string().optional().describe('Filter by journal substring (case-insensitive)'),
  title: z.string().optional().describe('Filter by title substring (case-insensitive)'),
};

export const PdfInfoSchema = {
  id: z.string().describe('PDF ID (article:<id> or external:<id>)'),
};

export const PdfOpenSchema = {
  id: z.string().describe('PDF ID (article:<id> or external:<id>) to open'),
};

export const PdfDeleteSchema = {
  id: z.string().describe('PDF ID (article:<id> or external:<id>) to delete'),
};

export const PdfRegisterSchema = {
  pdfPath: z.string().describe('Path to PDF file to register'),
  articleId: z.string().optional().describe('Optional article ID to link this PDF to'),
  title: z.string().optional().describe('Title (required for standalone registration)'),
  authors: z.string().optional().describe('Authors (optional for standalone registration)'),
  year: z.number().int().optional().describe('Publication year (optional for standalone registration)'),
  source: z.string().optional().describe('Source label for standalone registration'),
};
