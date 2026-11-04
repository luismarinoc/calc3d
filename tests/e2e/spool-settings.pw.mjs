import { signedInEmptyTest as test, expect, remoteRows, remotePrinterState } from './supabase-fixture.mjs';

const stamp = '2026-01-01T00:00:00.000Z';
const ownedBrand = (remote, name) => ({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner_id: remote.user.id,
  name, normalized_name: name.toLowerCase(), color: '#123456', aliases: [name.toLowerCase()], revision: 1,
  created_at: stamp, updated_at: stamp });
async function fillSpool(page, { name = 'PLA 750 g', material = 'PLA seda', price = '0', weight = '750' } = {}) {
  await page.locator('#spool-name').fill(name);
  await page.locator('#spool-material').fill(material);
  await page.locator('#spool-purchasePrice').fill(price);
  await page.locator('#spool-netWeightGrams').fill(weight);
}

test('admin creates original profile with brand, reloads and edits in place', async ({ page, remote }) => {
  remote.role = 'admin'; remote.brands = [ownedBrand(remote, 'Marca propia')];
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await fillSpool(page);
  await page.locator('#spool-brandId').selectOption(remote.brands[0].id);
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo');
  const [created] = await remoteRows(page, 'spool_profiles');
  expect(created).toMatchObject({ revision: 1, brand_id: remote.brands[0].id,
    name: 'PLA 750 g', material: 'PLA seda', brand: 'Marca propia', purchase_price: 0, net_weight_grams: 750 });
  expect(remote.sharedProducts).toEqual([]);
  await page.reload();
  await expect(page.locator('#spool-profile')).toHaveValue(created.id);
  await page.locator('#edit-spool').click();
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo');
  const [updated] = await remoteRows(page, 'spool_profiles');
  expect(updated).toMatchObject({ id: created.id, owner_id: created.owner_id, brand_id: created.brand_id,
    revision: 2, purchase_price: 21900, net_weight_grams: 1000 });
  expect(remote.sharedProducts).toEqual([]);
});

test('write acknowledgment survives profile-list failure and next edit keeps ID', async ({ page, remote }) => {
  remote.role = 'admin';
  await page.goto('/settings.html');
  await fillSpool(page, { name: 'PETG azul 1 kg', material: 'PETG', price: '21900', weight: '1000' });
  const path = '/rest/v1/calc3d_spool_profiles';
  remote.failAfter = { path, after: remote.reads[path] };
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('No se pudo actualizar la lista');
  remote.failAfter = null;
  const [created] = await remoteRows(page, 'spool_profiles');
  await expect(page.locator('#spool-profile')).toHaveValue(created.id);
  await page.locator('#spool-purchasePrice').fill('22000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  expect(remote.profiles).toHaveLength(1);
  expect(remote.profiles[0]).toMatchObject({ id: created.id, revision: 2, purchase_price: 22000 });
});

test('deferred former-session read never repaints after account switch; catalog remains visible', async ({ page, remote }) => {
  remote.role = 'admin';
  remote.profiles = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: remote.user.id,
    name: 'Bobina de catálogo', material: 'PLA', brand: '', purchase_price: 9000, net_weight_grams: 500,
    revision: 1, created_at: stamp, updated_at: stamp }];
  await page.goto('/settings.html');
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  const path = '/rest/v1/calc3d_spool_profiles'; const priorReads = remote.reads[path];
  let release;
  remote.holdProfiles = new Promise(resolve => { release = resolve; });
  await page.reload();
  await expect.poll(() => remote.reads[path]).toBeGreaterThan(priorReads);
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  try {
    await page.evaluate(async () => {
      const { client } = await import('/src/auth/browser.mjs');
      await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' });
    });
  } finally { remote.holdProfiles = null; release(); }
  await expect(page.locator('#save-printer')).toBeEnabled();
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  await expect(page.locator('#spool-profile')).toHaveValue('');
  await expect(page.locator('#spool-name')).toBeEmpty();
  expect(remote.profiles).toHaveLength(1);
});

test('admin invalid fields and stale original-profile CAS leave rows and counters unchanged', async ({ page, remote }) => {
  remote.role = 'admin';
  await page.goto('/settings.html');
  await expect(page.locator('#spool-materials option')).toHaveCount(7);
  await fillSpool(page, { name: 'Especial', material: 'PETG personalizado', price: '', weight: '1000' });
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveAttribute('aria-invalid', 'true');
  expect(remote.profiles).toEqual([]);
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('0');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-netWeightGrams')).toHaveAttribute('aria-invalid', 'true');
  expect(remote.profiles).toEqual([]);
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const [saved] = await remoteRows(page, 'spool_profiles');
  await page.locator('#spool-purchasePrice').fill('-1');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveAttribute('aria-invalid', 'true');
  expect(remote.profiles).toEqual([saved]);
  remote.profiles = [{ ...saved, revision: 2, name: 'Otra pestaña' }];
  await page.locator('#spool-purchasePrice').fill('22000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('cambió');
  expect(remote.profiles[0]).toMatchObject({ revision: 2, name: 'Otra pestaña', purchase_price: 21900 });
  expect(remote.quotes).toEqual([]); expect(remote.number).toBe(0);
});

test('profile maintenance and read errors do not disable unrelated printer controls', async ({ page, remote }) => {
  remote.role = 'admin';
  remote.profiles = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: remote.user.id,
    name: 'PETG 1 kg', material: 'PETG', brand: '', purchase_price: 21900, net_weight_grams: 1000,
    revision: 1, created_at: stamp, updated_at: stamp }];
  await page.goto('/settings.html');
  await expect(page.locator('#save-printer')).toBeEnabled();
  remote.fail = '/rest/v1/calc3d_spool_profiles';
  await page.reload();
  await expect(page.locator('#spool-error')).toContainText('No se pudieron leer');
  await expect(page.locator('#save-spool')).toBeDisabled();
  await expect(page.locator('#save-printer')).toBeEnabled();
  remote.fail = null;
  await page.reload();
  await page.locator('.spool-picker-trigger').click();
  await page.locator('#spool-picker-list [data-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]').click();
  await page.locator('#edit-spool').click();
  await page.locator('#spool-purchasePrice').fill('22000');
  const before = await remoteRows(page, 'spool_profiles');
  remote.fail = '/rpc/calc3d_save_spool_profile';
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('Network denied');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
  expect(await remotePrinterState(page)).toBeNull();
  await expect(page.locator('#save-printer')).toBeEnabled();
  remote.fail = '/rest/v1/calc3d_printer_settings';
  await page.reload();
  await expect(page.locator('#settings-error')).toContainText('No se pudo leer');
  await expect(page.locator('#save-printer')).toBeDisabled();
  await expect(page.locator('#save-spool')).toBeEnabled();
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
});
