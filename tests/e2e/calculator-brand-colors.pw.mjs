import { test, expect, signIn, remoteQuotes, remoteRows } from './supabase-fixture.mjs';

const profile = (id, brand, name, owner_id) => ({ id, owner_id, brand, name, material: 'PETG', purchase_price: 12000,
  net_weight_grams: 1000, revision: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });

test('S1-S2: Calculator exposes colored brands on a visible picker without saving a selection', async ({ page, remote }) => {
  remote.profiles = [profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Zeta', 'Z', remote.user.id),
    profile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Álamo', 'A', remote.user.id)];
  await signIn(page);
  await page.goto('/');
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await expect(trigger).toBeVisible({ timeout: 5000 });
  await expect(trigger).toContainText('Z · PETG · Zeta');
  await trigger.click();
  const options = page.locator('#calculator-spool-picker-list').getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText('A · PETG · Álamo');
  await expect(options.nth(1)).toContainText('Z · PETG · Zeta');
  const color = await options.nth(0).locator('.brand-chip').evaluate(node => getComputedStyle(node).backgroundColor);
  await options.nth(0).click();
  await expect(page.locator('#spoolId')).toHaveValue('profile:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await expect(trigger.locator('.brand-chip')).toHaveCSS('background-color', color);
  expect(await remoteQuotes(page)).toEqual([]);
  await page.locator('#grams').fill('50');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(page.locator('#result-content .result-row').filter({ hasText: 'Material' })).toContainText('600');
  await page.goto('/settings.html');
  await page.locator('.spool-picker-trigger').click();
  const settingsColor = await page.locator('#spool-picker-list [role="option"][data-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] .brand-chip')
    .evaluate(node => getComputedStyle(node).backgroundColor);
  expect(settingsColor).toBe(color);
  expect(await remoteRows(page, 'spool_profiles')).toEqual(remote.profiles);
  expect(await remoteQuotes(page)).toEqual([]);
  expect(remote.number).toBe(0);
  expect(remote.calls.filter(call => call.pathname.includes('/rpc/calc3d_save_'))).toEqual([]);
});

test('S1-S2: purchase and profile choices retain native identities, ordered labels and live cost', async ({ page, remote }) => {
  remote.profiles = [profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Álamo', 'Z', remote.user.id)];
  remote.spools = [{ id: 'purchase-visual', owner_id: remote.user.id, purchase_id: 'purchase-1', purchase_date: '2025-02-28',
    material: 'PETG', brand: 'Álamo', color: 'Verde', purchase_price: 18000, net_weight_grams: 1000, remaining_grams: 1000 }];
  await signIn(page, { withProfile: false });
  await expect(page.locator('#spoolId')).toHaveValue('profile:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await trigger.click();
  const options = page.locator('#calculator-spool-picker-list').getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText('PETG · Álamo · Verde · 2025-02-28 · compra de prueba · bobina purchase-visual');
  await options.first().click();
  await expect(page.locator('#spoolId')).toHaveValue('purchase:purchase-visual');
  await expect(trigger).toContainText('compra de prueba · bobina purchase-visual');
  await page.locator('#grams').fill('50');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(page.locator('#result-content .result-row').filter({ hasText: 'Material' })).toContainText('900');
  const calculatorColor = await trigger.locator('.brand-chip').evaluate(node => getComputedStyle(node).backgroundColor);
  await page.goto('/settings.html');
  await page.locator('.spool-picker-trigger').click();
  const profileColor = await page.locator('#spool-picker-list [role="option"][data-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] .brand-chip')
    .evaluate(node => getComputedStyle(node).backgroundColor);
  expect(profileColor).toBe(calculatorColor);
  await page.goto('/');
  await expect(page.locator('#spoolId')).toHaveValue('profile:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await expect(page.locator('.calculator-spool-picker .spool-picker-trigger .brand-chip')).toHaveCSS('background-color', profileColor);
  await expect(page.locator('.calculator-spool-picker .spool-picker-trigger')).toContainText('Z · PETG · Álamo');
  expect(await remoteQuotes(page)).toEqual([]);
  expect(remote.number).toBe(0);
});

test('S1-S2: remembered profile and missing historical purchase show correct visible selection without reprice or save', async ({ page, remote }) => {
  remote.profiles = [profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Zeta', 'Z', remote.user.id),
    profile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Álamo', 'A', remote.user.id)];
  await signIn(page);
  await page.evaluate(owner => sessionStorage.setItem(`calc3d-spool-selection:${owner}`, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), remote.user.id);
  await page.goto('/');
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await expect(trigger).toContainText('A · PETG · Álamo');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const saved = structuredClone(remote.quotes[0]);
  remote.quotes[0] = { ...saved, spool_id: 'purchase:missing', form: { ...saved.form, spoolId: 'purchase:missing' } };
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#spoolId')).toHaveValue('purchase:missing');
  await expect(trigger).toContainText('Bobina no disponible · purchase:missing');
  await expect(trigger.locator('.brand-chip')).toHaveClass(/brand-chip-neutral/);
  await expect(page.locator('#save')).toBeDisabled();
  const before = structuredClone(remote.quotes);
  await trigger.click();
  await page.locator('#calculator-spool-picker-list [role="option"][data-id="profile:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]').click();
  await expect(trigger).toContainText('A · PETG · Álamo');
  expect(remote.quotes).toEqual(before);
});

test('S1-S2: account changes wipe open and closed picker rows and do not paint deferred old owner catalog', async ({ page, remote }) => {
  remote.profiles = [profile('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Privada', 'Original', remote.user.id)];
  await signIn(page);
  await page.goto('/');
  const trigger = page.locator('.calculator-spool-picker .spool-picker-trigger');
  await expect(trigger).toContainText('Privada');
  await trigger.click();
  await expect(page.locator('#calculator-spool-picker-list').getByRole('option')).toHaveCount(1);
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  const error = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
  });
  expect(error).toBeNull();
  await expect(trigger).not.toContainText('Privada');
  await expect(page.locator('#calculator-spool-picker-list').getByRole('option')).toHaveCount(0);
  expect(await page.locator('.calculator-spool-picker').textContent()).not.toContain('Privada');
  await expect(page.locator('#spoolId option')).toHaveCount(0);
  expect(await remoteQuotes(page)).toEqual([]);
});

test('S1-S2: deferred prior-owner profile response cannot refill cleared picker', async ({ page, remote }) => {
  remote.profiles = [profile('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Privada', 'Original', remote.user.id)];
  await signIn(page);
  await page.goto('/');
  await expect(page.locator('.calculator-spool-picker .spool-picker-trigger')).toContainText('Privada');
  let release;
  remote.holdProfiles = new Promise(resolve => { release = resolve; });
  try {
    await page.reload();
    await expect(page.locator('.account-nav button')).toHaveCount(1);
    remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
    const error = await page.evaluate(async () => {
      const { client } = await import('/src/auth/browser.mjs');
      return (await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' })).error?.message ?? null;
    });
    expect(error).toBeNull();
  } finally { release(); remote.holdProfiles = null; }
  await expect(page.locator('.account-nav')).toContainText('second@example.test');
  await expect(page.locator('#calculator-spool-picker-list').getByRole('option')).toHaveCount(0);
  await expect(page.locator('.calculator-spool-picker .spool-picker-trigger')).not.toContainText('Privada');
  expect(await page.locator('.calculator-spool-picker').textContent()).not.toContain('Privada');
});
