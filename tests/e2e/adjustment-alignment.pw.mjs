import { test, expect } from '@playwright/test';

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
