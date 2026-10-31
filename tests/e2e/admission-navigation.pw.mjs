import { signedInTest as test, expect, remoteQuotes } from './supabase-fixture.mjs';
import { setPrinterCosts } from './printer-fixtures.mjs';

test('printer setup waits for current-page admission before navigating', async ({ page }) => {
  const errors = [], failures = [];
  let release, captured;
  const held = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { captured = resolve; });
  let first = true, configure;
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().endsWith('/rpc/calc3d_access_status')) failures.push(request.failure()?.errorText);
  });
  page.on('request', request => {
    if (request.isNavigationRequest() && new URL(request.url()).pathname === '/settings.html') release();
  });
  await page.route('**/rpc/calc3d_access_status', async route => {
    if (first) { first = false; captured(); await held; }
    await route.fallback();
  });
  try {
    await page.goto('/'); await seen;
    await expect(page.locator('main')).toHaveJSProperty('inert', true);
    configure = setPrinterCosts(page, { watts: 130 });
    // A held admission must prevent the helper from leaving this document.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page).toHaveURL('/');
    await expect(page.locator('main')).toHaveJSProperty('inert', true);
    release();
    await configure;
    await expect(page).toHaveURL('/');
    await expect(page.locator('.account-nav')).toBeVisible();
    await expect(page.locator('#save')).toBeEnabled();
    expect(await remoteQuotes(page)).toEqual([]);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
  } finally { release(); if (configure) await configure; }
});
