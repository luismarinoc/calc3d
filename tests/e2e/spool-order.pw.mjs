import { test, expect, signIn, remoteRows, remoteQuotes } from './supabase-fixture.mjs';

const optionValues = (page, selector) => page.locator(`${selector} option`).evaluateAll(options => options.map(option => option.value));
const materialCost = page => page.locator('#result-content .result-row').filter({ has: page.getByText('Material', { exact: true }) });

test('unsorted profiles and purchase display by material then brand without changing editing, selection or quote value', async ({ page, remote }) => {
  const owner_id = remote.user.id;
  const profile = (id, material, name, purchase_price, brand = 'Prueba') => ({ id, owner_id, material, name, brand, purchase_price,
    net_weight_grams: 1000, revision: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });
  const ids = {
    petgZ: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    pla: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    petgA: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    abs: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  };
  remote.profiles = [
    profile(ids.petgZ, 'PETG', 'Bobina 2', 21900, 'Zeta'),
    profile(ids.pla, 'PLA', 'Azul', 12000),
    profile(ids.petgA, 'petg', 'Bobina 10', 18000, 'Álamo'),
    profile(ids.abs, 'ABS', 'ABS común', 9000),
  ];
  remote.spools = [{ id: 'purchase-petg', owner_id, purchase_id: 'purchase-1', purchase_date: '2025-02-28',
    material: 'PETG', brand: 'alamo', color: 'Verde', purchase_price: 15000, net_weight_grams: 1000, remaining_grams: 1000 }];
  const profilesBefore = structuredClone(remote.profiles);
  const spoolsBefore = structuredClone(remote.spools);
  await signIn(page, { withProfile: false });
  // The original first catalog item is still the default despite the display order.
  await expect(page.locator('#spoolId option')).toHaveCount(5);
  await expect(page.locator('#spoolId')).toHaveValue(`profile:${ids.petgZ}`);
  expect(await optionValues(page, '#spoolId')).toEqual([
    `profile:${ids.abs}`, `profile:${ids.petgA}`, 'purchase:purchase-petg', `profile:${ids.petgZ}`, `profile:${ids.pla}`,
  ]);
  await page.goto('/settings.html');
  await expect(page.locator('#spool-profile option')).toHaveCount(5);
  expect(await optionValues(page, '#spool-profile')).toEqual([
    '', ids.abs, ids.petgA, ids.petgZ, ids.pla,
  ]);
  await page.locator('.spool-picker-trigger').click();
  const visibleOptions = page.locator('#spool-picker-list').getByRole('option');
  await expect(visibleOptions).toHaveText([
    'ABS · Prueba · ABS común', 'petg · Álamo · Bobina 10',
    'PETG · Zeta · Bobina 2', 'PLA · Prueba · Azul',
  ]);
  await page.locator('#spool-picker-list').getByRole('option', { name: 'PLA · Prueba · Azul' }).click();
  await expect(page.locator('#spool-profile')).toHaveValue(ids.pla);
  await expect(page.locator('.spool-picker-trigger')).toContainText('PLA · Prueba · Azul');
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-name')).toHaveValue('Azul');
  await expect(page.locator('#spool-purchasePrice')).toHaveValue('12000');
  await page.goto('/');
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  await page.locator(`#calculator-spool-picker-list [role="option"][data-id="profile:${ids.petgZ}"]`).click();
  await page.locator('#grams').fill('50');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(materialCost(page)).toContainText('1.095');
  await page.locator('.calculator-spool-picker .spool-picker-trigger').click();
  await page.locator('#calculator-spool-picker-list [role="option"][data-id="purchase:purchase-petg"]').click();
  await expect(materialCost(page)).toContainText('750');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(profilesBefore);
  expect(await remoteRows(page, 'spools')).toEqual(spoolsBefore);
  expect(await remoteQuotes(page)).toEqual([]);
  expect(remote.number).toBe(0);
  expect(remote.calls.filter(call => call.pathname.includes('/rpc/calc3d_save_'))).toEqual([]);
});
