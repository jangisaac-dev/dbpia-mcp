import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from 'better-sqlite3';
import { getPdfInfo } from '../pdf/manager.js';

export type OcrProvider =
  | 'auto'
  | 'owlocr'
  | 'tesseract'
  | 'ocrmypdf'
  | 'paddleocr'
  | 'easyocr'
  | 'google-vision'
  | 'azure-read'
  | 'aws-textract'
  | 'ocr-space'
  | 'pdftotext'
  | 'custom';

export interface OcrConfig {
  engine?: OcrProvider;
  backend?: string;
  provider?: OcrProvider;
  fallbackProviders?: OcrProvider[];
  languages?: string[];
  pages?: string | number[]; // e.g. "all", "1-3", "1,3,5" or [1,2,3]
  dpi?: number;
  timeoutMs?: number;
  commandTemplate?: string;
  providerCommands?: Partial<Record<OcrProvider, string>>;
}

export interface OcrResult {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface OcrClient {
  processPdf(pdfPath: string, config: OcrConfig): Promise<OcrResult>;
}

export interface OcrClientFactoryOptions {
  commandExecutor?: (command: string, timeoutMs: number) => string;
  commandTemplates?: Partial<Record<OcrProvider, string>>;
  defaultTimeoutMs?: number;
}

const AUTO_PROVIDER_CHAIN: OcrProvider[] = ['owlocr', 'tesseract', 'pdftotext'];

const DEFAULT_PROVIDER_TEMPLATES: Partial<Record<OcrProvider, string>> = {
  tesseract: 'tesseract "{input}" stdout -l {langs} --oem 1 --psm 6',
  pdftotext: 'pdftotext "{input}" -'
};

const PROVIDER_ENV_KEYS: Partial<Record<OcrProvider, string>> = {
  owlocr: 'DBPIA_OCR_CMD_OWLOCR',
  tesseract: 'DBPIA_OCR_CMD_TESSERACT',
  ocrmypdf: 'DBPIA_OCR_CMD_OCRMPDF',
  paddleocr: 'DBPIA_OCR_CMD_PADDLEOCR',
  easyocr: 'DBPIA_OCR_CMD_EASYOCR',
  'google-vision': 'DBPIA_OCR_CMD_GOOGLE_VISION',
  'azure-read': 'DBPIA_OCR_CMD_AZURE_READ',
  'aws-textract': 'DBPIA_OCR_CMD_AWS_TEXTRACT',
  'ocr-space': 'DBPIA_OCR_CMD_OCR_SPACE',
  pdftotext: 'DBPIA_OCR_CMD_PDFTOTEXT'
};

export const DEFAULT_OCR_CONFIG: OcrConfig = {
  provider: 'auto',
  languages: ['ko', 'en'],
  pages: 'all',
  dpi: 300,
  timeoutMs: 120000
};

export interface ProcessOcrResult {
  success: boolean;
  text?: string;
  message?: string;
  pdfId: string;
  provider?: OcrProvider;
}

function normalizeLanguageArg(languages: string[] | undefined): string {
  if (!languages || languages.length === 0) {
    return 'kor+eng';
  }

  const mapped = languages.map((lang) => {
    const normalized = lang.trim().toLowerCase();
    if (normalized === 'ko' || normalized === 'ko-kr' || normalized === 'kor' || normalized === 'korean') {
      return 'kor';
    }
    if (normalized === 'en' || normalized === 'en-us' || normalized === 'eng' || normalized === 'english') {
      return 'eng';
    }
    return normalized;
  });

  return mapped.join('+');
}

function resolveProviderOrder(config: OcrConfig): OcrProvider[] {
  const primary = config.provider ?? config.engine ?? 'auto';
  const configuredFallback = config.fallbackProviders ?? [];

  if (primary === 'auto') {
    return [...AUTO_PROVIDER_CHAIN, ...configuredFallback].filter((provider, index, array) => array.indexOf(provider) === index);
  }

  return [primary, ...configuredFallback].filter((provider, index, array) => array.indexOf(provider) === index);
}

function renderTemplate(template: string, inputPath: string, config: OcrConfig): { command: string; outputPath: string } {
  const outputPath = path.join(os.tmpdir(), `dbpia_ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
  const pageValue = Array.isArray(config.pages) ? config.pages.join(',') : (config.pages ?? 'all');
  const command = template
    .replaceAll('{input}', inputPath)
    .replaceAll('{output}', outputPath)
    .replaceAll('{langs}', normalizeLanguageArg(config.languages))
    .replaceAll('{dpi}', String(config.dpi ?? 300))
    .replaceAll('{pages}', pageValue);

  return { command, outputPath };
}

function getProviderTemplate(provider: OcrProvider, config: OcrConfig, factoryTemplates: Partial<Record<OcrProvider, string>>): string | undefined {
  if (provider === 'custom') {
    return config.commandTemplate;
  }

  const fromArgs = config.providerCommands?.[provider];
  if (fromArgs) {
    return fromArgs;
  }

  const envKey = PROVIDER_ENV_KEYS[provider];
  if (envKey && process.env[envKey]) {
    return process.env[envKey];
  }

  const fromFactory = factoryTemplates[provider];
  if (fromFactory) {
    return fromFactory;
  }

  return DEFAULT_PROVIDER_TEMPLATES[provider];
}

function defaultCommandExecutor(command: string, timeoutMs: number): string {
  return execSync(command, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

export function createDefaultOcrClient(options: OcrClientFactoryOptions = {}): OcrClient {
  const executor = options.commandExecutor ?? defaultCommandExecutor;
  const factoryTemplates = options.commandTemplates ?? {};
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 120000;

  return {
    async processPdf(pdfPath: string, config: OcrConfig): Promise<OcrResult> {
      const order = resolveProviderOrder(config);
      const timeoutMs = config.timeoutMs ?? defaultTimeoutMs;
      const errors: string[] = [];

      for (const provider of order) {
        const template = getProviderTemplate(provider, config, factoryTemplates);
        if (!template) {
          errors.push(`${provider}: command template not configured`);
          continue;
        }

        const { command, outputPath } = renderTemplate(template, pdfPath, config);

        try {
          const stdout = executor(command, timeoutMs);
          const outputText = fs.existsSync(outputPath)
            ? fs.readFileSync(outputPath, 'utf-8')
            : stdout;

          if (!outputText.trim()) {
            errors.push(`${provider}: no text extracted`);
            continue;
          }

          return {
            text: outputText,
            metadata: {
              provider,
              command
            }
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${provider}: ${message}`);
        } finally {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        }
      }

      throw new Error(`All OCR providers failed. ${errors.join(' | ')}`);
    }
  };
}

export async function processWithOcr(
  db: Database,
  pdfId: string,
  config: OcrConfig = {},
  client: OcrClient = createDefaultOcrClient()
): Promise<ProcessOcrResult> {
  const fullConfig = { ...DEFAULT_OCR_CONFIG, ...config };
  const pdfInfo = getPdfInfo(db, pdfId);

  if (!pdfInfo) {
    return {
      success: false,
      message: `PDF with ID ${pdfId} not found or not downloaded.`,
      pdfId
    };
  }

  if (!pdfInfo.pdfPath) {
    return {
      success: false,
      message: `PDF path for ID ${pdfId} is missing.`,
      pdfId
    };
  }

  try {
    const result = await client.processPdf(pdfInfo.pdfPath, fullConfig);
    const provider = (result.metadata?.provider as OcrProvider | undefined);
    
    if (pdfId.startsWith('article:')) {
      const articleId = pdfId.replace('article:', '');
      db.prepare('UPDATE articles SET fulltext = ? WHERE id = ?').run(result.text, articleId);
    } else if (pdfId.startsWith('external:')) {
      const externalId = pdfId.replace('external:', '');
      db.prepare('UPDATE external_pdfs SET fulltext = ? WHERE id = ?').run(result.text, externalId);
    }

    return {
      success: true,
      text: result.text,
      pdfId,
      provider
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `OCR processing failed: ${message}`,
      pdfId
    };
  }
}
