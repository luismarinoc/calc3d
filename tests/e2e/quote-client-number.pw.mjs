import { test, expect } from '@playwright/test';

const key = 'calc3d.demo.quotes.v1';
const raw = (page) => page.evaluate((name) => localStorage.getItem(name), key);

test('optional customer, numbered confirmation, reload and independent copy render text safely', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#client-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#feedback')).toBeEmpty();
  expect(await raw(page)).toBeNull();
  await page.locator('#client-toggle').click();
  for (const id of ['client-name', 'client-phone', 'client-email']) {
    const field = page.locator(`#${id}`);
    await expect(field).toBeVisible();
    expect((await field.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await field.evaluate((element) => element.labels.length)).toBeGreaterThan(0);
  }
  await page.locator('#client-name').fill('  <img src=x onerror=alert(1)>  ');
  await page.locator('#client-phone').fill('  +56 9 1234-5678  ');
  await page.locator('#client-email').fill(' nombre@ejemplo.cl ');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toHaveText('Cálculo de prueba guardado solo en este navegador. Número COT-000001.');
  const first = JSON.parse(await raw(page))[0];
  expect(first.number).toBe('COT-000001');
  expect(first.client).toEqual({ name: '<img src=x onerror=alert(1)>', phone: '+56 9 1234-5678', email: 'nombre@ejemplo.cl' });
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item').first()).toContainText('COT-000001');
  await expect(page.locator('.history-item').first()).toContainText('<img src=x onerror=alert(1)>');
  expect(await page.locator('.history-item img').count()).toBe(0);
  await page.reload();
  await expect(page.locator('#client-name')).toHaveValue('');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#client-name')).toHaveValue('<img src=x onerror=alert(1)>');
  await expect(page.locator('#feedback')).toContainText('Copia abierta de COT-000001');
  await page.locator('#client-name').fill('Otro cliente');
  expect(JSON.parse(await raw(page))[0]).toEqual(first);
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('Número COT-000002');
  const saved = JSON.parse(await raw(page));
  expect(saved[0].client.name).toBe('Otro cliente');
  expect(saved[1]).toEqual(first);
});

test('opening an unnumbered old copy clears another client without rewriting history', async ({ page }) => {
  await page.goto('/');
  await page.locator('#client-toggle').click();
  await page.locator('#client-name').fill('Cliente reciente');
  await page.locator('#save').click();
  const seeded = JSON.parse(await raw(page));
  const old = { ...seeded[0], id: 'old-quote' };
  delete old.number;
  delete old.client;
  await page.evaluate(([name, records]) => localStorage.setItem(name, JSON.stringify(records)), [key, [...seeded, old]]);
  const unchanged = await raw(page);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).first().click();
  await expect(page.locator('#client-name')).toHaveValue('Cliente reciente');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).last().click();
  await expect(page.locator('#client-name')).toHaveValue('');
  await expect(page.locator('#client-phone')).toHaveValue('');
  await expect(page.locator('#client-email')).toHaveValue('');
  await expect(page.locator('#feedback')).toContainText('Copia abierta: editar no altera');
  expect(await raw(page)).toBe(unchanged);
});

test('invalid customer and known stale history reject without replacing stored bytes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#client-toggle').click();
  await page.locator('#client-email').fill('correo-invalido');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toHaveText('Ingresa un correo válido (hasta 254 caracteres).');
  expect(await raw(page)).toBeNull();
  await page.locator('#client-email').fill('');
  await page.locator('#save').click();
  const before = await raw(page);
  expect(JSON.parse(before)[0].number).toBe('COT-000001');
  await page.evaluate((name) => {
    const items = JSON.parse(localStorage.getItem(name));
    localStorage.setItem(name, JSON.stringify([{ ...items[0], id: 'other', number: 'COT-000002' }, ...items]));
  }, key);
  const changed = await raw(page);
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toHaveText('El historial cambió en otra pestaña; recarga la página antes de guardar.');
  expect(await raw(page)).toBe(changed);
  await page.reload();
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('Número COT-000003');
});
