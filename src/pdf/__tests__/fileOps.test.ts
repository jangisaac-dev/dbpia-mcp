import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ensureDir, movePdf, deletePdf, openPdf } from '../fileOps.js';
import { exec } from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn((cmd, cb) => {
    if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
  }),
}));

describe('fileOps', () => {
  let tempBase: string;

  beforeEach(async () => {
    tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'dbpia-pdf-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempBase, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('ensureDir', () => {
    it('should create directory recursively', async () => {
      const nested = path.join(tempBase, 'a', 'b', 'c');
      await ensureDir(nested);
      const stat = await fs.stat(nested);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('movePdf', () => {
    it('should move file and create destination directory', async () => {
      const src = path.join(tempBase, 'temp.pdf');
      const dest = path.join(tempBase, 'final', 'article.pdf');
      await fs.writeFile(src, 'pdf content');

      await movePdf(src, dest);

      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('pdf content');
      await expect(fs.access(src)).rejects.toThrow();
    });

    it('should fallback to copy+unlink if rename fails with EXDEV', async () => {
      const src = path.join(tempBase, 'temp.pdf');
      const dest = path.join(tempBase, 'final', 'article.pdf');
      await fs.writeFile(src, 'pdf content');

      // Mock rename to fail with EXDEV once
      const spy = vi.spyOn(fs, 'rename').mockRejectedValueOnce({ code: 'EXDEV' });

      await movePdf(src, dest);

      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('pdf content');
      await expect(fs.access(src)).rejects.toThrow();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('deletePdf', () => {
    it('should delete existing file', async () => {
      const file = path.join(tempBase, 'to-delete.pdf');
      await fs.writeFile(file, 'content');
      await deletePdf(file);
      await expect(fs.access(file)).rejects.toThrow();
    });

    it('should not throw if file does not exist', async () => {
      const nonExistent = path.join(tempBase, 'ghost.pdf');
      await expect(deletePdf(nonExistent)).resolves.not.toThrow();
    });
  });

  describe('openPdf', () => {
    it('should call exec with correct command', async () => {
      const pdfPath = '/path/to/doc.pdf';
      await openPdf(pdfPath);
      
      const platform = os.platform();
      let expectedCmd: string;
      if (platform === 'darwin') {
        expectedCmd = `open "${pdfPath}"`;
      } else if (platform === 'win32') {
        expectedCmd = `start "" "${pdfPath}"`;
      } else {
        expectedCmd = `xdg-open "${pdfPath}"`;
      }

      expect(exec).toHaveBeenCalledWith(expectedCmd, expect.any(Function));
    });
  });
});
