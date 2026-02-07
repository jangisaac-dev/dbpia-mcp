import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlaywrightManager, withPlaywright } from '../playwright.js';
import { Browser, BrowserContext, chromium } from 'playwright';

describe('PlaywrightManager', () => {
  const manager = new PlaywrightManager();

  afterEach(async () => {
    await manager.close();
  });

  it('should launch a browser', async () => {
    const browser = await manager.launch({ headless: true });
    expect(browser).toBeDefined();
    expect(manager.getBrowser()).toBe(browser);
    expect(browser.isConnected()).toBe(true);
  });

  it('should create a context', async () => {
    const context = await manager.createContext({ headless: true });
    expect(context).toBeDefined();
    expect(manager.getContext()).toBe(context);
    expect(manager.getBrowser()).toBeDefined();
  });

  it('should close browser and context', async () => {
    await manager.createContext({ headless: true });
    const browser = manager.getBrowser();
    const context = manager.getContext();
    
    await manager.close();
    
    expect(manager.getBrowser()).toBeNull();
    expect(manager.getContext()).toBeNull();
    expect(browser?.isConnected()).toBe(false);
  });

  it('should connect over CDP when endpoint is provided', async () => {
    const fakeContext = {
      close: vi.fn(async () => undefined),
      pages: vi.fn(() => [])
    } as unknown as BrowserContext;

    const fakeBrowser = {
      contexts: vi.fn(() => [fakeContext]),
      close: vi.fn(async () => undefined),
      isConnected: vi.fn(() => true)
    } as unknown as Browser;

    const connectSpy = vi.spyOn(chromium, 'connectOverCDP').mockResolvedValue(fakeBrowser);

    const browser = await manager.launch({ cdpEndpointUrl: 'http://127.0.0.1:9222' });
    const context = await manager.createContext({ cdpEndpointUrl: 'http://127.0.0.1:9222' });

    expect(browser).toBe(fakeBrowser);
    expect(context).toBe(fakeContext);
    expect(connectSpy).toHaveBeenCalledWith('http://127.0.0.1:9222');

    connectSpy.mockRestore();
  });
});

describe('withPlaywright', () => {
  it('should execute a task and close resources', async () => {
    let capturedContext: BrowserContext | null = null;
    
    const result = await withPlaywright({ headless: true }, async (context) => {
      capturedContext = context;
      expect(context).toBeDefined();
      return 'success';
    });

    expect(result).toBe('success');
    expect(capturedContext).toBeDefined();
  });
});
