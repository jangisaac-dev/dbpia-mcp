export type CitationStyle = 'chicago' | 'apa' | 'mla' | 'bibtex' | 'harvard' | 'vancouver';

export interface ArticleMetadata {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  volume?: string;
  issue?: string;
  pages?: string;
  year: number;
  doi?: string;
  url?: string;
  publisher?: string;
  abstract?: string;
}

export interface CitationResult {
  style: CitationStyle;
  citation: string;
  metadata: ArticleMetadata;
}

function formatAuthorsChicago(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  return `${authors[0]} et al.`;
}

function formatAuthorsApa(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]}, & ${authors[1]}`;
  if (authors.length <= 7) {
    const allButLast = authors.slice(0, -1).join(', ');
    return `${allButLast}, & ${authors[authors.length - 1]}`;
  }
  return `${authors.slice(0, 6).join(', ')}, ... ${authors[authors.length - 1]}`;
}

function formatAuthorsMla(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]}, and ${authors[1]}`;
  return `${authors[0]}, et al.`;
}

function formatAuthorsBibtex(authors: string[]): string {
  return authors.join(' and ');
}

function sanitizeBibtexKey(title: string, year: number): string {
  const firstWord = title.split(/\s+/)[0]?.replace(/[^a-zA-Z가-힣]/g, '') || 'unknown';
  return `${firstWord}${year}`;
}

export function formatCitation(metadata: ArticleMetadata, style: CitationStyle = 'chicago'): CitationResult {
  let citation: string;

  switch (style) {
    case 'chicago':
      citation = formatChicago(metadata);
      break;
    case 'apa':
      citation = formatApa(metadata);
      break;
    case 'mla':
      citation = formatMla(metadata);
      break;
    case 'bibtex':
      citation = formatBibtex(metadata);
      break;
    case 'harvard':
      citation = formatHarvard(metadata);
      break;
    case 'vancouver':
      citation = formatVancouver(metadata);
      break;
    default:
      citation = formatChicago(metadata);
  }

  return { style, citation, metadata };
}

function formatChicago(m: ArticleMetadata): string {
  const authors = formatAuthorsChicago(m.authors);
  const volumeIssue = m.volume ? ` ${m.volume}` + (m.issue ? `, no. ${m.issue}` : '') : '';
  const pages = m.pages ? `: ${m.pages}` : '';
  const doi = m.doi ? ` https://doi.org/${m.doi}.` : '';

  return `${authors}. "${m.title}." ${m.journal}${volumeIssue} (${m.year})${pages}.${doi}`;
}

function formatApa(m: ArticleMetadata): string {
  const authors = formatAuthorsApa(m.authors);
  const volumeIssue = m.volume ? `, ${m.volume}` + (m.issue ? `(${m.issue})` : '') : '';
  const pages = m.pages ? `, ${m.pages}` : '';
  const doi = m.doi ? ` https://doi.org/${m.doi}` : '';

  return `${authors} (${m.year}). ${m.title}. ${m.journal}${volumeIssue}${pages}.${doi}`;
}

function formatMla(m: ArticleMetadata): string {
  const authors = formatAuthorsMla(m.authors);
  const volumeIssue = m.volume ? `, vol. ${m.volume}` + (m.issue ? `, no. ${m.issue}` : '') : '';
  const pages = m.pages ? `, pp. ${m.pages}` : '';

  return `${authors}. "${m.title}." ${m.journal}${volumeIssue}, ${m.year}${pages}.`;
}

function formatBibtex(m: ArticleMetadata): string {
  const key = sanitizeBibtexKey(m.title, m.year);
  const authors = formatAuthorsBibtex(m.authors);

  const lines = [
    `@article{${key},`,
    `  author = {${authors}},`,
    `  title = {${m.title}},`,
    `  journal = {${m.journal}},`,
    `  year = {${m.year}},`,
  ];

  if (m.volume) lines.push(`  volume = {${m.volume}},`);
  if (m.issue) lines.push(`  number = {${m.issue}},`);
  if (m.pages) lines.push(`  pages = {${m.pages}},`);
  if (m.doi) lines.push(`  doi = {${m.doi}},`);
  if (m.url) lines.push(`  url = {${m.url}},`);

  lines.push('}');
  return lines.join('\n');
}

function formatHarvard(m: ArticleMetadata): string {
  const authors = formatAuthorsApa(m.authors);
  const volumeIssue = m.volume ? `, ${m.volume}` + (m.issue ? `(${m.issue})` : '') : '';
  const pages = m.pages ? `, pp. ${m.pages}` : '';

  return `${authors} ${m.year}, '${m.title}', ${m.journal}${volumeIssue}${pages}.`;
}

function formatVancouver(m: ArticleMetadata): string {
  const authors = m.authors.slice(0, 6).join(', ') + (m.authors.length > 6 ? ', et al.' : '');
  const volumeIssue = m.volume ? `;${m.volume}` + (m.issue ? `(${m.issue})` : '') : '';
  const pages = m.pages ? `:${m.pages}` : '';

  return `${authors}. ${m.title}. ${m.journal}. ${m.year}${volumeIssue}${pages}.`;
}

export function getAllStyles(): CitationStyle[] {
  return ['chicago', 'apa', 'mla', 'bibtex', 'harvard', 'vancouver'];
}
