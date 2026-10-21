import { test, expect } from '@playwright/test';

const purchaseKey = 'calc3d.demo.purchases.v1';
const quoteKey = 'calc3d.demo.quotes.v1';
const bytes = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const material = (page) => page.locator('#result-content .result-row').filter({ has: page.getByText('Material', { exact: true }) });

test('public purchase to calculator, quote snapshot and reload without inventory changes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/purchases.html');
  await page.locator('[name="date"]').fill('2025-02-28');
  await page.locator('[name="name"]').fill('Proveedor Sur');
  const line = page.locator('.purchase-line').first();
  for (const [name, value] of Object.entries({ material: 'PLA', brand: 'Sur', color: 'Azul', quantity: '1', netWeightGrams: '800', purchasePrice: '18000' })) await line.locator(`[name="${name}"]`).fill(value);
  await page.locator('#purchase-save').click();
  const original = await bytes(page, purchaseKey);
  const spool = JSON.parse(original)[0].spools[0];
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
  expect(await bytes(page, purchaseKey)).toBe(original);
  expect(await bytes(page, quoteKey)).toBeNull();
  await page.locator('#save').click();
  const savedBytes = await bytes(page, quoteKey);
  expect(JSON.parse(savedBytes)).toHaveLength(1);
  expect(JSON.parse(savedBytes)[0].form.spoolId).toBe(selectedId);
  await page.locator('#grams').fill('40');
  expect(await bytes(page, quoteKey)).toBe(savedBytes);
  expect(await bytes(page, purchaseKey)).toBe(original);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#spoolId')).toHaveValue(selectedId);
  await expect(page.locator('#grams')).toHaveValue('1600');
  await expect(material(page)).toContainText(/36[.\s\u00a0]?000/);
  expect(await bytes(page, quoteKey)).toBe(savedBytes);
  expect(await bytes(page, purchaseKey)).toBe(original);
  await page.locator('#spoolId').selectOption('demo-petg');
  await expect(page.locator('#purchasePrice')).toBeEditable();
  await expect(page.locator('#netWeightGrams')).toBeEditable();
  await page.locator('#purchasePrice').fill('12345');
  await expect(page.locator('#purchasePrice')).toHaveValue('12345');
  expect(await bytes(page, quoteKey)).toBe(savedBytes);
  expect(await bytes(page, purchaseKey)).toBe(original);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('corrupt purchases leave demo editable and stored bytes untouched', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((k) => localStorage.setItem(k, '{bad'), purchaseKey);
  await page.reload();
  await expect(page.locator('#purchase-catalog-error')).toContainText('no se pueden leer');
  await expect(page.locator('#spoolId option')).toHaveCount(2);
  await expect(page.locator('#purchasePrice')).toBeEditable();
  await page.locator('#purchasePrice').fill('10000');
  await expect(material(page)).toBeVisible();
  await page.locator('#save').click();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  expect(await bytes(page, purchaseKey)).toBe('{bad');
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#purchasePrice')).toHaveValue('10000');
});

test('blocked purchase getter still permits demo calculation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((k) => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) { if (key === k) throw Error('blocked'); return get.call(this, key); };
  }, purchaseKey);
  await page.goto('/');
  await expect(page.locator('#purchase-catalog-error')).toContainText('no se pueden leer');
  await expect(page.locator('#purchasePrice')).toBeEditable();
  await expect(material(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('unavailable localStorage getter cannot crash calculator initialization', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true,
      get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  await page.goto('/');
  await expect(page.locator('#purchase-catalog-error')).toContainText('no se pueden leer');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('#history-error')).toContainText('no se puede leer');
  await page.getByRole('tab', { name: 'Calculadora' }).click();
  await expect(material(page)).toBeVisible();
  await expect(page.locator('#purchasePrice')).toBeEditable();
  expect(errors).toEqual([]);
});

test('unknown purchased spool in saved quote cannot fall back to a demo', async ({ page }) => {
  await page.goto('/');
  await page.locator('#save').click();
  const before = JSON.parse(await bytes(page, quoteKey));
  before[0].form.spoolId = 'purchase:missing';
  before[0].spoolId = 'purchase:missing';
  await page.evaluate(([k, value]) => localStorage.setItem(k, value), [quoteKey, JSON.stringify(before)]);
  const snapshot = await bytes(page, quoteKey);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#spoolId')).toHaveValue('purchase:missing');
  await expect(page.locator('#save')).toBeDisabled();
  await expect(page.locator('#form-error')).toContainText('bobina');
  expect(await bytes(page, quoteKey)).toBe(snapshot);
});
