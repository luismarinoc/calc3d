import { test, expect } from '@playwright/test';

const pairs = [
  ['purchasePrice', 'netWeightGrams'],
  ['discountType', 'discountValue'],
  ['surchargeType', 'surchargeValue'],
];

test('locally paired captions and controls align without shifting other groups', async ({ page }, info) => {
  await page.goto('/');
  for (const [first, second] of pairs) {
    const aLabel = await page.locator(`label[for="${first}"]`).boundingBox();
    const bLabel = await page.locator(`label[for="${second}"]`).boundingBox();
    const a = await page.locator(`#${first}`).boundingBox();
    const b = await page.locator(`#${second}`).boundingBox();
    expect(Math.abs(aLabel.y - bLabel.y), `${first}/${second} caption tops`).toBeLessThanOrEqual(1);
    expect(Math.abs(a.y - b.y), `${first}/${second} control tops`).toBeLessThanOrEqual(1);
    expect(Math.abs(a.height - b.height), `${first}/${second} control heights`).toBeLessThanOrEqual(1);
    expect(Math.abs(a.width - b.width), `${first}/${second} equal widths`).toBeLessThanOrEqual(1);
    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(a.height).toBeGreaterThanOrEqual(44);
  }
  const multiplier = page.locator('#multiplierPreset');
  await expect(multiplier).toBeVisible();
  await multiplier.selectOption('custom');
  await expect(page.locator('#customMultiplier')).toBeVisible();
  const custom = await page.locator('#customMultiplier').boundingBox();
  const discount = await page.locator('#discountType').boundingBox();
  expect(discount.y).toBeGreaterThan(custom.y + custom.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'chromium-desktop') {
    await expect(page.locator('#extraProductionCost')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#save')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
    await page.screenshot({ path: info.outputPath('field-pairs.png') });
  }
});
