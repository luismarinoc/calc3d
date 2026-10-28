import { signedInTest as test, expect, remoteQuotes } from './supabase-fixture.mjs';

const raw = async page => { const records = await remoteQuotes(page); return records.length ? JSON.stringify(records) : null; };

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
  await expect(page.locator('#feedback')).toContainText('Número COT-000001');
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

test('opening an unnumbered old copy clears another client without rewriting history', async ({ page, remote }) => {
  await page.goto('/');
  await page.locator('#client-toggle').click();
  await page.locator('#client-name').fill('Cliente reciente');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const seeded = JSON.parse(await raw(page));
  const old = { ...seeded[0], id: 'old-quote' };
  delete old.number;
  delete old.client;
  remote.quotes.push({ ...remote.quotes[0], id: old.id, saved_at: '2025-01-01T00:00:00.000Z', number: null, client: null });
  const unchanged = await raw(page);
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).first().click();
  await expect(page.locator('#client-name')).toHaveValue('Cliente reciente');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item').last()).not.toContainText('COT-000001');
  await page.locator('.history-item').last().getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#feedback')).toContainText('Copia abierta: editar no altera');
  await expect(page.locator('#client-name')).toHaveValue('');
  await expect(page.locator('#client-phone')).toHaveValue('');
  await expect(page.locator('#client-email')).toHaveValue('');
  await expect(page.locator('#feedback')).toContainText('Copia abierta: editar no altera');
  expect(await raw(page)).toBe(unchanged);
});

test('invalid customer and denied remote save preserve server-assigned numbering', async ({ page, remote }) => {
  await page.goto('/');
  await page.locator('#client-toggle').click();
  await page.locator('#client-email').fill('correo-invalido');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toHaveText('Ingresa un correo válido (hasta 254 caracteres).');
  expect(await raw(page)).toBeNull();
  await page.locator('#client-email').fill('');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const before = await raw(page);
  expect(JSON.parse(before)[0].number).toBe('COT-000001');
  remote.fail = '/rpc/calc3d_save_quote';
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('Network denied');
  expect(await raw(page)).toBe(before);
  remote.fail = null;
  await page.reload();
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('Número COT-000002');
});
