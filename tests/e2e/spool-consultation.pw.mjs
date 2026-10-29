import { signedInEmptyTest as test, expect, remoteRows } from './supabase-fixture.mjs';

const stamp = '2026-01-01T00:00:00.000Z';
const brand = (remote, id, name) => ({ id, owner_id: remote.user.id, name, normalized_name: name.toLowerCase(),
  color: '#123456', aliases: [name.toLowerCase()], revision: 1, created_at: stamp, updated_at: stamp });
const profile = (remote, id, name, material, brandId, price, weight, color = '') => ({
  id, owner_id: remote.user.id, name, material, brand: '', brand_id: brandId,
  filament_color: color, filament_color_hex: null, purchase_price: price, net_weight_grams: weight,
  revision: 1, created_at: stamp, updated_at: stamp });
const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];

test('verified product link opens exact supplier page in new tab without changing consultation, draft or account data', async ({ page, remote }) => {
  const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/tpu-1kg-negro';
  remote.profiles = [ { ...profile(remote, ids[0], 'TPU Negro', 'TPU', null, 12000, 1000), source_url: url },
    profile(remote, ids[1], 'Sin enlace', 'PLA', null, 9000, 500) ];
  await page.context().route('https://www.todotoner.cl/**', route => route.fulfill({ status: 200, body: '<title>Producto verificado</title>', contentType: 'text/html' }));
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.locator('#spool-name').fill('Borrador sin cambios');
  const before = await remoteRows(page, 'spool_profiles');
  const writes = () => remote.calls.filter(call => /\/rpc\/calc3d_(save|archive)/.test(call.pathname));
  const count = writes().length;
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Consultar bobinas' });
  const link = dialog.getByRole('link', { name: 'Ver producto: TPU Negro' });
  await expect(link).toHaveAttribute('href', url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(dialog.locator('.consultation-row').filter({ hasText: 'Sin enlace' }).getByRole('link')).toHaveCount(0);
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(url);
  await expect(page).toHaveURL(/\/settings.html$/);
  await expect(dialog).toBeVisible();
  await expect(page.locator('#spool-name')).toHaveValue('Borrador sin cambios');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
  expect(writes()).toHaveLength(count);
  await popup.close();
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  const error = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
  });
  expect(error).toBeNull();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#spool-consultation a[href]')).toHaveCount(0);
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  await expect(dialog.getByText('Todavía no hay bobinas guardadas.')).toBeVisible();
  await expect(dialog.getByRole('link')).toHaveCount(0);
});

test('consultation searches and compares saved prices locally without changing the draft or records', async ({ page, remote }, testInfo) => {
  remote.brands = [brand(remote, ids[0], 'Marca Uno'), brand(remote, ids[1], 'Marca Dos')];
  remote.profiles = [profile(remote, ids[0], 'Seda 500 g', 'PLA', ids[0], 9000, 500, 'Azul'),
    profile(remote, ids[1], 'Mate 1 kg', 'PETG', ids[1], 0, 1000, 'Rojo'),
    profile(remote, ids[2], 'Seda 1 kg', 'PLA', ids[0], 12000, 1000, 'Verde')];
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.locator('#spool-name').fill('Borrador intacto');
  await page.locator('#spool-material').fill('ASA privado');
  await page.locator('#spool-filamentColor').fill('Negro');
  await page.locator('#spool-purchasePrice').fill('4567');
  await page.locator('#spool-netWeightGrams').fill('750');
  await page.locator('#brand-name').fill('Marca borrador');
  await page.locator('#printer-name').fill('Impresora borrador');
  await page.locator('.spool-picker-trigger').click();
  await page.getByRole('listbox', { name: 'Presentaciones guardadas' }).getByRole('option', { name: /Mate 1 kg/ }).click();
  const formState = () => page.locator('#printer-form, #brand-form, #spool-form, #active-printer, #brand-saved, #spool-profile').evaluateAll(nodes =>
    nodes.flatMap(node => node.matches('form') ? [...node.elements].map(field => [field.id, field.value, field.checked, field.disabled]) :
      [[node.id, node.value, node.checked, node.disabled]]));
  const draft = await formState();
  const before = await remoteRows(page, 'spool_profiles');
  const writes = () => remote.calls.filter(call => /\/rpc\/calc3d_(save|archive)/.test(call.pathname));
  const count = writes().length;
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Consultar bobinas' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.consultation-row')).toHaveCount(3);
  await expect(dialog.locator('.consultation-row').first()).toContainText('Marca Dos');
  await expect(dialog.locator('.consultation-row').first()).toContainText('PETG · Rojo · 1.000 g');
  await expect(dialog.getByText('CLP 9.000', { exact: true })).toBeVisible();
  await expect(dialog.getByText('CLP 18.000/kg')).toBeVisible();
  await expect(dialog.getByText('CLP 0', { exact: true })).toBeVisible();
  await expect(dialog.getByText('CLP 0/kg')).toBeVisible();
  await expect(dialog.getByText('CLP 12.000/kg')).toBeVisible();
  await dialog.screenshot({ path: `test-results/spool-consultation-${testInfo.project.name}.png` });
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await dialog.getByLabel('Buscar bobinas').fill('marca uno');
  await expect(dialog.locator('.consultation-row')).toHaveCount(2);
  await dialog.getByLabel('Buscar bobinas').fill('PLA');
  await expect(dialog.locator('.consultation-row')).toHaveCount(2);
  await dialog.getByLabel('Buscar bobinas').fill('seda 500');
  await expect(dialog.locator('.consultation-row')).toHaveCount(1);
  await dialog.getByLabel('Buscar bobinas').fill('azul');
  await expect(dialog.locator('.consultation-row')).toHaveCount(1);
  await expect(dialog).toContainText('Seda 500 g');
  await dialog.getByLabel('Buscar bobinas').fill('sin resultados');
  await expect(dialog.getByText('No hay bobinas que coincidan con la búsqueda.')).toBeVisible();
  await dialog.getByLabel('Buscar bobinas').fill('');
  await dialog.locator('#consultation-brand').selectOption('Marca Uno');
  await dialog.locator('#consultation-material').selectOption('PLA');
  await expect(dialog.locator('.consultation-row')).toHaveCount(2);
  await dialog.getByLabel('Ordenar por').selectOption('price-desc');
  await expect(dialog.locator('.consultation-row').first()).toContainText('Seda 1 kg');
  await dialog.getByLabel('Ordenar por').selectOption('price-asc');
  await expect(dialog.locator('.consultation-row').first()).toContainText('Seda 500 g');
  await dialog.locator('#consultation-brand').selectOption('Marca Dos');
  await expect(dialog.getByText('No hay bobinas que coincidan con la búsqueda.')).toBeVisible();
  await dialog.locator('#consultation-material').selectOption('');
  await expect(dialog).toContainText('Mate 1 kg');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Consultar bobinas' })).toBeFocused();
  expect(await formState()).toEqual(draft);
  await expect(page.locator('#spool-profile')).toHaveValue(ids[1]);
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
  expect(writes()).toHaveLength(count);
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  await expect(dialog.locator('.consultation-row')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Cerrar consulta' }).click();
  await expect(page.getByRole('button', { name: 'Consultar bobinas' })).toBeFocused();
});

test('consultation distinguishes empty account and read failure; reopening reads fresh saves', async ({ page, remote }) => {
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Consultar bobinas' });
  await expect(dialog.getByText('Todavía no hay bobinas guardadas.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar consulta' }).click();
  await page.locator('#spool-name').fill('Nuevo PLA');
  await page.locator('#spool-material').fill('PLA');
  await page.locator('#spool-purchasePrice').fill('10000');
  await page.locator('#spool-netWeightGrams').fill('500');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  await expect(dialog).toContainText('Nuevo PLA');
  await dialog.getByRole('button', { name: 'Cerrar consulta' }).click();
  remote.fail = '/rest/v1/calc3d_spool_profiles';
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  await expect(dialog.getByText('No se pudieron leer las bobinas. Cierra y vuelve a intentar.')).toBeVisible();
  await expect(dialog.locator('.consultation-row')).toHaveCount(0);
  remote.fail = null;
  await dialog.getByRole('button', { name: 'Cerrar consulta' }).click();
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  await expect(dialog).toContainText('Nuevo PLA');
});

test('account switch clears hidden consultation filters and prior owner text', async ({ page, remote }) => {
  remote.brands = [brand(remote, ids[1], 'Marca Antigua')];
  remote.profiles = [profile(remote, ids[0], 'Solo primer dueño', 'Material Antiguo', ids[1], 10000, 500)];
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Consultar bobinas' });
  await expect(dialog).toContainText('Solo primer dueño');
  await expect(dialog.locator('#consultation-brand option')).toContainText(['Todas las marcas', 'Marca Antigua']);
  await expect(dialog.locator('#consultation-material option')).toContainText(['Todos los materiales', 'Material Antiguo']);
  await dialog.getByLabel('Buscar bobinas').fill('Solo primer dueño');
  await dialog.locator('#consultation-brand').selectOption('Marca Antigua');
  await dialog.locator('#consultation-material').selectOption('Material Antiguo');
  await dialog.locator('#consultation-sort').selectOption('price-desc');
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  const error = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
  });
  expect(error).toBeNull();
  await expect(dialog).not.toBeVisible();
  const hiddenDialog = page.locator('#spool-consultation');
  await expect(hiddenDialog.locator('#consultation-search')).toHaveValue('');
  await expect(hiddenDialog.locator('#consultation-brand option')).toHaveCount(1);
  await expect(hiddenDialog.locator('#consultation-material option')).toHaveCount(1);
  expect(await hiddenDialog.evaluate(node => node.textContent)).not.toContain('Marca Antigua');
  expect(await hiddenDialog.evaluate(node => node.textContent)).not.toContain('Material Antiguo');
  expect(await hiddenDialog.evaluate(node => node.textContent)).not.toContain('Solo primer dueño');
  await expect(hiddenDialog.locator('#consultation-sort')).toHaveValue('name');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  await expect(dialog.getByText('Todavía no hay bobinas guardadas.')).toBeVisible();
});

test('deferred read is discarded on account switch and cannot repaint an old owner', async ({ page, remote }) => {
  remote.profiles = [profile(remote, ids[0], 'Solo primer dueño', 'PLA', null, 10000, 500)];
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  let release;
  remote.holdProfiles = new Promise(resolve => { release = resolve; });
  const path = '/rest/v1/calc3d_spool_profiles';
  const prior = remote.reads[path];
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Consultar bobinas' });
  await expect(dialog.getByText('Cargando bobinas…')).toBeVisible();
  await expect.poll(() => remote.reads[path]).toBeGreaterThan(prior);
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  const error = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
  });
  expect(error).toBeNull();
  await expect(dialog).not.toBeVisible();
  remote.holdProfiles = null;
  release();
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar bobinas' }).click();
  await expect(dialog.getByText('Todavía no hay bobinas guardadas.')).toBeVisible();
  await expect(dialog).not.toContainText('Solo primer dueño');
});
