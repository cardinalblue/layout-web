import { chromium, type Browser, type Page } from 'playwright';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function getPage(baseUrl?: string): Promise<Page> {
  const b = await getBrowser();
  const page = await b.newPage();
  if (baseUrl) {
    await page.goto(baseUrl);
  }
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
