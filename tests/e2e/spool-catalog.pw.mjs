import { signedInTest as test, expect, remoteQuotes, remotePurchases } from './supabase-fixture.mjs';

const material = page => page.locator('#result-content .result-row').filter({ has: page.getByText('Material', { exact: true }) });

test('public purchase to calculator, quote snapshot and reload without inventory changes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/purchases.html');
  await page.locator('[name="date"]').fill('2025-02-28');
  await page.locator('[name="name"]').fill('Proveedor Sur');
  const line = page.locator('.purchase-line').first();
  for (const [name, value] of Object.entries({ material: 'PLA', brand: 'Sur', color: 'Azul', quantity: '1', netWeightGrams: '800', purchasePrice: '18000' })) await line.locator(`[name="${name}"]`).fill(value);
  await page.locator('#purchase-save').click();
  await expect(page.locator('#purchase-feedback')).toContainText('guardada');
  const original = await remotePurchases(page);
  const spool = original[0].spools[0];
  await page.goto('/');
  const selectedId = `purchase:${spool.id}`;
  await expect(page.locator(`#spoolId option[value="${selectedId}"]`)).toContainText(/PLA.*Sur.*Azul.*2025-02-28/);
  await page.locator('#spoolId').selectOption(selectedId);
  await expect(page.locator('#purchasePrice')).toHaveValue('18000');
  await expect(page.locator('#netWeightGrams')).toHaveValue('800');
  await expect(page.locator('#purchasePrice')).toHaveAttribute('readonly', '');
  await expect(page.locator('#netWeightGrams')).toHaveAttribute('readonly', '');
  await expect(page.locator('#spool-info')).toContainText(spool.id);
  await expect(page.locator('#spool-info')).toContainText(spool.purchaseId);
  await page.locator('#grams').fill('1600');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(material(page)).toContainText(/36[.\s\u00a0]?000/);
  expect(await remotePurchases(page)).toEqual(original);
  expect(await remoteQuotes(page)).toHaveLength(0);
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const saved = await remoteQuotes(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].form.spoolId).toBe(selectedId);
  await page.locator('#grams').fill('40');
  expect(await remoteQuotes(page)).toEqual(saved);
  expect(await remotePurchases(page)).toEqual(original);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#spoolId')).toHaveValue(selectedId);
  await expect(page.locator('#grams')).toHaveValue('1600');
  await expect(material(page)).toContainText(/36[.\s\u00a0]?000/);
  expect(await remoteQuotes(page)).toEqual(saved);
  expect(await remotePurchases(page)).toEqual(original);
  await page.locator('#spoolId').selectOption('demo-petg');
  await expect(page.locator('#purchasePrice')).toBeEditable();
  await expect(page.locator('#netWeightGrams')).toBeEditable();
  await page.locator('#purchasePrice').fill('12345');
  await expect(page.locator('#purchasePrice')).toHaveValue('12345');
  expect(await remoteQuotes(page)).toEqual(saved);
  expect(await remotePurchases(page)).toEqual(original);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('unavailable purchase read fails closed without overwriting remote records', async ({ page, remote }) => {
  remote.fail = '/rest/v1/calc3d_spools';
  await page.goto('/');
  await expect(page.locator('#purchase-catalog-error')).toContainText('No se pudieron cargar datos remotos');
  await expect(page.locator('#save')).toBeDisabled();
  expect(remote.spools).toHaveLength(0);
});

test('network failure on purchased spools does not produce a fictitious catalog', async ({ page, remote }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  remote.fail = '/rest/v1/calc3d_spools';
  await page.goto('/');
  await expect(page.locator('#save')).toBeDisabled();
  await expect(page.locator('#spoolId option')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('unknown purchased spool in saved quote cannot fall back to a demo', async ({ page, remote }) => {
  await page.goto('/');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const before = structuredClone(remote.quotes[0]);
  before.form.spoolId = 'purchase:missing';
  before.spool_id = 'purchase:missing';
  remote.quotes[0] = before; // fake server seed, not browser local history
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#spoolId')).toHaveValue('purchase:missing');
  await expect(page.locator('#save')).toBeDisabled();
  await expect(page.locator('#form-error')).toContainText('bobina');
  expect((await remoteQuotes(page))[0].spoolId).toBe('purchase:missing');
});
