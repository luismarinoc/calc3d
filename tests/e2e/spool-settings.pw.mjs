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

test('admin creates common presentation, reloads and edits without creating private profile', async ({ page, remote }) => {
  remote.role = 'admin'; remote.brands = [ownedBrand(remote, 'Marca propia')];
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await fillSpool(page);
  await page.locator('#spool-brandId').selectOption(remote.brands[0].id);
  expect(await remoteRows(page, 'shared_products')).toEqual([]);
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo común');
  const [created] = await remoteRows(page, 'shared_products');
  expect(created).toMatchObject({ origin: 'manual', revision: 1,
    profile: { name: 'PLA 750 g', material: 'PLA seda', brand: 'Marca propia', purchasePrice: 0, netWeightGrams: 750 } });
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
  await page.reload();
  await expect(page.locator('#spool-profile')).toHaveValue(`base:${created.id}`);
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveValue('0');
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada en el catálogo común');
  const [updated] = await remoteRows(page, 'shared_products');
  expect(updated).toMatchObject({ id: created.id, revision: 2,
    profile: { name: 'PLA 750 g', material: 'PLA seda', brand: 'Marca propia', purchasePrice: 21900, netWeightGrams: 1000 } });
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
  await page.reload();
  await expect(page.locator('#spool-profile')).toHaveValue(`base:${created.id}`);
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-material')).toHaveValue('PLA seda');
  await expect(page.locator('#spool-netWeightGrams')).toHaveValue('1000');
});

test('common write acknowledgment survives list failure; next edit uses same common identity', async ({ page, remote }) => {
  remote.role = 'admin';
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await fillSpool(page, { name: 'PETG azul 1 kg', material: 'PETG', price: '21900', weight: '1000' });
  const path = '/rest/v1/calc3d_shared_products';
  remote.failAfter = { path, after: remote.reads[path] };
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('No se pudo actualizar la lista');
  remote.failAfter = null;
  const [created] = await remoteRows(page, 'shared_products');
  expect(created).toMatchObject({ origin: 'manual', revision: 1, profile: { purchasePrice: 21900 } });
  await expect(page.locator('#spool-profile')).toHaveValue(`base:${created.id}`);
  await page.locator('#spool-purchasePrice').fill('22000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const rows = await remoteRows(page, 'shared_products');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: created.id, revision: 2, profile: { purchasePrice: 22000 } });
});

test('deferred old-owner private list never repaints after switch; common creation stays available', async ({ page, remote }) => {
  remote.role = 'admin';
  remote.profiles = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: remote.user.id,
    name: 'Bobina del primer dueño', material: 'PLA', brand: '', purchase_price: 9000, net_weight_grams: 500,
    revision: 1, created_at: stamp, updated_at: stamp }];
  await page.goto('/settings.html');
  await expect(page.locator('#spool-profile option')).toHaveCount(2);
  const path = '/rest/v1/calc3d_spool_profiles';
  const priorReads = remote.reads[path];
  let release;
  remote.holdProfiles = new Promise(resolve => { release = resolve; });
  await page.reload();
  await expect.poll(() => remote.reads[path]).toBeGreaterThan(priorReads);
  await expect(page.locator('#save-printer')).toBeEnabled();
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  try {
    const error = await page.evaluate(async () => {
      const { client } = await import('/src/auth/browser.mjs');
      return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
    });
    expect(error).toBeNull();
    await expect(page.locator('#save-spool')).toBeDisabled();
  } finally { remote.holdProfiles = null; release(); }
  await expect(page.locator('#save-printer')).toBeEnabled();
  await expect(page.locator('#save-spool')).toBeEnabled();
  await expect(page.locator('#spool-profile option')).toHaveCount(1);
  await expect(page.locator('#spool-profile')).toHaveValue('');
  await expect(page.locator('#spool-name')).toBeEmpty();
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
  expect(remote.profiles).toHaveLength(1);
});

test('admin invalid fields and stale common CAS reject without changing rows, quotes or counters', async ({ page, remote }) => {
  remote.role = 'admin';
  await page.goto('/settings.html');
  await expect(page.locator('#spool-materials option')).toHaveCount(7);
  expect(await page.locator('#spool-materials option').evaluateAll(options => options.map(option => option.value)))
    .toEqual(['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PC', 'PVA/BVOH']);
  await fillSpool(page, { name: 'Especial', material: 'PETG personalizado', price: '', weight: '1000' });
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveAttribute('aria-invalid', 'true');
  expect(await remoteRows(page, 'shared_products')).toEqual([]);
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('0');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-netWeightGrams')).toHaveAttribute('aria-invalid', 'true');
  expect(await remoteRows(page, 'shared_products')).toEqual([]);
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const [saved] = await remoteRows(page, 'shared_products');
  await page.locator('#spool-purchasePrice').fill('-1');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveAttribute('aria-invalid', 'true');
  expect(await remoteRows(page, 'shared_products')).toEqual([saved]);
  remote.sharedProducts = [{ ...saved, revision: 2, profile: { ...saved.profile, name: 'Otra pestaña' } }];
  await page.locator('#spool-purchasePrice').fill('22000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('cambió');
  expect(remote.sharedProducts[0]).toMatchObject({ revision: 2, profile: { name: 'Otra pestaña', purchasePrice: 21900 } });
  expect(remote.quotes).toEqual([]);
  expect(remote.number).toBe(0);
});

test('private legacy maintenance and read errors do not disable unrelated printer controls', async ({ page, remote }) => {
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
