import { signedInTest as test, expect, remoteQuotes, setQuoteProfilePrice } from './supabase-fixture.mjs';
import { setPrinterCosts } from './printer-fixtures.mjs';

const bytes = async page => { const rows = await remoteQuotes(page); return rows.length ? JSON.stringify(rows) : null; };
const row = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });
const amount = async (page, label) => (await row(page, label).locator('strong').textContent()).replace(/[^\d.,-]/g, '');
async function example(page) {
  await setPrinterCosts(page, { watts: 130, electricityPricePerKwh: 230, replacementCost: 220000, replacementLifetimeHours: 4320 });
  await setQuoteProfilePrice(page, 22000);
  for (const [id, value] of Object.entries({ grams: '294', hours: '11', minutes: '0', errorPercent: '5' })) {
    await page.locator(`#${id}`).fill(value);
  }
}

test('reference exact displayed amounts, presets, custom, internal and saved isolation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#calculationMode')).toBeHidden();
  await example(page);
  for (const [label, expected] of Object.entries({ Material: '6.468', Electricidad: '329', Desgaste: '560', Imprevistos: '368', 'Otros costos': '0', 'Costo total': '7.725', 'Precio base': '15.450', Descuento: '0', Recargo: '0', 'Precio final estimado': '15.450', 'Ganancia estimada': '7.725' })) {
    expect(await amount(page, label), label).toBe(expected);
  }
  await expect(row(page, 'Mantención')).toHaveCount(0);
  await expect(row(page, 'Trabajo')).toHaveCount(0);
  await expect(row(page, 'Costos históricos')).toHaveCount(0);
  expect(await bytes(page)).toBeNull();
  for (const id of ['printerProfile', 'errorPercent', 'multiplierPreset']) {
    const control = page.locator(`#${id}`);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (const [preset, expected] of [['2.5', '19.312'], ['3', '23.175'], ['3.5', '27.037'], ['4', '30.900'], ['5', '38.625'], ['2', '15.450']]) {
    await page.locator('#multiplierPreset').selectOption(preset);
    expect(await amount(page, 'Precio base')).toBe(expected);
  }
  await page.locator('#multiplierPreset').selectOption('custom');
  await page.locator('#customMultiplier').fill('1.5');
  await expect(row(page, 'Precio base')).toContainText('11.587');
  await page.locator('#discountValue').fill('10');
  await page.locator('#surchargeValue').fill('5');
  await expect(row(page, 'Descuento')).toContainText('1.159');
  await expect(row(page, 'Recargo')).toContainText('579');
  await page.locator('#customMultiplier').fill('0');
  await expect(page.locator('#form-error')).toHaveText('El multiplicador debe ser un número mayor que cero.');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await bytes(page)).toBeNull();
  await page.locator('#customMultiplier').fill('2');
  await page.locator('#discountValue').fill('0');
  await page.locator('#surchargeValue').fill('0');
  await page.locator('#multiplierPreset').selectOption('2');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const snapshot = await bytes(page);
  expect(JSON.parse(snapshot)[0].result.finalPrice).toBe(15449.88);
  await page.locator('#grams').fill('50');
  expect(await bytes(page)).toBe(snapshot);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#feedback')).toContainText('Copia abierta de COT-000001');
  await expect(page.locator('#calculationMode')).toBeHidden();
  expect(await amount(page, 'Precio final estimado')).toBe('15.450');
  await page.locator('#purpose').selectOption('internal');
  await expect(page.locator('#commercial')).toHaveAttribute('disabled', '');
  await expect(page.locator('#discountValue')).toBeDisabled();
  await expect(page.locator('#surchargeValue')).toBeDisabled();
  expect(await amount(page, 'Gasto interno estimado')).toBe('7.725');
  await expect(row(page, 'Precio final estimado')).toHaveCount(0);
  expect(await bytes(page)).toBe(snapshot);
  expect(errors).toEqual([]);
});
