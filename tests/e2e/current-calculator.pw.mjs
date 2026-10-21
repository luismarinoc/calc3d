import { test, expect } from '@playwright/test';
import { setPrinterCosts } from './printer-fixtures.mjs';

const quoteKey = 'calc3d.demo.quotes.v1';
const bytes = (page, key) => page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
const amount = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');

async function seedLegacy(page, fields = {}) {
  await page.evaluate(async (overrides) => {
    const { evaluate } = await import('/src/ui/quote.mjs');
    const { createDemoHistory } = await import('/src/data/demo.mjs');
    const { demoSpools } = await import('/src/ui/quote.mjs');
    const history = createDemoHistory({ getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
    const result = evaluate({ title: 'Cotización histórica', spoolId: 'demo-petg', purpose: 'sale',
      purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0',
      watts: '130', electricityPricePerKwh: '230', depreciationPerHour: '0', maintenancePerHour: '0',
      laborMinutes: '0', laborRatePerHour: '0', extraProductionCost: '0', markupPercent: '35',
      discountType: 'percent', discountValue: '0', surchargeType: 'percent', surchargeValue: '0', ...overrides }, demoSpools);
    if (result.error || !history.save(result).ok) throw Error(result.error || 'Legacy fixture save failed');
  }, fields);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).first().click();
}

test('new and reloaded drafts expose reference example directly', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#calculationMode')).toBeHidden();
  for (const id of ['printerProfile', 'errorPercent', 'multiplierPreset']) await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.locator('#multiplierPreset')).toHaveValue('2');
  await setPrinterCosts(page, { electricityPricePerKwh: 230 });
  for (const [id, value] of Object.entries({ purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0' })) await page.locator(`#${id}`).fill(value);
  await expect(amount(page, 'Costo total')).toContainText('7.725');
  await expect(amount(page, 'Precio final estimado')).toContainText('15.450');
  await page.screenshot({ path: testInfo.outputPath('current-reference.png'), fullPage: true });
  expect(await bytes(page, quoteKey)).toBeNull();
  await page.reload();
  await expect(page.locator('#calculationMode')).toBeHidden();
  await expect(page.locator('#replacementLifetimeHours')).toBeHidden();
  await expect(page.locator('#multiplierPreset')).toHaveValue('2');
  await expect(page.locator('#legacy-markup')).toBeHidden();
});

test('historical copy remains legacy without writes; deliberate current draft and reload use reference', async ({ page }, testInfo) => {
  await page.goto('/');
  await seedLegacy(page);
  const original = await bytes(page, quoteKey);
  const purchases = await bytes(page, 'calc3d.demo.purchases.v1');
  await expect(amount(page, 'Costo total')).toContainText('6.797');
  await expect(amount(page, 'Precio final estimado')).toContainText('9.176');
  await expect(page.locator('#legacy-notice')).toBeVisible();
  await expect(page.locator('#legacy-markup')).toBeVisible();
  await expect(page.locator('#reference-expenses')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('historical-copy.png'), fullPage: true });
  expect(await bytes(page, quoteKey)).toBe(original);
  await page.locator('#grams').fill('300');
  expect(await bytes(page, quoteKey)).toBe(original);
  await page.getByRole('button', { name: 'Iniciar cálculo actual' }).click();
  await expect(page.locator('#legacy-notice')).toBeHidden();
  await expect(page.locator('#replacementLifetimeHours')).toBeHidden();
  await expect(page.locator('#multiplierPreset')).toHaveValue('2');
  await expect(page.locator('#legacy-markup')).toBeHidden();
  await expect(page.locator('#calculationMode')).toBeHidden();
  expect(await bytes(page, quoteKey)).toBe(original);
  expect(await bytes(page, 'calc3d.demo.purchases.v1')).toBe(purchases);
  await page.reload();
  await expect(page.locator('#reference-expenses')).toBeVisible();
  await expect(page.locator('#legacy-notice')).toBeHidden();
  expect(await bytes(page, quoteKey)).toBe(original);
});
