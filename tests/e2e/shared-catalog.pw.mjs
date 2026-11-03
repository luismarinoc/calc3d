import { signedInEmptyTest as test, expect } from './supabase-fixture.mjs';

const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const other = '22222222-2222-4222-8222-222222222222';
const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-azul';
const product = (name = 'PLA Azul común', material = 'PLA') => ({ id, sku: 'PLA-AZUL', source_url: url,
  status: 'confirmed', profile: { name, material, brand: 'Proveedor', purchasePrice: 12000,
    netWeightGrams: 1000, filamentColor: 'Azul' }, pending: null, revision: 1,
  source_sha256: 'a'.repeat(64), normalized_sha256: 'b'.repeat(64) });
const pending = () => ({ ...product(), id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'pending',
  profile: null, pending: { name: 'PETG por confirmar', material: 'PETG', brand: 'Proveedor',
    filamentColor: 'Verde', referencePriceClp: 9000, reasons: ['Peso por confirmar'] } });
const writes = remote => remote.calls.filter(call => /\/rpc\/calc3d_(save|hide|archive)/.test(call.pathname));

 test('S1-S3: new account sees common confirmed and pending; pending cannot be quoted or edited, reads do not write', async ({ page, remote }) => {
  remote.sharedProducts = [product(), pending()];
  remote.profiles.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: other,
    name: 'Privada ajena', material: 'PLA', brand: '', purchase_price: 1000, net_weight_grams: 1000,
    revision: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText('Privada ajena');
  const row = page.locator('.consultation-row').filter({ hasText: 'PETG por confirmar' });
  await expect(row).toContainText('CLP 9.000');
  await expect(row).toContainText('No cotizable');
  await expect(row.getByRole('link', { name: /Editar/ })).toHaveCount(0);
  await page.goto('/index.html');
  await expect(page.locator('#spoolId option')).toHaveCount(1);
  await expect(page.locator('#spoolId')).toHaveValue(`base:${id}`);
  await expect(page.locator('body')).not.toContainText('PETG por confirmar');
  expect(writes(remote)).toHaveLength(0);
  expect(remote.number).toBe(0);
  expect(remote.sharedProducts).toEqual([product(), pending()]);
 });

 test('S2 S4 S5: base editor saves only touched fields with CAS, including equal value, and tracks new baseline fields', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  await page.goto(`/settings.html?editSpool=base:${id}#spool-form`);
  await expect(page.locator('#spool-name')).toHaveValue('PLA Azul común');
  await expect(page.locator('#spool-filamentColor')).toHaveValue('Azul');
  await page.locator('#save-spool').click();
  expect(writes(remote)).toHaveLength(0);
  await page.locator('#spool-name').fill('Mi PLA');
  await page.locator('#spool-material').fill('PETG');
  await page.locator('#spool-brandId').selectOption('legacy');
  await page.locator('#spool-purchasePrice').fill('12000');
  await page.locator('#spool-netWeightGrams').fill('750');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  expect(writes(remote).map(call => call.body)).toEqual([{ product_id: id, expected_revision: 0,
    fields: { name: 'Mi PLA', material: 'PETG', brand: 'Proveedor', purchasePrice: 12000, netWeightGrams: 750 } }]);
  expect(remote.sharedProducts).toEqual([product()]);
  expect(remote.sharedOverrides).toHaveLength(1);
  remote.sharedProducts = [product('PLA nuevo', 'ASA')];
  await page.reload();
  await expect(page.locator('#spool-name')).toHaveValue('Mi PLA');
  await expect(page.locator('#spool-material')).toHaveValue('PETG');
  expect(remote.sharedOverrides[0].revision).toBe(1);
  expect(remote.number).toBe(0);
 });

 test('S2 S5: single-field override leaves unmodified baseline changes visible to only this owner', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  await page.goto(`/settings.html?editSpool=base:${id}#spool-form`);
  await page.locator('#spool-purchasePrice').fill('16000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  expect(writes(remote).map(call => call.body)).toEqual([{ product_id: id, expected_revision: 0, fields: { purchasePrice: 16000 } }]);
  remote.sharedProducts = [product('PLA actualizado', 'ASA')];
  await page.reload();
  await expect(page.locator('#spool-name')).toHaveValue('PLA actualizado');
  await expect(page.locator('#spool-material')).toHaveValue('ASA');
  await expect(page.locator('#spool-purchasePrice')).toHaveValue('16000');
  remote.user = { ...remote.user, id: other, email: 'other@example.test' };
  await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    await client.auth.signInWithPassword({ email: 'other@example.test', password: 'fake-password' });
  });
  await expect(page.locator('#spool-purchasePrice')).not.toHaveValue('16000');
  expect(remote.sharedProducts).toEqual([product('PLA actualizado', 'ASA')]);
  expect(remote.sharedOverrides).toHaveLength(1);
 });

 test('S6: exact supplier identity prioritizes personal profile without duplicating base', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  remote.profiles = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: remote.user.id,
    name: 'Mi PLA', material: 'PLA', brand: 'Propia', purchase_price: 18000, net_weight_grams: 750,
    source_url: url, supplier_sku: 'PLA-AZUL', revision: 1,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
  await page.goto('/index.html');
  await expect(page.locator('#spoolId option')).toHaveCount(1);
  await expect(page.locator('#spoolId')).toHaveValue(`profile:${remote.profiles[0].id}`);
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toHaveCount(1);
  await expect(page.locator('.consultation-row')).toContainText('Mi PLA');
  expect(writes(remote)).toHaveLength(0);
  expect(remote.profiles).toHaveLength(1);
  expect(remote.number).toBe(0);
 });

 test('S2 S4: quoted shared price and weight are effective while saved historical snapshot remains fixed', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  await page.goto(`/settings.html?editSpool=base:${id}#spool-form`);
  await page.locator('#spool-purchasePrice').fill('16000');
  await page.locator('#spool-netWeightGrams').fill('800');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  await page.goto('/index.html');
  await expect(page.locator('#spoolId')).toHaveValue(`base:${id}`);
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('guardado');
  expect(remote.quotes).toHaveLength(1);
  expect(remote.quotes[0].input.spool).toMatchObject({ purchasePrice: 16000, netWeightGrams: 800 });
  const snapshot = structuredClone(remote.quotes[0]);
  remote.sharedProducts = [product('PLA nuevo', 'ASA')];
  await page.reload();
  expect(remote.quotes[0]).toEqual(snapshot);
  expect(remote.number).toBe(1);
  expect(writes(remote).map(call => call.pathname.split('/').at(-1))).toEqual(['calc3d_save_shared_override', 'calc3d_save_quote']);
 });

 test('S2 S4: invalid edits and stale revisions leave the catalog, counters and history unchanged', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  await page.goto(`/settings.html?editSpool=base:${id}#spool-form`);
  await page.locator('#spool-netWeightGrams').fill('0');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('peso neto');
  expect(writes(remote)).toHaveLength(0);
  expect(remote.sharedOverrides).toEqual([]);
  expect(remote.number).toBe(0);
  await page.locator('#spool-netWeightGrams').fill('800');
  remote.sharedOverrides = [{ owner_id: remote.user.id, base_id: id, fields: { name: 'Otra pestaña' }, hidden: false, revision: 1 }];
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('cambió');
  expect(writes(remote).map(call => call.body)).toEqual([{ product_id: id, expected_revision: 0, fields: { netWeightGrams: 800 } }]);
  expect(remote.sharedOverrides).toEqual([{ owner_id: remote.user.id, base_id: id, fields: { name: 'Otra pestaña' }, hidden: false, revision: 1 }]);
  expect(remote.sharedProducts).toEqual([product()]);
  expect(remote.quotes).toEqual([]);
  expect(remote.number).toBe(0);
 });

 test('S2: hiding base affects only current account and leaves source intact', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  await page.goto('/settings.html');
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  await page.locator('.spool-picker-trigger').click();
  await page.locator('.spool-picker-option').filter({ hasText: 'PLA Azul común' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#archive-spool').click();
  await expect(page.locator('#spool-profile option')).toHaveCount(1);
  expect(writes(remote).map(call => call.body)).toEqual([{ product_id: id, expected_revision: 0 }]);
  expect(remote.sharedProducts).toEqual([product()]);
  remote.user = { ...remote.user, id: other, email: 'other@example.test' };
  await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    await client.auth.signInWithPassword({ email: 'other@example.test', password: 'fake-password' });
  });
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  expect(remote.number).toBe(0);
 });
