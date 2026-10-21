import { test, expect } from '@playwright/test';

const rows = [
  [['title'], ['hours', 'minutes'], ['multiplierPreset']],
  [['purpose', 'client-toggle'], ['printerProfile'], []],
  [[], ['watts', 'electricityPricePerKwh'], ['discountType', 'discountValue']],
  [['spoolId'], ['replacementCost', 'replacementLifetimeHours'], ['surchargeType', 'surchargeValue']],
  [['purchasePrice', 'netWeightGrams'], ['errorPercent'], []],
  [['grams'], ['extraProductionCost'], []],
];

async function geometry(page) {
  const box = async id => page.locator(`#${id}`).boundingBox();
  for (const group of rows) {
    const boxes = (await Promise.all(group.flat().map(box)));
    for (const control of boxes) expect(control.height).toBeGreaterThanOrEqual(44);
    for (const control of boxes.slice(1)) expect(Math.abs(control.y - boxes[0].y), `${group.flat().join(', ')} control tops`).toBeLessThanOrEqual(1);
    const labels = await Promise.all(group.flat().filter(id => id !== 'client-toggle').map(id => page.locator(`label[for="${id}"]`).boundingBox()));
    for (const label of labels.slice(1)) expect(Math.abs(label.y - labels[0].y), `${group.flat().join(', ')} caption tops`).toBeLessThanOrEqual(1);
  }
  const [a, b, c] = await Promise.all(['#title', '.time-pair', '#multiplierPreset'].map(selector => page.locator(selector).boundingBox()));
  expect(a.width, 'equal desktop columns').toBeCloseTo(b.width, 0);
  expect(a.width, 'equal desktop columns').toBeCloseTo(c.width, 0);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.x).toBeGreaterThan(b.x + b.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
}

test('each visible desktop caption hugs its own control', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.goto('/');
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    for (const id of rows.flat(2).filter(id => id !== 'client-toggle')) {
      const gap = await page.locator(`label[for="${id}"]`).evaluate((label, controlId) => {
        const text = label.firstChild;
        const range = document.createRange();
        range.selectNodeContents(text);
        return document.getElementById(controlId).getBoundingClientRect().top - range.getBoundingClientRect().bottom;
      }, id);
      expect(gap, `${width}px ${id} caption-to-control gap`).toBeGreaterThanOrEqual(4);
      expect(gap, `${width}px ${id} caption-to-control gap`).toBeLessThanOrEqual(8);
    }
  }
});

test('real shared horizontal rows align desktop controls and captions', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.goto('/');
  await geometry(page);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    await geometry(page);
    for (const id of ['extraProductionCost', 'save']) await expect(page.locator(`#${id}`)).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(page.viewportSize().height);
    await page.screenshot({ path: info.outputPath(`shared-${width}.png`) });
  }
  await page.locator('#multiplierPreset').selectOption('custom');
  await expect(page.locator('#customMultiplier')).toBeVisible();
  await expect(page.locator('#discountType')).toBeInViewport();
  await page.locator('#client-toggle').click();
  await expect(page.locator('#client-name')).toBeVisible();
  await expect(page.locator('#client-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#purpose').selectOption('gift');
  await expect(page.locator('#commercial')).toHaveAttribute('disabled', '');
  await expect(page.locator('#multiplierPreset')).toBeDisabled();
  await expect(page.locator('#discountType')).toBeDisabled();
  await expect(page.locator('#save')).toBeVisible();
});

test('responsive layout keeps every field reachable without horizontal overflow', async ({ page }, info) => {
  test.skip(info.project.name === 'chromium-desktop');
  await page.goto('/');
  for (const id of ['title', 'spoolId', 'grams', 'hours', 'extraProductionCost', 'multiplierPreset', 'save']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: info.outputPath(`shared-${info.project.name}.png`), fullPage: true });
});
