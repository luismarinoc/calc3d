import { test, expect } from '@playwright/test';

const key = 'calc3d.demo.quotes.v1';
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), key);
const primary = ['title', 'purpose', 'spoolId', 'purchasePrice', 'netWeightGrams', 'grams', 'hours', 'minutes', 'watts', 'electricityPricePerKwh', 'replacementCost', 'replacementLifetimeHours', 'errorPercent', 'multiplierPreset', 'discountType', 'discountValue', 'surchargeType', 'surchargeValue', 'save'];
const reference = { purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0', watts: '130', electricityPricePerKwh: '230', replacementCost: '220000', replacementLifetimeHours: '4320', errorPercent: '5' };

async function bounds(page, ids, withinViewport) {
  const size = page.viewportSize();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  for (const id of ids) {
    const locator = page.locator(`#${id}`);
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
    if (withinViewport) {
      expect(box.x, `${id} left`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${id} top`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${id} right`).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(size.height);
    }
  }
}

test('desktop complete draft fits with reference results and no automatic persistence', async ({ page }, info) => {
  await page.goto('/');
  if (info.project.name === 'chromium-desktop') {
    const dimensions = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth }));
    console.log('desktop initial dimensions', dimensions);
    expect(dimensions.height).toBeLessThanOrEqual(800);
    expect(dimensions.width).toBeLessThanOrEqual(1280);
    await bounds(page, primary, true);
    const result = await page.locator('#result-content').boundingBox();
    expect(result.y + result.height).toBeLessThanOrEqual(800);
    await page.screenshot({ path: 'test-results/compact-desktop-1280x800.png' });
  } else {
    await bounds(page, primary, false);
    await bounds(page, ['extraProductionCost'], false);
    await page.locator('#multiplierPreset').selectOption('custom');
    await bounds(page, ['customMultiplier'], false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
    if (info.project.name === 'webkit-phone') await page.screenshot({ path: 'test-results/compact-phone.png', fullPage: true });
  }
  for (const [id, value] of Object.entries(reference)) await page.locator(`#${id}`).fill(value);
  await page.locator('#multiplierPreset').selectOption('2');
  await expect(page.locator('#result-content')).toContainText('7.725');
  await expect(page.locator('#result-content')).toContainText('15.450');
  expect(await stored(page)).toBeNull();
});

test('tabs use keyboard navigation and save/open-copy never writes on navigation or edits', async ({ page }) => {
  await page.goto('/');
  const calculator = page.getByRole('tab', { name: 'Calculadora' });
  const history = page.getByRole('tab', { name: 'Historial' });
  await expect(calculator).toHaveAttribute('aria-selected', 'true');
  await expect(calculator).toHaveAttribute('tabindex', '0');
  await expect(page.getByRole('tabpanel', { name: 'Calculadora' })).toBeVisible();
  await history.click();
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(calculator).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('tabpanel', { name: 'Historial' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Calculadora' })).toBeHidden();
  expect(await stored(page)).toBeNull();
  await history.press('Home');
  await expect(calculator).toBeFocused();
  await calculator.press('End');
  await expect(history).toBeFocused();
  await history.press('ArrowRight');
  await expect(calculator).toBeFocused();
  await calculator.press('ArrowLeft');
  await expect(history).toBeFocused();
  await calculator.click();
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('guardado solo en este navegador');
  const snapshot = await stored(page);
  expect(JSON.parse(snapshot)).toHaveLength(1);
  await history.click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  expect(await stored(page)).toBe(snapshot);
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(calculator).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#feedback')).toContainText('Copia abierta');
  await page.locator('#grams').fill('100');
  expect(await stored(page)).toBe(snapshot);
  await history.click();
  expect(await stored(page)).toBe(snapshot);
});

test('fields have breathing room and paired controls align', async ({ page }, info) => {
  await page.goto('/');
  const spacing = await page.locator('.fields').first().evaluate(element => {
    const style = getComputedStyle(element);
    return { row: parseFloat(style.rowGap), column: parseFloat(style.columnGap) };
  });
  expect(spacing.row).toBeGreaterThanOrEqual(10);
  expect(spacing.column).toBeGreaterThanOrEqual(12);
  expect(await page.locator('label[for="hours"]').evaluate(element => parseFloat(getComputedStyle(element).gap))).toBeGreaterThanOrEqual(4);
  const watts = await page.locator('#watts').boundingBox();
  const tariff = await page.locator('#electricityPricePerKwh').boundingBox();
  expect(Math.abs(watts.y - tariff.y)).toBeLessThanOrEqual(1);
  if (info.project.name === 'chromium-desktop') {
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await page.locator('#quote-form').evaluate(element => parseFloat(getComputedStyle(element).columnGap))).toBeGreaterThanOrEqual(20);
    await bounds(page, primary, true);
  }
});

test('short desktop height scrolls to all controls rather than clipping', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await page.locator('#save').scrollIntoViewIfNeeded();
  await expect(page.locator('#save')).toBeInViewport();
  await page.locator('#replacementLifetimeHours').scrollIntoViewIfNeeded();
  await expect(page.locator('#replacementLifetimeHours')).toBeInViewport();
  await page.locator('#extraProductionCost').scrollIntoViewIfNeeded();
  await expect(page.locator('#extraProductionCost')).toBeInViewport();
});
