import { test, expect, signIn, remoteRows, remoteQuotes, seedHistoricalQuote } from './supabase-fixture.mjs';

const stamp = '2026-01-01T00:00:00.000Z';
const brandId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function seed(remote) {
  remote.brands = [{ id: brandId, owner_id: remote.user.id, name: 'Prueba', normalized_name: 'prueba',
    color: '#123456', aliases: ['prueba'], revision: 1, archived_at: null, created_at: stamp, updated_at: stamp }];
  remote.profiles = [profileId, secondId].map((id, i) => ({ id, owner_id: remote.user.id,
    name: i ? 'PLA 1 kg' : 'PETG 1 kg', material: i ? 'PLA' : 'PETG', brand: 'Prueba', brand_id: brandId,
    filament_color: 'Azul', filament_color_hex: '#336699', purchase_price: i ? 18000 : 12000,
    net_weight_grams: 1000, revision: 1, archived_at: null, created_at: stamp, updated_at: stamp }));
  remote.purchases = [{ id: 'purchase-1', owner_id: remote.user.id, created_at: stamp, purchase_date: '2026-01-01',
    supplier: { name: 'Shop' }, notes: '', lines: [], total: 200, spool_count: 1 }];
  remote.spools = [{ id: 'bought-1', owner_id: remote.user.id, purchase_id: 'purchase-1',
    purchase_date: '2026-01-01', supplier: { name: 'Shop' }, material: 'PETG', brand: 'Prueba',
    color: 'Azul', purchase_price: 200, net_weight_grams: 1000, remaining_grams: 1000 }];
  remote.quotes = [];
  remote.number = 0;
}
const archiveCalls = remote => remote.calls.filter(call => call.pathname.includes('/rpc/calc3d_archive_'));
async function seedQuote(page, remote) {
  return seedHistoricalQuote(page, remote, { title: 'Cotización anterior', spoolId: 'demo-petg', purpose: 'sale',
    purchasePrice: '10000', netWeightGrams: '1000', grams: '1000', hours: '0', minutes: '0', watts: '0',
    electricityPricePerKwh: '200', depreciationPerHour: '0', maintenancePerHour: '0', laborMinutes: '0',
    laborRatePerHour: '0', extraProductionCost: '0', markupPercent: '50', discountType: 'percent', discountValue: '0',
    surchargeType: 'percent', surchargeValue: '0' });
}
async function inspectHistory(page, quote) {
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.getByText('COT-000001')).toBeVisible();
  const amount = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(quote.result.totalCost);
  await expect(page.locator('#history-list')).toContainText(amount);
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#result-content')).toContainText(amount);
}
async function switchOwner(page, remote) {
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  const error = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
  });
  expect(error).toBeNull();
}

test('S9 brand removal cancels without a write, then hides brand after reload but keeps active profiles and history', async ({ page, remote }) => {
  seed(remote);
  await signIn(page, { withProfile: false });
  const quote = await seedQuote(page, remote);
  await page.goto('/settings.html');
  const section = page.getByRole('region', { name: 'Marcas' });
  await expect(section.getByLabel('Marca guardada')).toHaveValue(brandId);
  const before = structuredClone({ profiles: remote.profiles, purchases: remote.purchases,
    spools: remote.spools, quotes: remote.quotes, number: remote.number });
  page.once('dialog', dialog => dialog.dismiss());
  await section.getByRole('button', { name: 'Quitar marca' }).click();
  expect(archiveCalls(remote)).toEqual([]);
  expect((await remoteRows(page, 'brands'))[0].archived_at).toBeNull();
  page.once('dialog', dialog => dialog.accept());
  await section.getByRole('button', { name: 'Quitar marca' }).click();
  await expect.poll(() => archiveCalls(remote).length).toBe(1);
  await page.reload();
  await expect(section.getByLabel('Marca guardada').locator(`option[value="${brandId}"]`)).toHaveCount(0);
  await expect(page.locator(`#spool-brandId option[value="${brandId}"]`)).toHaveCount(0);
  await page.locator('.spool-picker-trigger').click();
  const row = page.locator(`#spool-picker-list [data-id="${profileId}"]`);
  await expect(row).toContainText('Prueba');
  await expect(row.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await row.click();
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-brandId')).toHaveValue(brandId);
  await expect(page.locator(`#spool-brandId option[value="${brandId}"]`)).toContainText('marca quitada');
  await page.goto('/');
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  await expect(page.locator(`#calculator-spool-picker-list [data-id="profile:${profileId}"]`)).toContainText('Prueba');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before.profiles);
  expect(await remoteRows(page, 'purchases')).toEqual(before.purchases);
  expect(await remoteRows(page, 'spools')).toEqual(before.spools);
  await inspectHistory(page, quote);
  expect(await remoteQuotes(page)).toHaveLength(1);
  expect(remote.quotes).toEqual(before.quotes);
  expect(remote.number).toBe(before.number);
});

test('S9 profile removal cancels, then disappears from Settings and new Calculator selections without deleting purchases or quotes', async ({ page, remote }) => {
  seed(remote);
  await signIn(page, { withProfile: false });
  const quote = await seedQuote(page, remote);
  await page.goto('/settings.html');
  await page.locator('.spool-picker-trigger').click();
  await page.locator(`#spool-picker-list [data-id="${profileId}"]`).click();
  const before = structuredClone({ brand: remote.brands, other: remote.profiles[1],
    purchases: remote.purchases, spools: remote.spools, quotes: remote.quotes, number: remote.number });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Quitar bobina' }).click();
  expect(archiveCalls(remote)).toEqual([]);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Quitar bobina' }).click();
  await expect.poll(() => archiveCalls(remote).length).toBe(1);
  await page.reload();
  await expect(page.locator(`#spool-profile option[value="${profileId}"]`)).toHaveCount(0);
  await page.goto('/');
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  await expect(page.locator(`#calculator-spool-picker-list [data-id="profile:${profileId}"]`)).toHaveCount(0);
  await expect(page.locator(`#calculator-spool-picker-list [data-id="profile:${secondId}"]`)).toContainText('Prueba');
  await expect(page.locator('#calculator-spool-picker-list [data-id="purchase:bought-1"]')).toBeVisible();
  await inspectHistory(page, quote);
  expect((await remoteRows(page, 'spool_profiles')).find(row => row.id === profileId)).toMatchObject({
    brand_id: brandId, purchase_price: 12000, net_weight_grams: 1000, revision: 2, archived_at: stamp });
  expect(remote.brands).toEqual(before.brand);
  expect(remote.profiles[1]).toEqual(before.other);
  expect(remote.purchases).toEqual(before.purchases);
  expect(remote.spools).toEqual(before.spools);
  expect(remote.quotes).toEqual(before.quotes);
  expect(remote.number).toBe(before.number);
});

for (const kind of ['marca', 'bobina']) {
  test(`S9 deferred ${kind} archive acknowledgement cannot repaint controls or expose first-owner identity after switch`, async ({ page, remote }) => {
    seed(remote);
    await signIn(page, { withProfile: false });
    await page.goto('/settings.html');
    if (kind === 'bobina') {
      await page.locator('.spool-picker-trigger').click();
      await page.locator(`#spool-picker-list [data-id="${profileId}"]`).click();
    }
    let release;
    remote.holdArchive = new Promise(resolve => { release = resolve; });
    try {
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: `Quitar ${kind}` }).click();
      await expect.poll(() => archiveCalls(remote).length).toBe(1);
      await switchOwner(page, remote);
      await expect(page.getByRole('region', { name: 'Marcas' }).getByLabel('Marca guardada')).toHaveValue('');
      await expect(page.locator('#spool-profile option')).toHaveCount(1);
      expect(await page.locator('main').textContent()).not.toContain('Prueba');
      expect(await page.locator('#spool-name').inputValue()).toBe('');
      expect(await page.locator('#brand-name').inputValue()).toBe('');
    } finally { remote.holdArchive = null; release(); }
    await expect(page.locator('.account-nav')).toContainText('second@example.test');
    await expect(page.getByRole('region', { name: 'Marcas' }).getByLabel('Marca guardada')).toHaveValue('');
    await expect(page.locator('#spool-profile option')).toHaveCount(1);
    expect(await page.locator('main').textContent()).not.toContain('Prueba');
    expect(await remoteRows(page, 'brands')).toEqual([]);
  });
}
