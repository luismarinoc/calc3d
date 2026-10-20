import { test, expect } from '@playwright/test';

const key = 'calc3d.demo.purchases.v1';
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), key);
const records = async (page) => JSON.parse((await stored(page)) || '[]');
async function fillLine(page, index, values) {
  const line = page.locator('.purchase-line').nth(index);
  for (const [name, value] of Object.entries(values)) await line.locator(`[name="${name}"]`).fill(value);
}
const pla = { material: 'PLA', brand: 'Sur', color: 'Ámbar', quantity: '2', netWeightGrams: '1000', purchasePrice: '18000' };
const petg = { material: 'PETG', brand: 'Norte', color: 'Negro', quantity: '1', netWeightGrams: '1000', purchasePrice: '22000' };

async function complete(page) {
  await page.locator('[name="date"]').fill('2025-02-28');
  await page.locator('[name="name"]').fill('Proveedor <b>Sur</b>');
  await page.locator('[name="address"]').fill('Pasaje del taller 42');
  await page.locator('[name="phone"]').fill('+56 9 6789 3456');
  await fillLine(page, 0, pla);
  await page.locator('#add-line').click();
  await fillLine(page, 1, petg);
}

test('explicit purchase, immutable history and per-spool inventory across reloads', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/purchases.html');
  await expect(page.getByRole('note')).toContainText('todavía no descuenta impresiones/consumos');
  await expect(page.locator('#purchase-history')).toContainText('Todavía no hay compras');
  await expect(page.locator('#purchase-inventory')).toContainText('después de guardar');
  await page.screenshot({ path: info.outputPath('initial.png'), fullPage: true });
  await complete(page);
  await expect(page.locator('#purchase-preview')).toContainText(/3 bobinas · Total 58[.]?000 CLP/);
  expect(await stored(page)).toBeNull();
  await page.locator('.remove-line').last().click();
  await expect(page.locator('#purchase-preview')).toContainText(/2 bobinas · Total 36[.]?000 CLP/);
  expect(await stored(page)).toBeNull();
  await page.locator('#add-line').click();
  await fillLine(page, 1, petg);
  await page.locator('#purchase-save').click();
  await expect(page.locator('#purchase-feedback')).toContainText('Compra de prueba guardada');
  await expect(page.locator('#purchase-history .saved-item')).toHaveCount(1);
  await expect(page.locator('#purchase-inventory .saved-item')).toHaveCount(3);
  await expect(page.locator('#purchase-history')).toContainText('Pasaje del taller 42');
  await expect(page.locator('#purchase-history')).toContainText('+56 9 6789 3456');
  await expect(page.locator('#purchase-history')).toContainText('2025-02-28');
  await expect(page.locator('#purchase-history')).toContainText('58.000 CLP');
  await expect(page.locator('#purchase-history b')).toHaveCount(0);
  const snapshot = await records(page);
  expect(snapshot).toHaveLength(1);
  expect(snapshot[0].spools).toHaveLength(3);
  expect(new Set(snapshot[0].spools.map((spool) => spool.id)).size).toBe(3);
  await page.screenshot({ path: info.outputPath('saved.png'), fullPage: true });
  await page.locator('[name="name"]').fill('Otro proveedor');
  expect(await records(page)).toEqual(snapshot);
  await page.reload();
  await expect(page.locator('#purchase-history .saved-item')).toHaveCount(1);
  await expect(page.locator('#purchase-inventory .saved-item')).toHaveCount(3);
  expect(await records(page)).toEqual(snapshot);
  expect(errors).toEqual([]);
});

test('invalid drafts focus errors and never create extra purchases', async ({ page }) => {
  await page.goto('/purchases.html');
  await complete(page);
  for (const [name, value, message] of [
    ['date', '', 'Fecha de compra inválida'],
    ['quantity', '0', 'entero positivo seguro'],
    ['purchasePrice', '', 'ingresa un número'],
  ]) {
    const target = name === 'date' ? page.locator('[name="date"]') : page.locator('.purchase-line').first().locator(`[name="${name}"]`);
    await target.fill(value);
    await page.locator('#purchase-save').click();
    await expect(page.locator('#purchase-error')).toContainText(message);
    await expect(target).toBeFocused();
    expect(await stored(page)).toBeNull();
    await target.fill(name === 'date' ? '2025-02-28' : pla[name]);
  }
});

test('corrupt storage is not overwritten and write failures never show success', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, '{bad'), key);
  await page.goto('/purchases.html');
  await expect(page.locator('#storage-error')).toContainText('no se pueden leer');
  await expect(page.locator('#purchase-save')).toBeDisabled();
  expect(await stored(page)).toBe('{bad');
});

test('denied writes and changed-key conflicts require retry without false records', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw Error('denied'); }; });
  await page.goto('/purchases.html');
  await complete(page);
  await page.locator('#purchase-save').click();
  await expect(page.locator('#purchase-error')).toContainText('No se pudo guardar');
  await expect(page.locator('#purchase-feedback')).toBeEmpty();
  await expect(page.locator('#purchase-history .saved-item')).toHaveCount(0);
  expect(await stored(page)).toBeNull();
});

test('touch controls, labels, keyboard, navigation and no overflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Compras e inventario de prueba' }).click();
  await expect(page).toHaveURL(/purchases.html$/);
  for (const control of await page.locator('#purchase-form input, #purchase-form textarea, #purchase-form button').all()) {
    if (await control.isVisible()) {
      if (await control.evaluate((el) => el.matches('input, textarea'))) expect(await control.evaluate((el) => el.labels?.length)).toBeGreaterThan(0);
      const box = await control.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.locator('[name="name"]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[name="address"]')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: /Volver a la calculadora/ }).click();
  await expect(page).toHaveURL(/index.html$/);
});

test('unavailable storage getter shows a read error without crashing the purchase page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage blocked', 'SecurityError'); },
    });
  });
  await page.goto('/purchases.html');
  await expect(page.locator('#storage-error')).toContainText('Las compras de prueba no se pueden leer; no se modificaron sus datos.');
  await expect(page.locator('#purchase-save')).toBeDisabled();
  await expect(page.locator('.purchase-line')).toHaveCount(1);
  await expect(page.locator('#purchase-history .saved-item')).toHaveCount(0);
  await expect(page.locator('#purchase-inventory .saved-item')).toHaveCount(0);
  expect(errors).toEqual([]);
});
