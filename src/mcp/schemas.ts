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
  remoteFallback: z.boolean().optional().default(true).describe('Fallback to remote search if no local results'),
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
