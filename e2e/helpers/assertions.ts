import type { Page } from 'playwright';
import { expect } from 'vitest';

export async function expectVisible(page: Page, selector: string) {
  const el = page.locator(selector);
  await expect(el).toBeDefined();
  const isVisible = await el.isVisible();
  expect(isVisible).toBe(true);
}

export async function expectText(page: Page, selector: string, text: string) {
  const el = page.locator(selector);
  const content = await el.textContent();
  expect(content).toContain(text);
}

export async function expectNoConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  // Give time for errors to surface
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
}
