import { test, expect } from '@playwright/test';
import { setPrinterCosts } from './printer-fixtures.mjs';

const key = 'calc3d.demo.quotes.v1';
const bytes = (page) => page.evaluate((name) => localStorage.getItem(name), key);
const amount = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');

test('optional blanks calculate as zeros; gift save, reload and copy retain cost without revenue', async ({ page }) => {
  await page.goto('/');
  await setPrinterCosts(page, { electricityPricePerKwh: 230 });
  for (const [id, value] of Object.entries({ purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0' })) await page.locator(`#${id}`).fill(value);
  await expect(amount(page, 'Costo total')).toContainText('7.725');
  await expect(amount(page, 'Precio final estimado')).toContainText('15.450');
  for (const id of ['minutes', 'discountValue', 'surchargeValue']) await page.locator(`#${id}`).fill('');
  await page.locator('#extraProductionCost').fill('');
  await expect(page.locator('#save')).toBeEnabled();
  await expect(amount(page, 'Costo total')).toContainText('7.725');
  await page.locator('#purpose').selectOption('gift');
  await expect(page.locator('#commercial')).toHaveAttribute('disabled', '');
  await expect(page.locator('#discountValue')).toBeDisabled();
  await expect(amount(page, 'Costo de regalo estimado')).toContainText('7.725');
  await expect(amount(page, 'Precio final estimado')).toHaveCount(0);
  expect(await bytes(page)).toBeNull();
  await page.locator('#grams').fill('');
  await expect(page.locator('#form-error')).toHaveText('Ingresa un valor para Gramos consumidos.');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await bytes(page)).toBeNull();
  await page.locator('#grams').fill('294');
  await page.locator('#save').click();
  const snapshot = await bytes(page);
  const gift = JSON.parse(snapshot)[0];
  expect(gift.input.purpose).toBe('gift');
  expect(gift.result.totalCost).toBe(7724.94);
  expect(gift.result.giftCost).toBe(7724.94);
  expect(gift.result.finalPrice).toBe(0);
  expect(gift.result.commercialProfit).toBe(0);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item p')).toContainText('Regalo · costo');
  await expect(page.locator('.history-item p')).not.toContainText('precio');
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item p')).toContainText('Regalo · costo');
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#purpose')).toHaveValue('gift');
  await expect(amount(page, 'Costo de regalo estimado')).toContainText('7.725');
  expect(await bytes(page)).toBe(snapshot);
});

test('historical sale copy can become a gift without losing its integer production cost or old record', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { evaluate } = await import('/src/ui/quote.mjs');
    const { createDemoHistory } = await import('/src/data/demo.mjs');
    const history = createDemoHistory({ getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
    const old = evaluate({ title: 'Anterior', spoolId: 'demo-petg', purpose: 'sale', purchasePrice: '22000', netWeightGrams: '1000',
      grams: '294', hours: '11', minutes: '0', watts: '130', electricityPricePerKwh: '230', markupPercent: '35',
      discountType: 'percent', discountValue: '0', surchargeType: 'percent', surchargeValue: '0' });
    if (old.error || !history.save(old).ok) throw Error(old.error || 'No se guardó la copia histórica.');
  });
  const oldBytes = await bytes(page);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#legacy-notice')).toBeVisible();
  await page.locator('#purpose').selectOption('gift');
  await expect(amount(page, 'Costo de regalo estimado')).toContainText('6.797');
  await expect(amount(page, 'Precio final estimado')).toHaveCount(0);
  expect(await bytes(page)).toBe(oldBytes);
  await page.locator('#save').click();
  const records = JSON.parse(await bytes(page));
  expect(records[0].input.purpose).toBe('gift');
  expect(records[0].result.totalCost).toBe(6797);
  expect(records[0].result.finalPrice).toBe(0);
  expect(JSON.stringify(records[1])).toBe(JSON.stringify(JSON.parse(oldBytes)[0]));
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item p').first()).toContainText('Regalo');
  await expect(page.locator('.history-item p').last()).toContainText('Venta');
});
