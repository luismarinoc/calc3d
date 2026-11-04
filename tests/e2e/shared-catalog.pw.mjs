import { signedInEmptyTest as test, expect, remoteQuotes } from './supabase-fixture.mjs';

const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const other = '22222222-2222-4222-8222-222222222222';
const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-azul';
const product = (name = 'PLA Azul común', material = 'PLA') => ({ id, origin: 'supplier', sku: 'PLA-AZUL', source_url: url,
  status: 'confirmed', profile: { name, material, brand: 'Proveedor', purchasePrice: 12000,
    netWeightGrams: 1000, filamentColor: 'Azul' }, pending: null, revision: 1,
  source_sha256: 'a'.repeat(64), normalized_sha256: 'b'.repeat(64) });
const pending = () => ({ ...product(), id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'pending',
  profile: null, pending: { name: 'PETG por confirmar', material: 'PETG', brand: 'Proveedor',
    filamentColor: 'Verde', referencePriceClp: 9000, reasons: ['Peso por confirmar'] } });
const writes = remote => remote.calls.filter(call => /\/rpc\/calc3d_(save|hide|archive|create|update)/.test(call.pathname));
const switchAccount = async (page, remote, role = 'member') => {
  remote.user = { ...remote.user, id: other, email: 'other@example.test' };
  remote.role = role;
  await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    await client.auth.signInWithPassword({ email: 'other@example.test', password: 'fake-password' });
  });
  await expect(page.locator('.account-nav')).toBeVisible();
};

test('S1-S3: member sees common confirmed and pending, selects only confirmed and cannot edit or publish private rows', async ({ page, remote }) => {
  remote.sharedProducts = [product(), pending()];
  remote.profiles.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: other,
    name: 'Privada ajena', material: 'PLA', brand: '', purchase_price: 1000, net_weight_grams: 1000,
    revision: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText('Privada ajena');
  const row = page.locator('.consultation-row').filter({ hasText: 'PETG por confirmar' });
  await expect(row).toContainText('No cotizable');
  await expect(row.getByRole('link', { name: /Editar/ })).toHaveCount(0);
  await expect(page.locator('.consultation-row').getByRole('link', { name: /Editar/ })).toHaveCount(0);
  await page.goto('/index.html');
  await expect(page.locator('#spoolId')).toHaveValue(`base:${id}`);
  await expect(page.locator('body')).not.toContainText('PETG por confirmar');
  expect(writes(remote)).toEqual([]);
  expect(remote.number).toBe(0);
  expect(remote.sharedProducts).toEqual([product(), pending()]);
});

test('member cannot open common editor by deep link or forged submit', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  await page.goto(`/settings.html?editSpool=base:${id}#spool-form`);
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  await expect(page.locator('#spool-form')).toBeHidden();
  await expect(page.locator('#new-spool')).toBeHidden();
  await page.locator('#spool-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await page.locator('#edit-spool').evaluate(button => button.click());
  await page.locator('#new-spool').evaluate(button => button.click());
  expect(writes(remote)).toEqual([]);
  expect(remote.sharedProducts).toEqual([product()]);
  expect(remote.number).toBe(0);
});

test('admin creates and edits common product; other account reads the same values and cannot edit', async ({ page, remote }) => {
  remote.role = 'admin';
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.locator('#spool-name').fill('PLA manual');
  await page.locator('#spool-material').fill('PLA');
  await page.locator('#spool-purchasePrice').fill('12000');
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo común');
  expect(remote.sharedProducts).toHaveLength(1);
  const created = remote.sharedProducts[0];
  expect(created).toMatchObject({ origin: 'manual', source_url: null, sku: null, revision: 1,
    profile: { name: 'PLA manual', brand: '', purchasePrice: 12000, netWeightGrams: 1000 } });
  const createCall = writes(remote).find(call => call.pathname.endsWith('calc3d_create_common_product'));
  expect(createCall.body).toEqual({ payload: { name: 'PLA manual', material: 'PLA', brand: '', purchasePrice: 12000, netWeightGrams: 1000 } });
  await page.locator('#spool-purchasePrice').fill('16000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo común');
  expect(remote.sharedProducts[0]).toMatchObject({ revision: 2, profile: { purchasePrice: 16000 } });
  expect(writes(remote).find(call => call.pathname.endsWith('calc3d_update_common_product')).body).toEqual({
    product_id: created.id, expected_revision: 1,
    payload: { name: 'PLA manual', material: 'PLA', brand: '', purchasePrice: 16000, netWeightGrams: 1000 },
  });
  await switchAccount(page, remote);
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toContainText('CLP 16.000');
  await expect(page.locator('.consultation-row').getByRole('link', { name: /Editar/ })).toHaveCount(0);
  expect(remote.sharedProducts[0].revision).toBe(2);
  expect(remote.number).toBe(0);
});

test('admin supplier match keeps private identity and archives but edits common target', async ({ page, remote }) => {
  remote.role = 'admin'; remote.sharedProducts = [product()];
  remote.profiles = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: remote.user.id,
    name: 'Mi PLA', material: 'PLA', brand: 'Propia', purchase_price: 18000, net_weight_grams: 750,
    source_url: url, supplier_sku: 'PLA-AZUL', revision: 1, archived_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
  await page.goto('/settings.html');
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  await page.locator('.spool-picker-trigger').click();
  await page.locator('.spool-picker-option').filter({ hasText: 'PLA Azul común' }).click();
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-name')).toHaveValue('PLA Azul común');
  await expect(page.locator('#archive-spool')).toBeHidden();
  await page.locator('#spool-purchasePrice').fill('17000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo común');
  expect(writes(remote).filter(call => /common_product/.test(call.pathname)).map(call => call.body)).toEqual([{
    product_id: id, expected_revision: 1,
    payload: { name: 'PLA Azul común', material: 'PLA', brand: 'Proveedor', purchasePrice: 17000, netWeightGrams: 1000 },
  }]);
  expect(remote.profiles[0]).toMatchObject({ name: 'Mi PLA', purchase_price: 18000, archived_at: null, revision: 1 });
  await page.goto('/index.html');
  await expect(page.locator('#spoolId')).toHaveValue(`profile:${remote.profiles[0].id}`);
  expect(remote.number).toBe(0);
});

test('member saves own common quote, reopens snapshot after common update, and second account cannot read it', async ({ page, remote }) => {
  remote.sharedProducts = [product()];
  await page.goto('/index.html');
  await expect(page.locator('#spoolId')).toHaveValue(`base:${id}`);
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('guardado');
  const snapshot = structuredClone(remote.quotes[0]);
  expect(snapshot.input.spool).toMatchObject({ purchasePrice: 12000, netWeightGrams: 1000 });
  remote.sharedProducts[0] = { ...product('PLA nuevo'), revision: 2, profile: { ...product().profile, purchasePrice: 16000 } };
  await page.reload();
  await expect(page.locator('#spoolId')).toHaveValue(`base:${id}`);
  expect(remote.quotes[0]).toEqual(snapshot);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#feedback')).toContainText('Copia abierta');
  await expect(page.locator('#result-content .result-row').filter({ hasText: 'Material' }))
    .toContainText(new Intl.NumberFormat('es-CL').format(snapshot.result.breakdown.material));
  expect(remote.quotes[0]).toEqual(snapshot);
  // Explicitly select the current common spool before saving a new copy at the new price.
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  await page.locator(`#calculator-spool-picker-list [data-id="base:${id}"]`).click();
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000002');
  expect(remote.quotes[1]).toEqual(snapshot);
  expect(remote.quotes[0].input.spool).toMatchObject({ purchasePrice: 16000, netWeightGrams: 1000 });
  await switchAccount(page, remote);
  expect(await remoteQuotes(page)).toEqual([]);
  await page.goto('/index.html');
  await expect(page.locator('#spoolId')).toHaveValue(`base:${id}`);
  expect(remote.quotes[1]).toEqual(snapshot);
  expect(remote.number).toBe(2);
});

test('member purchase submit cannot create inventory or consume counters', async ({ page, remote }) => {
  await page.goto('/purchases.html');
  await expect(page.locator('main')).toHaveJSProperty('inert', false);
  await expect(page.locator('#purchase-permission')).toContainText('Solo administradores');
  await expect(page.locator('#purchase-save')).toBeDisabled();
  await page.locator('#purchase-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(writes(remote)).toEqual([]);
  expect(remote.purchases).toEqual([]);
  expect(remote.spools).toEqual([]);
  expect(remote.number).toBe(0);
});
