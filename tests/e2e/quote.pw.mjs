import { test, expect } from '@playwright/test';

const key = 'calc3d.demo.quotes.v1';
const records = (page) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || '[]'), key);
const row = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });

async function knownCost(page) {
  await page.evaluate(async () => {
    const { evaluate, demoSpools } = await import('/src/ui/quote.mjs');
    const { createDemoHistory } = await import('/src/data/demo.mjs');
    const history = createDemoHistory({ getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
    const quote = evaluate({ title: 'Cotización anterior', spoolId: 'demo-petg', purpose: 'sale', purchasePrice: '10000', netWeightGrams: '1000', grams: '1000', hours: '0', minutes: '0', watts: '0', electricityPricePerKwh: '200', depreciationPerHour: '0', maintenancePerHour: '0', laborMinutes: '0', laborRatePerHour: '0', extraProductionCost: '0', markupPercent: '50', discountType: 'percent', discountValue: '0', surchargeType: 'percent', surchargeValue: '0' }, demoSpools);
    if (quote.error || !history.save(quote).ok) throw Error(quote.error || 'Legacy fixture save failed');
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).first().click();
  for (const [id, value] of Object.entries({
    purchasePrice: '10000', netWeightGrams: '1000', grams: '1000', hours: '0', minutes: '0',
    watts: '0', electricityPricePerKwh: '200', markupPercent: '50',
    discountValue: '20', surchargeValue: '5',
  })) await page.locator(`#${id}`).fill(value);
}

test('live demo, explicit saved snapshot, adjustments and keyboard/touch layout', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('datos de prueba guardados solo en este navegador');
  await expect(row(page, 'Costo total')).toBeVisible();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('#history-list')).toContainText('Todavía no guardaste cálculos');
  await page.getByRole('tab', { name: 'Calculadora' }).click();
  await page.screenshot({ path: testInfo.outputPath('initial.png'), fullPage: true });
  await knownCost(page);
  await page.locator('#title').fill('<img src=x onerror=alert(1)> Presupuesto');
  await expect(row(page, 'Costo total')).toContainText(/10[.\s\u00a0]?000/);
  await expect(row(page, 'Precio base')).toContainText(/15[.\s\u00a0]?000/);
  await expect(row(page, 'Descuento')).toContainText(/3[.\s\u00a0]?000/);
  await expect(row(page, 'Recargo')).toContainText(/750/);
  await expect(row(page, 'Precio final estimado')).toContainText(/12[.\s\u00a0]?750/);
  await expect(row(page, 'Ganancia estimada')).toContainText(/2[.\s\u00a0]?750/);
  expect(await records(page)).toHaveLength(1);
  for (const id of ['title', 'purpose', 'grams', 'minutes', 'discountValue', 'save']) {
    const control = page.locator(`#${id}`);
    await expect(control).toBeVisible();
    if (id !== 'save') {
      expect(await control.evaluate((element) => element.labels?.length)).toBeGreaterThan(0);
    }
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height, `${id} touch height`).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#title').focus();
  await expect(page.locator('#title')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#purpose')).toBeFocused();
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('guardado solo en este navegador');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item')).toHaveCount(2);
  expect(await page.locator('.history-item img').count()).toBe(0);
  await expect(page.locator('.history-item strong').first()).toHaveText('<img src=x onerror=alert(1)> Presupuesto');
  await expect(page.locator('.history-item p').first()).toContainText(/Venta · costo .*10[.\s\u00a0]?000.*precio .*12[.\s\u00a0]?750/);
  const saved = (await records(page))[0];
  expect(saved.savedAt).not.toBeNaN();
  expect(Number.isNaN(Date.parse(saved.savedAt))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('result.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Calculadora' }).click();
  await page.locator('#grams').fill('500');
  expect((await records(page))[0]).toEqual(saved);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Abrir copia' }).first().click();
  await expect(page.locator('#grams')).toHaveValue('1000');
  await page.locator('#grams').fill('900');
  expect((await records(page))[0]).toEqual(saved);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('invalid input and cost floor clear results without changing storage; equality is valid', async ({ page }) => {
  await page.goto('/');
  await knownCost(page);
  await page.locator('#save').click();
  const saved = await records(page);
  for (const [id, value, message] of [
    ['grams', '', 'Ingresa un valor para Gramos consumidos.'],
    ['minutes', '60', 'Los minutos deben estar entre 0 y 59.'],
  ]) {
    await page.locator(`#${id}`).fill(value);
    await expect(page.getByRole('alert').first()).toHaveText(message);
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#save')).toBeDisabled();
    await expect(page.locator('#result-content')).toContainText('Corrige los datos');
    await expect(page.locator('#result-content .result-row')).toHaveCount(0);
    expect(await records(page)).toEqual(saved);
    await page.locator(`#${id}`).fill(id === 'grams' ? '1000' : '0');
  }
  await page.locator('#markupPercent').fill('0');
  await page.locator('#discountValue').fill('1');
  await page.locator('#surchargeValue').fill('0');
  await expect(page.getByRole('alert').first()).toHaveText('El precio final no puede ser menor al costo total (faltan 100 CLP).');
  await expect(page.locator('#save')).toBeDisabled();
  await expect(page.locator('#result-content .result-row')).toHaveCount(0);
  expect(await records(page)).toEqual(saved);
  await page.locator('#discountValue').fill('0');
  await expect(row(page, 'Precio final estimado')).toContainText(/10[.\s\u00a0]?000/);
  await expect(page.locator('#save')).toBeEnabled();
  expect(await records(page)).toEqual(saved);
});

test('internal purpose saves expense without revenue and reset prevents stale adjustments', async ({ page }) => {
  await page.goto('/');
  await knownCost(page);
  await page.locator('#purpose').selectOption('internal');
  await expect(page.locator('#commercial')).toHaveAttribute('disabled', '');
  await expect(page.locator('#discountValue')).toBeDisabled();
  await expect(page.locator('#discountValue')).toHaveValue('0');
  await expect(page.locator('#surchargeValue')).toHaveValue('0');
  await expect(row(page, 'Gasto interno estimado')).toContainText(/10[.\s\u00a0]?000/);
  await expect(row(page, 'Precio final estimado')).toHaveCount(0);
  await expect(row(page, 'Ganancia estimada')).toHaveCount(0);
  await page.locator('#save').click();
  const saved = (await records(page))[0];
  expect(saved.input.purpose).toBe('internal');
  expect(saved.result.finalPrice).toBe(0);
  expect(saved.result.internalCost).toBe(10000);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item p').first()).toContainText('Uso interno');
  await expect(page.locator('.history-item p').first()).not.toContainText('precio');
  await page.getByRole('tab', { name: 'Calculadora' }).click();
  await page.locator('#purpose').selectOption('sale');
  await expect(page.locator('#commercial')).not.toHaveAttribute('disabled');
  await expect(page.locator('#discountValue')).toBeEnabled();
  await expect(row(page, 'Precio final estimado')).toContainText(/10[.\s\u00a0]?000/);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).first().click();
  await expect(page.locator('#purpose')).toHaveValue('internal');
  await expect(row(page, 'Gasto interno estimado')).toBeVisible();
  expect((await records(page))[0]).toEqual(saved);
});

test('corrupt and unavailable storage never report a successful save', async ({ page }) => {
  await page.addInitScript((storageKey) => localStorage.setItem(storageKey, '{bad'), key);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('#history-error')).toHaveText('El historial de prueba no se puede leer; no se modificaron sus datos.');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('{bad');
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('#history-error')).toBeVisible();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('{bad');
});

test('denied writes do not create false history or success feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('quota'); };
  });
  await page.goto('/');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toHaveText('No se pudo guardar en este navegador; el cálculo no quedó registrado.');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item')).toHaveCount(0);
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
});
