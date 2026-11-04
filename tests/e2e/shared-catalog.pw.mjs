import { signedInEmptyTest as test, expect, remoteQuotes } from './supabase-fixture.mjs';

const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const other = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-01-01T00:00:00Z';
const row = (name = 'PLA existente') => ({ id, owner_id: other, name, material: 'PLA', brand: 'Proveedor',
  purchase_price: 12000, net_weight_grams: 1000, revision: 1, created_at: stamp, updated_at: stamp });
const writes = remote => remote.calls.filter(call => /\/rpc\/calc3d_(save|archive|create|update)/.test(call.pathname));

 test('S1-S2: member reads existing foreign-owned catalog, quotes, reopens own history, cannot edit', async ({ page, remote }) => {
  remote.profiles = [row()];
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toContainText('PLA existente');
  await expect(page.locator('.consultation-row').getByRole('link', { name: /Editar/ })).toHaveCount(0);
  await page.goto(`/settings.html?editSpool=${id}#spool-form`);
  await expect(page.locator('#spool-form')).toBeHidden();
  await page.locator('#spool-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(writes(remote)).toEqual([]);
  await page.goto('/index.html');
  await expect(page.locator('#spoolId')).toHaveValue(`profile:${id}`);
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  expect(remote.quotes[0].spool_id).toBe(`profile:${id}`);
  const saved = structuredClone(remote.quotes[0]);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#feedback')).toContainText('Copia abierta');
  expect(remote.quotes[0]).toEqual(saved);
  expect(remote.profiles).toEqual([row()]);
  expect(writes(remote).map(call => call.pathname)).toEqual(['/rest/v1/rpc/calc3d_save_quote']);
  remote.user = { ...remote.user, id: other, email: 'other@example.test' };
  await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    await client.auth.signInWithPassword({ email: 'other@example.test', password: 'fake-password' });
  });
  expect(await remoteQuotes(page)).toEqual([]);
});

test('admin creates and edits original profile ID; member sees update but cannot mutate it', async ({ page, remote }) => {
  remote.role = 'admin'; remote.profiles = [row()];
  await page.goto('/settings.html');
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  await page.locator('.spool-picker-trigger').click();
  await page.locator('.spool-picker-option').filter({ hasText: 'PLA existente' }).click();
  await page.locator('#edit-spool').click();
  await page.locator('#spool-purchasePrice').fill('16000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo');
  expect(remote.profiles[0]).toMatchObject({ id, owner_id: other, purchase_price: 16000, revision: 2 });
  expect(writes(remote).filter(call => call.pathname.endsWith('calc3d_save_spool_profile')).at(-1).body)
    .toMatchObject({ profile_id: id, expected_revision: 1 });
  remote.role = 'member';
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toContainText('CLP 16.000');
  await expect(page.locator('.consultation-row').getByRole('link', { name: /Editar/ })).toHaveCount(0);
});

test('foreign catalog aliases do not recolor private purchased spools', async ({ page, remote }) => {
  const own = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const foreign = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  remote.brands = [{ id: own, owner_id: remote.user.id, name: 'Propia', normalized_name: 'propia',
    aliases: ['propia', 'común'], color: '#123456', revision: 1, created_at: stamp, updated_at: stamp },
  { id: foreign, owner_id: other, name: 'Ajena', normalized_name: 'ajena',
    aliases: ['ajena', 'común'], color: '#ABCDEF', revision: 1, created_at: stamp, updated_at: stamp }];
  remote.profiles = [{ ...row(), brand: 'común', brand_id: foreign }];
  remote.spools = [{ id: 'bought-1', owner_id: remote.user.id, purchase_id: 'purchase-1', purchase_date: '2026-01-01',
    material: 'PLA', brand: 'común', color: 'Azul', purchase_price: 1000, net_weight_grams: 1000, remaining_grams: 1000 }];
  await page.goto('/index.html');
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  const options = page.locator('#calculator-spool-picker-list [role="option"]');
  await expect(options.filter({ hasText: 'Ajena' })).toHaveCount(1);
  const bought = options.filter({ hasText: 'compra de prueba' });
  await expect(bought).toContainText('Propia');
  await expect(bought.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  expect(remote.quotes).toEqual([]);
});

test('member purchase submit cannot create inventory or consume counters', async ({ page, remote }) => {
  await page.goto('/purchases.html');
  await expect(page.locator('#purchase-permission')).toContainText('Solo administradores');
  await expect(page.locator('#purchase-save')).toBeDisabled();
  await page.locator('#purchase-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(writes(remote)).toEqual([]);
  expect(remote.purchases).toEqual([]);
  expect(remote.spools).toEqual([]);
  expect(remote.number).toBe(0);
});
