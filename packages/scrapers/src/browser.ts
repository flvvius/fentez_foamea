import type { Browser, BrowserContext } from "playwright";

export class LazyBrowser {
  private browser: Browser | null = null;

  async context(userAgent: string): Promise<BrowserContext> {
    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser.newContext({ userAgent, locale: "ro-RO", timezoneId: "Europe/Bucharest" });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
