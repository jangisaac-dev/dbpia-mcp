export interface NormalizedArticle {
  id: string;
  title: string;
  authors: string[];
  year?: string;
  publisher?: string;
  url?: string;
  preview_url?: string;
  keywords?: string[];
  abstract?: string | null;
  raw_json: any;
}

export interface DbpiaNormalizationResult {
  items: NormalizedArticle[];
  raw_json: any;
  meta?: {
    total?: number;
    status?: {
      code: string;
      message: string;
    };
  };
}
