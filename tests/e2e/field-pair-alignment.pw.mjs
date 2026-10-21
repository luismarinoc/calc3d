import { signedInTest as test, expect } from './supabase-fixture.mjs';

const pairs = [
  ['purchasePrice', 'netWeightGrams'],
  ['discountType', 'discountValue'],
  ['surchargeType', 'surchargeValue'],
];

test('locally paired captions and controls align without shifting other groups', async ({ page }, info) => {
  await page.goto('/');
  // The authenticated catalog marks completion of async page initialization before measuring.
  await expect(page.locator('#spoolId option')).toHaveCount(2);
  for (const [first, second] of pairs) {
    const aLabel = await page.locator(`label[for="${first}"]`).boundingBox();
    const bLabel = await page.locator(`label[for="${second}"]`).boundingBox();
    const a = await page.locator(`#${first}`).boundingBox();
    const b = await page.locator(`#${second}`).boundingBox();
    for (const id of [first, second]) {
      const gap = await page.locator(`label[for="${id}"]`).evaluate((label, controlId) => {
        const range = document.createRange();
        range.selectNodeContents(label.firstChild);
        return document.getElementById(controlId).getBoundingClientRect().top - range.getBoundingClientRect().bottom;
      }, id);
      expect(gap, `${id} caption gap`).toBeGreaterThanOrEqual(4);
      expect(gap, `${id} caption gap`).toBeLessThanOrEqual(8);
    }
    expect(Math.abs(aLabel.y + aLabel.height - bLabel.y - bLabel.height), `${first}/${second} aligned label bottoms`).toBeLessThanOrEqual(1);
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
  if (page.viewportSize().width > 1050) expect(custom.y).toBeGreaterThanOrEqual(discount.y + discount.height);
  else expect(discount.y).toBeGreaterThanOrEqual(custom.y + custom.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'chromium-desktop') {
    await expect(page.locator('#extraProductionCost')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#save')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
    await page.screenshot({ path: info.outputPath('field-pairs.png') });
  }
});
