import { signedInEmptyTest as test, expect, remoteRows, remotePrinterState } from './supabase-fixture.mjs';

test('S1-S3: save a presentation, reload, edit the same revision and retain custom material', async ({ page }) => {
  await page.goto('/settings.html');
  await expect(page.getByRole('heading', { name: 'Bobinas' })).toBeVisible();
  await expect(page.locator('#spool-purchasePrice')).toBeEmpty();
  await expect(page.locator('#spool-netWeightGrams')).toBeEmpty();
  await page.locator('#spool-name').fill('PLA 750 g');
  await page.locator('#spool-material').fill('PLA seda');
  await page.locator('#spool-brand').fill('Marca propia');
  await page.locator('#spool-purchasePrice').fill('0');
  await page.locator('#spool-netWeightGrams').fill('750');
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const [created] = await remoteRows(page, 'spool_profiles');
  expect(created).toMatchObject({ name: 'PLA 750 g', material: 'PLA seda', brand: 'Marca propia', purchase_price: 0, net_weight_grams: 750, revision: 1 });
  await page.reload();
  await expect(page.locator('#spool-profile')).toHaveValue(created.id);
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveValue('0');
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('1000');
  expect((await remoteRows(page, 'spool_profiles'))[0]).toEqual(created);
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const [updated] = await remoteRows(page, 'spool_profiles');
  expect(updated).toMatchObject({ id: created.id, purchase_price: 21900, net_weight_grams: 1000, revision: 2 });
  await page.reload();
  await expect(page.locator('#spool-profile')).toHaveValue(created.id);
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-material')).toHaveValue('PLA seda');
  await expect(page.locator('#spool-netWeightGrams')).toHaveValue('1000');
  expect((await remoteRows(page, 'spool_profiles'))[0]).toEqual(updated);
});

test('S1-S3: confirmed save survives list refresh failure and next save updates the same profile', async ({ page, remote }) => {
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.locator('#spool-name').fill('PETG azul 1 kg');
  await page.locator('#spool-material').fill('PETG');
  await page.locator('#spool-brand').fill('Mi marca');
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('1000');
  const path = '/rest/v1/calc3d_spool_profiles';
  remote.failAfter = { path, after: remote.reads[path] };
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  await expect(page.locator('#spool-feedback')).toContainText('No se pudo actualizar la lista');
  remote.failAfter = null;
  const [created] = await remoteRows(page, 'spool_profiles');
  expect(created).toMatchObject({ name: 'PETG azul 1 kg', material: 'PETG', brand: 'Mi marca',
    purchase_price: 21900, net_weight_grams: 1000, revision: 1 });
  await expect(page.locator('#spool-profile')).toHaveValue(created.id);
  await page.locator('#spool-purchasePrice').fill('22000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const rows = await remoteRows(page, 'spool_profiles');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: created.id, name: created.name, material: created.material,
    brand: created.brand, purchase_price: 22000, net_weight_grams: 1000, revision: 2 });
});

test('S1-S3: deferred old-owner list never repaints after an account switch', async ({ page, remote }) => {
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.locator('#spool-name').fill('Bobina del primer dueño');
  await page.locator('#spool-material').fill('PLA');
  await page.locator('#spool-purchasePrice').fill('9000');
  await page.locator('#spool-netWeightGrams').fill('500');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  expect(await remoteRows(page, 'spool_profiles')).toHaveLength(1);
  const path = '/rest/v1/calc3d_spool_profiles';
  const priorReads = remote.reads[path];
  let release;
  remote.holdProfiles = new Promise(resolve => { release = resolve; });
  await page.reload();
  await expect.poll(() => remote.reads[path]).toBeGreaterThan(priorReads);
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  const signInError = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    const { error } = await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' });
    return error?.message ?? null;
  });
  expect(signInError).toBeNull();
  await expect(page.locator('#save-spool')).toBeDisabled();
  remote.holdProfiles = null;
  release();
  await expect(page.locator('#save-printer')).toBeEnabled();
  await expect(page.locator('#save-spool')).toBeEnabled();
  await expect(page.locator('#spool-profile option')).toHaveCount(1);
  await expect(page.locator('#spool-profile')).toHaveValue('');
  await expect(page.locator('#spool-feedback')).not.toContainText('guardada');
  await expect(page.locator('#spool-name')).toBeEmpty();
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
});

test('S1-S3: suggested and custom materials, invalid price and weight never write', async ({ page }) => {
  await page.goto('/settings.html');
  await expect(page.locator('#spool-materials option')).toHaveCount(7);
  expect(await page.locator('#spool-materials option').evaluateAll(options => options.map(option => option.value)))
    .toEqual(['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PC', 'PVA/BVOH']);
  await page.locator('#new-spool').click();
  await page.locator('#spool-name').fill('Especial');
  await page.locator('#spool-material').fill('PETG personalizado');
  const before = await remoteRows(page, 'spool_profiles');
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveAttribute('aria-invalid', 'true');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('0');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-netWeightGrams')).toHaveAttribute('aria-invalid', 'true');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const saved = await remoteRows(page, 'spool_profiles');
  await page.locator('#edit-spool').click();
  await page.locator('#spool-purchasePrice').fill('-1');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-purchasePrice')).toHaveAttribute('aria-invalid', 'true');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(saved);
  const conflict = await page.evaluate(async row => {
    const { client } = await import('/src/auth/browser.mjs');
    const { error } = await client.rpc('calc3d_save_spool_profile', {
      payload: { name: row.name, material: row.material, brand: row.brand,
        purchasePrice: row.purchase_price, netWeightGrams: row.net_weight_grams },
      profile_id: row.id, expected_revision: 0,
    });
    return error?.code;
  }, saved[0]);
  expect(conflict).toBe('40001');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(saved);
});

test('S1-S3: profile read and save errors do not disable printer controls or change records', async ({ page, remote }) => {
  await page.goto('/settings.html');
  await expect(page.locator('#save-printer')).toBeEnabled();
  remote.fail = '/rest/v1/calc3d_spool_profiles';
  await page.reload();
  await expect(page.locator('#spool-error')).toContainText('No se pudieron leer');
  await expect(page.locator('#save-spool')).toBeDisabled();
  await expect(page.locator('#save-printer')).toBeEnabled();
  remote.fail = null;
  await page.reload();
  await page.locator('#new-spool').click();
  await page.locator('#spool-name').fill('PETG 1 kg');
  await page.locator('#spool-material').fill('PETG');
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('1000');
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
