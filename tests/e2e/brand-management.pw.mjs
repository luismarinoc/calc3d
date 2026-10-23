import { test, expect, signIn, remoteRows, remoteQuotes } from './supabase-fixture.mjs';

const owner2 = { id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
const stamp = '2026-01-01T00:00:00.000Z';
const brandId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const brand = (owner, overrides = {}) => ({ id: brandId, owner_id: owner, name: 'Prueba',
  normalized_name: 'prueba', color: '#123456', aliases: ['prueba'], revision: 1,
  created_at: stamp, updated_at: stamp, ...overrides });
const profile = (owner, overrides = {}) => ({ id: profileId, owner_id: owner, name: 'PETG 1 kg',
  material: 'PETG', brand: 'Prueba', brand_id: brandId, filament_color: 'Azul noche',
  filament_color_hex: '#336699', purchase_price: 12000, net_weight_grams: 1000,
  revision: 1, created_at: stamp, updated_at: stamp, ...overrides });
const saves = remote => remote.calls.filter(call => call.pathname.includes('/rpc/calc3d_save_'));
async function switchOwner(page, remote) {
  remote.user = { ...remote.user, ...owner2 };
  const error = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
  });
  expect(error).toBeNull();
}

// Brand maintainer controls intentionally address public HTML only, not repository internals.
test('S1-S2: Marcas is separate; explicit create, color change and rename preserve identity in both pickers and reload', async ({ page, remote }) => {
  remote.profiles = [profile(remote.user.id, { brand_id: null, brand: 'mi   marca' })];
  await signIn(page, { withProfile: false });
  await page.goto('/settings.html');
  const section = page.getByRole('region', { name: 'Marcas' });
  await expect(section).toBeVisible();
  expect(await remoteRows(page, 'brands')).toEqual([]);
  expect(saves(remote)).toEqual([]);
  await section.getByLabel('Nombre de marca').fill('Mi Marca');
  await section.getByLabel('Color de marca').fill('#2364aa');
  expect(await remoteRows(page, 'brands')).toEqual([]);
  await section.getByRole('button', { name: 'Guardar marca' }).click();
  await expect(section.getByRole('status')).toContainText('guardada');
  const [created] = await remoteRows(page, 'brands');
  expect(created).toMatchObject({ owner_id: remote.user.id, name: 'Mi Marca', color: '#2364AA',
    normalized_name: 'mi marca', aliases: ['mi marca'], revision: 1 });
  expect(created.id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  expect(saves(remote).map(call => call.pathname)).toEqual(['/rest/v1/rpc/calc3d_save_brand']);
  await page.reload();
  await expect(section.getByLabel('Marca guardada')).toHaveValue(created.id);
  await section.getByRole('button', { name: 'Editar marca' }).click();
  await section.getByLabel('Nombre de marca').fill('Marca Renombrada');
  await section.getByLabel('Color de marca').fill('#aabbcc');
  expect((await remoteRows(page, 'brands'))[0]).toEqual(created);
  const brandsPath = '/rest/v1/calc3d_brands';
  remote.failAfter = { path: brandsPath, after: remote.reads[brandsPath] };
  await section.getByRole('button', { name: 'Guardar marca' }).click();
  await expect(section.getByRole('status')).toContainText('guardada');
  await expect(section.getByRole('status')).toContainText('No se pudo actualizar la lista');
  remote.failAfter = null;
  const [updated] = await remoteRows(page, 'brands');
  expect(updated).toMatchObject({ id: created.id, name: 'Marca Renombrada', color: '#AABBCC',
    aliases: ['mi marca', 'marca renombrada'], revision: 2 });
  await page.locator('.spool-picker-trigger').click();
  const settingsRow = page.locator(`#spool-picker-list [role="option"][data-id="${profileId}"]`);
  await expect(settingsRow).toContainText('Marca Renombrada');
  await expect(settingsRow.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(170, 187, 204)');
  await page.goto('/');
  const calculatorRow = page.locator(`#calculator-spool-picker-list [role="option"][data-id="profile:${profileId}"]`);
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  await expect(calculatorRow).toContainText('Marca Renombrada');
  await expect(calculatorRow.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(170, 187, 204)');
  expect((await remoteRows(page, 'spool_profiles'))[0]).toEqual(remote.profiles[0]);
  expect(saves(remote).map(call => call.pathname)).toEqual([
    '/rest/v1/rpc/calc3d_save_brand', '/rest/v1/rpc/calc3d_save_brand']);
  expect(remote.number).toBe(0);
});

test('S3-S4: brand ID and filament name/sample are independent, legible in Settings and Calculator; price unchanged', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id)];
  await signIn(page, { withProfile: false });
  await page.goto('/settings.html');
  await page.locator('#new-spool').click();
  await page.locator('#spool-name').fill('PETG 1 kg');
  await page.locator('#spool-material').fill('PETG');
  await expect(page.getByLabel('Marca de la bobina')).toBeVisible();
  await page.getByLabel('Marca de la bobina').selectOption(brandId);
  await expect(page.getByLabel('Color del filamento')).toBeVisible();
  await page.getByLabel('Color del filamento').fill('Azul noche');
  await page.getByLabel('Mostrar muestra del filamento').check();
  await page.getByLabel('Muestra del filamento', { exact: true }).fill('#336699');
  await page.locator('#spool-purchasePrice').fill('12000');
  await page.locator('#spool-netWeightGrams').fill('1000');
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const [saved] = await remoteRows(page, 'spool_profiles');
  expect(saved).toMatchObject({ brand_id: brandId, brand: 'Prueba', filament_color: 'Azul noche',
    filament_color_hex: '#336699', purchase_price: 12000, net_weight_grams: 1000, revision: 1 });
  await page.reload();
  await page.locator('.spool-picker-trigger').click();
  const row = page.locator(`#spool-picker-list [role="option"][data-id="${saved.id}"]`);
  await expect(row).toContainText('Prueba');
  await expect(row).toContainText('Azul noche');
  await expect(row.locator('.brand-chip')).toHaveAttribute('title', /Marca/);
  await expect(row.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await expect(row.locator('.filament-chip')).toHaveAttribute('title', /Filamento/);
  await expect(row.locator('.filament-chip')).toHaveCSS('background-color', 'rgb(51, 102, 153)');
  await page.goto('/');
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await expect(page.locator('#spoolId')).toHaveValue(`profile:${saved.id}`);
  await expect(trigger).toContainText('Prueba');
  await expect(trigger).toContainText('Azul noche');
  await expect(trigger.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await expect(trigger.locator('.filament-chip')).toHaveCSS('background-color', 'rgb(51, 102, 153)');
  await page.locator('#grams').fill('50');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(page.locator('#result-content .result-row').filter({ hasText: 'Material' })).toContainText('600');
  expect((await remoteRows(page, 'spool_profiles'))[0]).toEqual(saved);
  expect(await remoteRows(page, 'brands')).toEqual(remote.brands);
  expect(await remoteQuotes(page)).toEqual([]);
  expect(remote.number).toBe(0);
});

test('S5: named unrepresentable filament has readable text and no invented sample; legacy unconfigured brand is neutral', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id, { color: null })];
  remote.profiles = [profile(remote.user.id, { filament_color: 'Arcoíris translúcido', filament_color_hex: null })];
  const before = structuredClone(remote.profiles);
  await signIn(page, { withProfile: false });
  await page.goto('/settings.html');
  await page.locator('.spool-picker-trigger').click();
  const row = page.locator(`#spool-picker-list [role="option"][data-id="${profileId}"]`);
  await expect(row).toContainText('Arcoíris translúcido');
  await expect(row.locator('.filament-chip')).toHaveCount(0);
  await expect(row.locator('.brand-chip')).toHaveClass(/brand-chip-neutral/);
  await row.click();
  await page.locator('#edit-spool').click();
  await expect(page.getByLabel('Color del filamento')).toHaveValue('Arcoíris translúcido');
  await expect(page.getByLabel('Mostrar muestra del filamento')).not.toBeChecked();
  await page.goto('/');
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await expect(trigger).toContainText('Arcoíris translúcido');
  await expect(trigger.locator('.filament-chip')).toHaveCount(0);
  await expect(trigger.locator('.brand-chip')).toHaveClass(/brand-chip-neutral/);
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
  expect(saves(remote)).toEqual([]);
});

test('S6: stored brand ID and normalized legacy aliases resolve current purchase display without rewriting snapshots or prices', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id, { name: 'Nueva Marca', normalized_name: 'nueva marca',
    color: '#DDAA22', aliases: ['prueba', 'nueva marca'], revision: 2 })];
  remote.profiles = [profile(remote.user.id, { brand: 'Prueba' }), profile(remote.user.id, {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', brand_id: null, brand: 'PRUEBA' })];
  remote.spools = [{ id: 'purchase-visual', owner_id: remote.user.id, purchase_id: 'purchase-1',
    purchase_date: '2025-02-28', material: 'PETG', brand: 'pRuEbA', color: 'Verde',
    purchase_price: 18000, net_weight_grams: 1000, remaining_grams: 1000 }];
  const before = structuredClone({ profiles: remote.profiles, spools: remote.spools, brands: remote.brands });
  await signIn(page, { withProfile: false });
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  const options = page.locator('#calculator-spool-picker-list [role="option"]');
  await expect(options).toHaveCount(3);
  for (const option of await options.all()) {
    await expect(option).toContainText('Nueva Marca');
    await expect(option.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(221, 170, 34)');
  }
  await page.locator('#calculator-spool-picker-list [data-id="purchase:purchase-visual"]').click();
  await expect(page.locator('#spoolId')).toHaveValue('purchase:purchase-visual');
  await page.locator('#grams').fill('50');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(page.locator('#result-content .result-row').filter({ hasText: 'Material' })).toContainText('900');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const history = await remoteQuotes(page);
  expect(history).toHaveLength(1);
  const snapshot = structuredClone(remote.quotes);
  await page.goto('/settings.html');
  const section = page.getByRole('region', { name: 'Marcas' });
  await expect(section).toBeVisible();
  await expect(section.getByLabel('Marca guardada')).toHaveValue(brandId);
  await section.getByRole('button', { name: 'Editar marca' }).click();
  await section.getByLabel('Nombre de marca').fill('Marca Vigente');
  await section.getByLabel('Color de marca').fill('#bb4422');
  expect(remote.quotes).toEqual(snapshot);
  await section.getByRole('button', { name: 'Guardar marca' }).click();
  await expect(section.getByRole('status')).toContainText('guardada');
  expect((await remoteRows(page, 'brands'))[0]).toMatchObject({ id: brandId, name: 'Marca Vigente',
    color: '#BB4422', aliases: ['prueba', 'nueva marca', 'marca vigente'], revision: 3 });
  await page.goto('/');
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  const renamed = page.locator('#calculator-spool-picker-list [role="option"]');
  await expect(renamed).toHaveCount(3);
  for (const option of await renamed.all()) {
    await expect(option).toContainText('Marca Vigente');
    await expect(option.locator('.brand-chip')).toHaveCSS('background-color', 'rgb(187, 68, 34)');
  }
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#spoolId')).toHaveValue('purchase:purchase-visual');
  expect(remote.quotes).toEqual(snapshot);
  expect(await remoteQuotes(page)).toEqual(history);
  expect(remote.profiles).toEqual(before.profiles);
  expect(remote.spools).toEqual(before.spools);
  expect(remote.number).toBe(1);
  expect(saves(remote).map(call => call.pathname)).toEqual([
    '/rest/v1/rpc/calc3d_save_quote', '/rest/v1/rpc/calc3d_save_brand']);
});

test('S1-S6 owner fence: open and closed pickers/forms clear brand and filament after account switch', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id, { name: 'Privada', normalized_name: 'privada', color: '#CF1245', aliases: ['privada'] })];
  remote.profiles = [profile(remote.user.id, { brand: 'Privada', filament_color: 'Secreto' })];
  await signIn(page, { withProfile: false });
  await page.goto('/settings.html');
  await page.locator('.spool-picker-trigger').click();
  await page.locator(`#spool-picker-list [data-id="${profileId}"]`).click();
  await page.locator('#edit-spool').click();
  await expect(page.getByLabel('Color del filamento')).toHaveValue('Secreto');
  await expect(page.getByLabel('Mostrar muestra del filamento')).toBeChecked();
  const section = page.getByRole('region', { name: 'Marcas' });
  await expect(section.getByLabel('Marca guardada')).toHaveValue(brandId);
  await section.getByRole('button', { name: 'Editar marca' }).click();
  await expect(section.getByLabel('Nombre de marca')).toHaveValue('Privada');
  await page.locator('.spool-picker-trigger').click();
  await switchOwner(page, remote);
  await expect(page.locator('#save-spool')).toBeEnabled();
  await expect(page.locator('#spool-picker-list [role="option"]')).toHaveCount(0);
  await expect(page.locator('#spool-profile')).toHaveValue('');
  await expect(page.getByLabel('Marca de la bobina')).toHaveValue('');
  await expect(page.getByLabel('Color del filamento')).toBeEmpty();
  await expect(page.getByLabel('Mostrar muestra del filamento')).not.toBeChecked();
  await expect(section.getByLabel('Marca guardada')).toHaveValue('');
  await expect(section.getByLabel('Nombre de marca')).toBeEmpty();
  await expect(section.locator('.brand-chip')).toHaveCount(0);
  await expect(page.locator('.spool-picker .brand-chip')).toHaveCount(0);
  await expect(page.locator('.spool-picker .filament-chip')).toHaveCount(0);
  expect(await page.locator('main').textContent()).not.toMatch(/Privada|Secreto/);
  expect(await remoteRows(page, 'brands')).toEqual([]);
  await page.goto('/');
  expect(await page.locator('main').textContent()).not.toMatch(/Privada|Secreto/);
  expect(saves(remote)).toEqual([]);
});

test('S1-S6 owner fence: Calculator clears open brand-colored rows and closed selected trigger on switch', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id, { name: 'Privada', normalized_name: 'privada', color: '#CF1245', aliases: ['privada'] })];
  remote.profiles = [profile(remote.user.id, { brand: 'Privada', filament_color: 'Secreto' })];
  await signIn(page, { withProfile: false });
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await expect(trigger).toContainText('Privada');
  await expect(trigger).toContainText('Secreto');
  await trigger.click();
  await expect(page.locator('#calculator-spool-picker-list [role="option"]')).toHaveCount(1);
  await switchOwner(page, remote);
  await expect(page.locator('#calculator-spool-picker-list [role="option"]')).toHaveCount(0);
  await expect(page.locator('#spoolId option')).toHaveCount(0);
  await expect(trigger).not.toContainText('Privada');
  await expect(trigger.locator('.brand-chip')).toHaveCount(0);
  await expect(trigger.locator('.filament-chip')).toHaveCount(0);
  expect(await page.locator('.calculator-spool-picker').textContent()).not.toMatch(/Privada|Secreto/);
  expect(await remoteRows(page, 'brands')).toEqual([]);
  expect(await remoteQuotes(page)).toEqual([]);
  expect(saves(remote)).toEqual([]);
});

test('S1-S6 owner fence: delayed Calculator brand GET cannot repaint second-owner picker', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id, { name: 'Privada', normalized_name: 'privada', color: '#CF1245', aliases: ['privada'] })];
  remote.profiles = [profile(remote.user.id, { brand: 'Privada', filament_color: 'Secreto' })];
  await signIn(page, { withProfile: false });
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await expect(trigger).toContainText('Privada');
  let release;
  remote.holdBrands = new Promise(resolve => { release = resolve; });
  const path = '/rest/v1/calc3d_brands';
  const prior = remote.reads[path] ?? 0;
  try {
    await page.reload();
    await expect.poll(() => remote.reads[path] ?? 0).toBeGreaterThan(prior);
    await switchOwner(page, remote);
  } finally { remote.holdBrands = null; release(); }
  await expect(page.locator('.account-nav')).toContainText('second@example.test');
  await expect(page.locator('#calculator-spool-picker-list [role="option"]')).toHaveCount(0);
  await expect(page.locator('#spoolId option')).toHaveCount(0);
  await expect(trigger.locator('.brand-chip')).toHaveCount(0);
  await expect(trigger.locator('.filament-chip')).toHaveCount(0);
  expect(await page.locator('.calculator-spool-picker').textContent()).not.toMatch(/Privada|Secreto/);
  expect(await remoteRows(page, 'brands')).toEqual([]);
  expect(saves(remote)).toEqual([]);
});

test('S1-S6 owner fence: delayed first-owner brands read cannot repaint second-owner Settings or Calculator', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id, { name: 'Privada', normalized_name: 'privada', color: '#CF1245', aliases: ['privada'] })];
  remote.profiles = [profile(remote.user.id, { brand: 'Privada' })];
  await signIn(page, { withProfile: false });
  await page.goto('/settings.html');
  let release;
  remote.holdBrands = new Promise(resolve => { release = resolve; });
  const path = '/rest/v1/calc3d_brands';
  const prior = remote.reads[path] ?? 0;
  try {
    await page.reload();
    await expect.poll(() => remote.reads[path] ?? 0).toBeGreaterThan(prior);
    await switchOwner(page, remote);
  } finally { remote.holdBrands = null; release(); }
  await expect(page.locator('#save-spool')).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Marcas' }).getByLabel('Marca guardada')).toHaveValue('');
  expect(await page.locator('main').textContent()).not.toContain('Privada');
  await page.goto('/');
  expect(await page.locator('main').textContent()).not.toContain('Privada');
  expect(await remoteRows(page, 'brands')).toEqual([]);
  expect(saves(remote)).toEqual([]);
});
