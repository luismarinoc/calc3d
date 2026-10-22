import { signedInTest as test, expect, remoteQuotes, remoteForPage, seedHistoricalQuote } from './supabase-fixture.mjs';

const key = 'calc3d.demo.quotes.v1';
const row = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });
const storage = async page => { const rows = await remoteQuotes(page); return rows.length ? { [key]: JSON.stringify(rows) } : {}; };

async function noObsoleteRows(page) {
  await expect(row(page, 'Mantención')).toHaveCount(0);
  await expect(row(page, 'Trabajo')).toHaveCount(0);
}

test('new sale, internal and gift summaries omit obsolete zero rows without changing costs or storage', async ({ page }) => {
  await page.goto('/');
  const before = await storage(page);
  const total = await row(page, 'Costo total').locator('strong').textContent();
  const sale = await row(page, 'Precio final estimado').locator('strong').textContent();
  await expect(row(page, 'Material')).toHaveCount(1);
  await expect(row(page, 'Desgaste')).toHaveCount(1);
  await expect(row(page, 'Imprevistos')).toHaveCount(1);
  await expect(row(page, 'Otros costos')).toHaveCount(1);
  await noObsoleteRows(page);
  await expect(row(page, 'Costos históricos')).toHaveCount(0);
  await expect(row(page, 'Costo total').locator('strong')).toHaveText(total);
  await expect(row(page, 'Precio final estimado').locator('strong')).toHaveText(sale);
  for (const [purpose, label] of [['internal', 'Gasto interno estimado'], ['gift', 'Costo de regalo estimado']]) {
    await page.locator('#purpose').selectOption(purpose);
    await noObsoleteRows(page);
    await expect(row(page, 'Costos históricos')).toHaveCount(0);
    await expect(row(page, 'Costo total').locator('strong')).toHaveText(total);
    await expect(row(page, label).locator('strong')).toHaveText(total);
    await expect(row(page, 'Precio final estimado')).toHaveCount(0);
    await expect(row(page, 'Ganancia estimada')).toHaveCount(0);
    expect(await storage(page)).toEqual(before);
  }
  await page.locator('#purpose').selectOption('sale');
  await noObsoleteRows(page);
  await expect(row(page, 'Precio final estimado').locator('strong')).toHaveText(sale);
  expect(await storage(page)).toEqual(before);
  expect(before[key]).toBeUndefined();
});

test('old component costs appear only as a formatted historical subtotal, keeping saved values and numbering', async ({ page }) => {
  await page.goto('/');
  await seedHistoricalQuote(page, remoteForPage(page), { title: 'Copia anterior', purpose: 'sale', spoolId: 'demo-petg',
    purchasePrice: '10000', netWeightGrams: '1000', grams: '10', hours: '2', minutes: '0', watts: '0', electricityPricePerKwh: '0',
    depreciationPerHour: '10', maintenancePerHour: '20', laborMinutes: '30', laborRatePerHour: '100', extraProductionCost: '5',
    markupPercent: '100', discountType: 'amount', discountValue: '0', surchargeType: 'amount', surchargeValue: '0' });
  const before = await storage(page);
  const saved = JSON.parse(before[key]);
  expect(saved).toHaveLength(1);
  expect(saved[0].number).toBe('COT-000001');
  expect(saved[0].result.breakdown).toMatchObject({ material: 100, depreciation: 20, maintenance: 40, labor: 50, extras: 5 });
  expect(saved[0].result.totalCost).toBe(215);
  expect(saved[0].result.finalPrice).toBe(430);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await noObsoleteRows(page);
  await expect(row(page, 'Costos históricos').locator('strong')).toHaveText('$90');
  await expect(row(page, 'Depreciación').locator('strong')).toHaveText('$20');
  await expect(row(page, 'Material').locator('strong')).toHaveText('$100');
  await expect(row(page, 'Otros costos').locator('strong')).toHaveText('$5');
  await expect(row(page, 'Costo total').locator('strong')).toHaveText('$215');
  await expect(row(page, 'Precio base').locator('strong')).toHaveText('$430');
  await expect(row(page, 'Precio final estimado').locator('strong')).toHaveText('$430');
  await expect(row(page, 'Ganancia estimada').locator('strong')).toHaveText('$215');
  const alignment = await row(page, 'Costos históricos').evaluate((line) => {
    const bounds = line.getBoundingClientRect();
    const amount = line.querySelector('strong').getBoundingClientRect();
    return bounds.right - amount.right;
  });
  expect(alignment).toBeGreaterThanOrEqual(0);
  expect(alignment).toBeLessThanOrEqual(8);
  expect(await storage(page)).toEqual(before);
  await page.locator('#purpose').selectOption('internal');
  await noObsoleteRows(page);
  await expect(row(page, 'Costos históricos').locator('strong')).toHaveText('$90');
  await expect(row(page, 'Gasto interno estimado').locator('strong')).toHaveText('$215');
  await expect(row(page, 'Precio final estimado')).toHaveCount(0);
  expect(await storage(page)).toEqual(before);
  await page.locator('#purpose').selectOption('gift');
  await noObsoleteRows(page);
  await expect(row(page, 'Costos históricos').locator('strong')).toHaveText('$90');
  await expect(row(page, 'Costo de regalo estimado').locator('strong')).toHaveText('$215');
  await expect(row(page, 'Precio final estimado')).toHaveCount(0);
  expect(await storage(page)).toEqual(before);
});
