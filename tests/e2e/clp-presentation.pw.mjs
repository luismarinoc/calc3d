import { signedInTest as test, expect, remoteQuotes, remoteForPage, seedHistoricalQuote } from './supabase-fixture.mjs';
import { setPrinterCosts } from './printer-fixtures.mjs';

const raw = async page => { const rows = await remoteQuotes(page); return rows.length ? JSON.stringify(rows) : null; };
const row = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });
const example = { purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0', errorPercent: '5' };

async function assertRightAligned(page, label) {
  const measure = await row(page, label).evaluate((line) => {
    const amount = line.querySelector('strong').getBoundingClientRect();
    const bounds = line.getBoundingClientRect();
    return { rightGap: bounds.right - amount.right, leftGap: amount.left - bounds.left, width: amount.width, lineWidth: bounds.width };
  });
  expect(measure.rightGap, `${label} right edge`).toBeGreaterThanOrEqual(0);
  expect(measure.rightGap, `${label} right edge`).toBeLessThanOrEqual(8);
  expect(measure.leftGap, `${label} stays inside row`).toBeGreaterThanOrEqual(0);
}

test('reference summary presents whole CLP and full-width right-aligned sale without changing stored precision', async ({ page }, info) => {
  await page.goto('/');
  await setPrinterCosts(page, { electricityPricePerKwh: 230 });
  for (const [id, value] of Object.entries(example)) await page.locator(`#${id}`).fill(value);
  for (const [label, expected] of Object.entries({ Material: '$6.468', Electricidad: '$329', Desgaste: '$560', Imprevistos: '$368', Mantención: '$0', Trabajo: '$0', 'Otros costos': '$0', 'Costo total': '$7.725', 'Precio base': '$15.450', Descuento: '$0', Recargo: '$0', 'Precio final estimado': '$15.450', 'Ganancia estimada': '$7.725' })) {
    expect((await row(page, label).locator('strong').textContent()).replace(/\s/g, ''), label).toBe(expected);
    await assertRightAligned(page, label);
  }
  const sale = row(page, 'Precio final estimado');
  const layout = await sale.evaluate((line) => {
    const label = line.querySelector('span').getBoundingClientRect();
    const amount = line.querySelector('strong').getBoundingClientRect();
    return { lineBelow: amount.top >= label.bottom - 1, amountAlign: getComputedStyle(line.querySelector('strong')).textAlign, labelAlign: getComputedStyle(line.querySelector('span')).textAlign };
  });
  expect(layout.lineBelow).toBe(true);
  expect(layout.amountAlign).toBe('right');
  expect(layout.labelAlign).not.toBe('right');
  await expect(sale).toHaveClass(/sale-total/);
  await page.screenshot({ path: info.outputPath('whole-clp-sale.png'), fullPage: true });
  expect(await raw(page)).toBeNull();
  await expect(page.locator('#grams')).toHaveValue('294');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const snapshot = await raw(page);
  expect(JSON.parse(snapshot)[0].result.totalCost).toBe(7724.94);
  expect(JSON.parse(snapshot)[0].result.finalPrice).toBe(15449.88);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item p')).toContainText('costo $7.725 · precio $15.450');
  await page.screenshot({ path: info.outputPath('whole-clp-history.png'), fullPage: true });
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(row(page, 'Precio final estimado').locator('strong')).toHaveText('$15.450');
  expect(await raw(page)).toBe(snapshot);
});

test('legacy sale and non-sale summaries keep whole CLP, right edges and no invented sale', async ({ page }) => {
  await page.goto('/');
  await seedHistoricalQuote(page, remoteForPage(page), { title: 'Histórica', spoolId: 'demo-petg', purpose: 'sale', purchasePrice: '10000', netWeightGrams: '1000', grams: '1000', hours: '0', minutes: '0', watts: '0', electricityPricePerKwh: '200', markupPercent: '50', discountType: 'percent', discountValue: '0', surchargeType: 'percent', surchargeValue: '0' });
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item p')).toContainText('costo $10.000 · precio $15.000');
  const snapshot = await raw(page);
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(row(page, 'Precio final estimado').locator('strong')).toHaveText('$15.000');
  await assertRightAligned(page, 'Precio final estimado');
  for (const [purpose, label] of [['gift', 'Costo de regalo estimado'], ['internal', 'Gasto interno estimado']]) {
    await page.locator('#purpose').selectOption(purpose);
    await expect(row(page, label).locator('strong')).toHaveText('$10.000');
    await assertRightAligned(page, label);
    await expect(row(page, 'Precio final estimado')).toHaveCount(0);
    await expect(row(page, 'Ganancia estimada')).toHaveCount(0);
    expect(await raw(page)).toBe(snapshot);
  }
});
