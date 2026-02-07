import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createDefaultOcrClient, processWithOcr, OcrClient } from '../interface.js';
import { openDb, migrate } from '../../db/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface FulltextRow {
  fulltext: string | null;
}

describe('OCR Interface', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-test-'));
    db = openDb({ dbDir: tempDir });
    migrate(db);
  });

  const mockClient: OcrClient = {
    processPdf: vi.fn().mockResolvedValue({ text: 'OCR extracted text' })
  };

  it('should successfully process OCR for an article and update database', async () => {
    // Given
    const articleId = 'NODE123';
    const pdfPath = '/path/to/test.pdf';
    db.prepare('INSERT INTO articles (id, title, pdf_path, download_status) VALUES (?, ?, ?, ?)').run(
      articleId, 'Test Article', pdfPath, 'downloaded'
    );

    // When
    const result = await processWithOcr(db, `article:${articleId}`, {}, mockClient);

    // Then
    expect(result.success).toBe(true);
    expect(result.text).toBe('OCR extracted text');
    
    const article = db.prepare('SELECT fulltext FROM articles WHERE id = ?').get(articleId) as FulltextRow;
    expect(article.fulltext).toBe('OCR extracted text');
    expect(mockClient.processPdf).toHaveBeenCalledWith(pdfPath, expect.any(Object));
  });

  it('should successfully process OCR for an external PDF and update database', async () => {
    // Given
    const externalId = 'EXT123';
    const pdfPath = '/path/to/external.pdf';
    db.prepare('INSERT INTO external_pdfs (id, title, pdf_path) VALUES (?, ?, ?)').run(
      externalId, 'External PDF', pdfPath
    );

    // When
    const result = await processWithOcr(db, `external:${externalId}`, {}, mockClient);

    // Then
    expect(result.success).toBe(true);
    
    const external = db.prepare('SELECT fulltext FROM external_pdfs WHERE id = ?').get(externalId) as FulltextRow;
    expect(external.fulltext).toBe('OCR extracted text');
  });

  it('should return error if PDF ID is not found', async () => {
    // When
    const result = await processWithOcr(db, 'article:nonexistent', {}, mockClient);

    // Then
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('should handle OCR client failures', async () => {
    // Given
    const articleId = 'NODE456';
    const pdfPath = '/path/to/fail.pdf';
    db.prepare('INSERT INTO articles (id, title, pdf_path, download_status) VALUES (?, ?, ?, ?)').run(
      articleId, 'Fail Article', pdfPath, 'downloaded'
    );
    
    const failingClient: OcrClient = {
      processPdf: vi.fn().mockRejectedValue(new Error('OCR Engine Error'))
    };

    // When
    const result = await processWithOcr(db, `article:${articleId}`, {}, failingClient);

    // Then
    expect(result.success).toBe(false);
    expect(result.message).toContain('OCR processing failed: OCR Engine Error');
  });

  it('should use fallback provider when earlier provider is not configured', async () => {
    const commands: string[] = [];
    const client = createDefaultOcrClient({
      commandTemplates: {
        tesseract: 'tesseract "{input}" stdout -l {langs} --oem 1 --psm 6'
      },
      commandExecutor: (command) => {
        commands.push(command);
        return 'fallback text';
      }
    });

    const result = await client.processPdf('/tmp/sample.pdf', {
      provider: 'auto',
      languages: ['ko', 'en']
    });

    expect(result.text).toBe('fallback text');
    expect(result.metadata?.provider).toBe('tesseract');
    expect(commands[0]).toContain('tesseract');
    expect(commands[0]).toContain('kor+eng');
  });

  it('should read OCR output from {output} file and clean it up', async () => {
    let capturedOutputPath = '';
    const client = createDefaultOcrClient({
      commandExecutor: (command) => {
        const match = command.match(/"([^"]+\.txt)"/);
        if (!match) {
          throw new Error('output path not found in command');
        }
        capturedOutputPath = match[1];
        fs.writeFileSync(capturedOutputPath, 'text from file', 'utf-8');
        return '';
      }
    });

    const result = await client.processPdf('/tmp/sample.pdf', {
      provider: 'custom',
      commandTemplate: 'mock "{output}"'
    });

    expect(result.text).toBe('text from file');
    expect(result.metadata?.provider).toBe('custom');
    expect(capturedOutputPath).not.toBe('');
    expect(fs.existsSync(capturedOutputPath)).toBe(false);
  });
});
