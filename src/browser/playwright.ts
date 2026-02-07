import { chromium, Browser, BrowserContext, LaunchOptions } from 'playwright';

export interface PlaywrightOptions {
  headless?: boolean;
  storageState?: string;
  cdpEndpointUrl?: string;
}

export class PlaywrightManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private attachedViaCdp = false;

  async launch(options: PlaywrightOptions = {}): Promise<Browser> {
    const cdpEndpointUrl = options.cdpEndpointUrl ?? process.env.DBPIA_CHROME_CDP_URL;
    if (cdpEndpointUrl) {
      this.browser = await chromium.connectOverCDP(cdpEndpointUrl);
      this.attachedViaCdp = true;
      return this.browser;
    }

    const headless = options.headless ?? process.env.DBPIA_HEADLESS !== 'false';
    
    const launchOptions: LaunchOptions = {
      headless,
    };

    this.browser = await chromium.launch(launchOptions);
    this.attachedViaCdp = false;
    return this.browser;
  }

  async createContext(options: PlaywrightOptions = {}): Promise<BrowserContext> {
    if (!this.browser) {
      await this.launch(options);
    }

    if (!this.browser) {
      throw new Error('Failed to launch browser');
    }

    if (this.attachedViaCdp) {
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        return this.context;
      }
    }

    this.context = await this.browser.newContext({
      storageState: options.storageState,
    });

    return this.context;
  }

  async close(): Promise<void> {
    if (this.context && !this.attachedViaCdp) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.attachedViaCdp = false;
    this.context = null;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }
}

export async function withPlaywright<T>(
  options: PlaywrightOptions,
  task: (context: BrowserContext) => Promise<T>
): Promise<T> {
  const manager = new PlaywrightManager();
  try {
    const context = await manager.createContext(options);
    return await task(context);
  } finally {
    await manager.close();
  }
}
