import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export async function openInBrowser(url: string): Promise<{ success: boolean; message: string }> {
  const platform = os.platform();
  
  try {
    if (platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else if (platform === 'win32') {
      await execAsync(`start "" "${url}"`);
    } else {
      await execAsync(`xdg-open "${url}"`);
    }
    
    return {
      success: true,
      message: `Opened in browser: ${url}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to open browser: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function getArticleUrl(articleId: string): string {
  return `https://www.dbpia.co.kr/journal/articleDetail?nodeId=${articleId}`;
}

export function getPdfDownloadUrl(articleId: string): string {
  return `https://www.dbpia.co.kr/pdf/pdfView?nodeId=${articleId}`;
}
