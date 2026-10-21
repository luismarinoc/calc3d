import { test, expect } from '@playwright/test';

const key = 'calc3d.demo.quotes.v1';
const row = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });

test('additional production costs expose only the single CLP amount directly', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('section[aria-labelledby="machine-heading"] > details')).toHaveCount(0);
  await expect(page.locator('#extraProductionCost')).toBeVisible();
  await expect(page.locator('.production-extras input:visible')).toHaveCount(1);
  await expect(page.getByLabel('Otros costos de producción · CLP', { exact: true })).toBeVisible();
  if (info.project.name === 'chromium-desktop') {
    await expect(page.locator('#extraProductionCost')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
  }
  for (const id of ['maintenancePerHour', 'laborMinutes', 'laborRatePerHour', 'depreciationPerHour']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await page.locator('#extraProductionCost').fill('1000');
  await expect(row(page, 'Otros costos')).toContainText('1.000');
  expect(await page.evaluate(name => localStorage.getItem(name), key)).toBeNull();
});

test('historical component costs survive hidden controls and remain unchanged in storage', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { evaluate } = await import('/src/ui/quote.mjs');
    const { createDemoHistory } = await import('/src/data/demo.mjs');
    const history = createDemoHistory(localStorage);
    const evaluated = evaluate({ title: 'Costos históricos', purpose: 'sale', spoolId: 'demo-petg',
      purchasePrice: '10000', netWeightGrams: '1000', grams: '10', hours: '2', minutes: '0', watts: '0', electricityPricePerKwh: '0',
      depreciationPerHour: '10', maintenancePerHour: '20', laborMinutes: '30', laborRatePerHour: '100', extraProductionCost: '5',
      markupPercent: '100', discountType: 'amount', discountValue: '0', surchargeType: 'amount', surchargeValue: '0' });
    if (evaluated.error || !history.save(evaluated).ok) throw Error('Unable to create historical cost fixture');
  });
  const before = await page.evaluate(name => localStorage.getItem(name), key);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#extraProductionCost')).toBeVisible();
  await expect(page.locator('.production-extras input:visible')).toHaveCount(1);
  await expect(row(page, 'Costo total')).toContainText('215');
  await expect(row(page, 'Depreciación')).toContainText('20');
  await expect(row(page, 'Mantención')).toContainText('40');
  await expect(row(page, 'Trabajo')).toContainText('50');
  expect(await page.evaluate(name => localStorage.getItem(name), key)).toBe(before);
});
