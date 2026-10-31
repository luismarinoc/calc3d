import { expect } from './supabase-fixture.mjs';

/** Configure costs through the public printer settings screen, never browser storage. */
export async function setPrinterCosts(page, changes) {
  const original = new URL(page.url()).pathname;
  // Do not cancel this document's admission by leaving before bootstrap finishes.
  await expect(page.locator('.account-nav')).toBeVisible();
  await expect(page.locator('main')).toHaveJSProperty('inert', false);
  await page.goto('/settings.html');
  await expect(page.locator('#edit-printer')).toBeEnabled();
  await page.locator('#edit-printer').click();
  for (const [key, value] of Object.entries(changes)) await page.locator(`#printer-${key}`).fill(String(value));
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('guardada');
  await page.goto(original);
  await expect(page.locator('#save')).toBeEnabled();
}
