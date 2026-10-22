import { signedInTest as test, expect } from './supabase-fixture.mjs';

test('discount shares the Imprevistos row in default and custom modes on wide layouts', async ({ page }, info) => {
  test.skip(!['chromium-desktop', 'webkit-ipad-landscape'].includes(info.project.name));
  await page.goto('/');
  // Measure only after authenticated catalog and account navigation have mounted.
  await expect(page.locator('#spoolId option')).toHaveCount(2);
  await expect(page.locator('.account-nav')).toBeVisible();
  const box = async selector => page.locator(selector).boundingBox();
  for (const mode of ['default', 'custom']) {
    if (mode === 'custom') await page.locator('#multiplierPreset').selectOption('custom');
    const [preset, custom, printer, unforeseen, type, value, extras, surcharge] = await Promise.all([
      '#multiplierPreset', '#customMultiplier', '#printerProfile', '#errorPercent',
      '#discountType', '#discountValue', '#extraProductionCost', '#surchargeType',
    ].map(box));
    expect(Math.abs(type.y - unforeseen.y), `${mode} discount type / Imprevistos`).toBeLessThanOrEqual(1);
    expect(Math.abs(value.y - unforeseen.y), `${mode} discount value / Imprevistos`).toBeLessThanOrEqual(1);
    expect(type.x).toBeGreaterThan(unforeseen.x + unforeseen.width);
    expect(Math.abs(surcharge.y - extras.y), `${mode} Recargo / Otros costos`).toBeLessThanOrEqual(1);
    for (const control of [type, value]) expect(control.height).toBeGreaterThanOrEqual(44);
    expect(value.x).toBeGreaterThan(type.x + type.width);
    expect(type.y).toBeGreaterThan(printer.y + printer.height);
    expect(surcharge.y).toBeGreaterThan(type.y + type.height);
    if (mode === 'custom') {
      expect(custom.y).toBeGreaterThanOrEqual(preset.y + preset.height);
      expect(custom.y).toBeLessThan(type.y);
      expect(custom.y + custom.height).toBeLessThanOrEqual(type.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name === 'chromium-desktop') {
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
      await page.screenshot({ path: info.outputPath(`discount-${mode}-desktop.png`) });
    }
  }
});

test('discount and surcharge each align their own type and value in one row', async ({ page }, info) => {
  await page.goto('/');
  const multiplier = await page.locator('#multiplierPreset').boundingBox();
  let previousBottom = multiplier.y + multiplier.height;
  for (const prefix of ['discount', 'surcharge']) {
    const type = page.locator(`#${prefix}Type`);
    const value = page.locator(`#${prefix}Value`);
    await expect(type).toBeVisible();
    await expect(value).toBeVisible();
    const left = await type.boundingBox();
    const right = await value.boundingBox();
    expect(Math.abs(left.y - right.y), `${prefix} paired row`).toBeLessThanOrEqual(1);
    expect(right.x).toBeGreaterThan(left.x + left.width);
    expect(left.y).toBeGreaterThan(previousBottom);
    expect(left.height).toBeGreaterThanOrEqual(44);
    expect(right.height).toBeGreaterThanOrEqual(44);
    previousBottom = right.y + right.height;
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'chromium-desktop') {
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
    await page.screenshot({ path: info.outputPath('aligned.png') });
  }
});
