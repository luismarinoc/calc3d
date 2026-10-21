import { test, expect } from '@playwright/test';

const quoteKey = 'calc3d.demo.quotes.v1';
const bytes = (page) => page.evaluate((key) => localStorage.getItem(key), quoteKey);
const row = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });
const amount = async (page, label) => (await row(page, label).locator('strong').textContent()).replace(/[^\d.,-]/g, '');
async function example(page) {
  for (const [id, value] of Object.entries({ purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0', watts: '130', electricityPricePerKwh: '230', replacementCost: '220000', replacementLifetimeHours: '4320', errorPercent: '5' })) {
    await page.locator(`#${id}`).fill(value);
  }
}

test('reference exact displayed amounts, presets, custom, internal, saved isolation and legacy copy', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#calculationMode')).toHaveValue('reference');
  await example(page);
  for (const [label, expected] of Object.entries({ Material: '6.468,00', Electricidad: '328,90', Desgaste: '560,19', Imprevistos: '367,85', Mantención: '0,00', Trabajo: '0,00', 'Otros costos': '0,00', 'Costo total': '7.724,94', 'Precio base': '15.449,88', Descuento: '0,00', Recargo: '0,00', 'Precio final estimado': '15.449,88', 'Ganancia estimada': '7.724,94' })) {
    expect(await amount(page, label), label).toBe(expected);
  }
  expect(await bytes(page)).toBeNull();
  for (const id of ['calculationMode', 'replacementCost', 'replacementLifetimeHours', 'errorPercent', 'multiplierPreset']) {
    const control = page.locator(`#${id}`);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (const [preset, expected] of [['2.5', '19.312,35'], ['3', '23.174,82'], ['3.5', '27.037,29'], ['4', '30.899,76'], ['5', '38.624,70'], ['2', '15.449,88']]) {
    await page.locator('#multiplierPreset').selectOption(preset);
    expect(await amount(page, 'Precio base')).toBe(expected);
  }
  await page.locator('#multiplierPreset').selectOption('custom');
  await page.locator('#customMultiplier').fill('1.5');
  await expect(row(page, 'Precio base')).toContainText('11.587,41');
  await page.locator('#discountValue').fill('10');
  await page.locator('#surchargeValue').fill('5');
  await expect(row(page, 'Descuento')).toContainText('1.158,74');
  await expect(row(page, 'Recargo')).toContainText('579,37');
  await page.locator('#customMultiplier').fill('0');
  await expect(page.locator('#form-error')).toHaveText('El multiplicador debe ser un número mayor que cero.');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await bytes(page)).toBeNull();
  await page.locator('#customMultiplier').fill('2');
  await page.locator('#discountValue').fill('0');
  await page.locator('#surchargeValue').fill('0');
  await page.locator('#multiplierPreset').selectOption('2');
  await page.locator('#save').click();
  const snapshot = await bytes(page);
  expect(JSON.parse(snapshot)[0].result.finalPrice).toBe(15449.88);
  await page.locator('#grams').fill('50');
  expect(await bytes(page)).toBe(snapshot);
  await page.reload();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#calculationMode')).toHaveValue('reference');
  expect(await amount(page, 'Precio final estimado')).toBe('15.449,88');
  await page.locator('#purpose').selectOption('internal');
  await expect(page.locator('#commercial')).toHaveAttribute('disabled', '');
  await expect(page.locator('#discountValue')).toBeDisabled();
  await expect(page.locator('#surchargeValue')).toBeDisabled();
  expect(await amount(page, 'Gasto interno estimado')).toBe('7.724,94');
  await expect(row(page, 'Precio final estimado')).toHaveCount(0);
  expect(await bytes(page)).toBe(snapshot);
  await page.locator('#calculationMode').selectOption('legacy');
  expect(await amount(page, 'Costo total')).toBe('6.797');
  await page.locator('#purpose').selectOption('sale');
  await page.locator('#save').click();
  const records = JSON.parse(await bytes(page));
  delete records[0].form.calculationMode; // Pre-reference saved form copy.
  await page.evaluate(([key, serialized]) => localStorage.setItem(key, serialized), [quoteKey, JSON.stringify(records)]);
  const legacySnapshot = await bytes(page);
  await page.reload();
  await page.getByRole('button', { name: 'Abrir copia' }).first().click();
  await expect(page.locator('#calculationMode')).toHaveValue('legacy');
  expect(await amount(page, 'Costo total')).toBe('6.797');
  expect(await bytes(page)).toBe(legacySnapshot);
  expect(errors).toEqual([]);
});
