import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { getPdfBasePath, sanitizePath, buildPdfPath } from '../pathUtils.js';

describe('pathUtils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getPdfBasePath', () => {
    it('should return path from environment variable if set', () => {
      const customPath = '/custom/pdf/path';
      process.env.DBPIA_PDF_PATH = customPath;
      expect(getPdfBasePath()).toBe(path.resolve(customPath));
    });

    it('should return default path if environment variable is not set', () => {
      delete process.env.DBPIA_PDF_PATH;
      const expected = path.join(os.homedir(), '.dbpia-mcp', 'pdfs');
      expect(getPdfBasePath()).toBe(expected);
    });
  });

  describe('sanitizePath', () => {
    it('should replace forbidden characters with underscore', () => {
      const input = 'Year: 2023 / Journal? *Name* <Value> | "quoted"';
      const expected = 'Year_ 2023 _ Journal_ _Name_ _Value_ _ _quoted_';
      expect(sanitizePath(input)).toBe(expected);
    });

    it('should trim leading and trailing spaces', () => {
      expect(sanitizePath('  some name  ')).toBe('some name');
    });
  });

  describe('buildPdfPath', () => {
    it('should build correct hierarchical path', () => {
      process.env.DBPIA_PDF_PATH = '/base';
      const result = buildPdfPath('2023', 'Journal Name', 'A123');
      expect(result).toBe(path.join('/base', '2023', 'Journal Name', 'A123', 'A123.pdf'));
    });

    it('should sanitize segments when building path', () => {
      process.env.DBPIA_PDF_PATH = '/base';
      const result = buildPdfPath('2023:', 'Journal/Name', 'A:123');
      expect(result).toBe(path.join('/base', '2023_', 'Journal_Name', 'A_123', 'A_123.pdf'));
    });
  });
});
