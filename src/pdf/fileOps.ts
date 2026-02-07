import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function movePdf(tempPath: string, finalPath: string): Promise<void> {
  await ensureDir(path.dirname(finalPath));
  try {
    await fs.rename(tempPath, finalPath);
  } catch (error: any) {
    if (error.code === 'EXDEV') {
      await fs.copyFile(tempPath, finalPath);
      await fs.unlink(tempPath);
    } else {
      throw error;
    }
  }
}

export async function deletePdf(pdfPath: string): Promise<void> {
  try {
    await fs.unlink(pdfPath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function openPdf(pdfPath: string): Promise<{ success: boolean; message: string }> {
  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      await execAsync(`open "${pdfPath}"`);
    } else if (platform === 'win32') {
      await execAsync(`start "" "${pdfPath}"`);
    } else {
      await execAsync(`xdg-open "${pdfPath}"`);
    }
    return { success: true, message: `Opened PDF: ${pdfPath}` };
  } catch (error) {
    return {
      success: false,
      message: `Failed to open PDF: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
