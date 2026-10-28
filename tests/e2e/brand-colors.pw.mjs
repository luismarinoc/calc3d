import { test, expect, signIn, remoteRows } from './supabase-fixture.mjs';

const profile = (id, brand, name, owner_id) => ({ id, owner_id, brand, name, material: 'PETG', purchase_price: 12000,
  net_weight_grams: 1000, revision: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });
const brand = (owner_id, id, name, color, aliases) => ({ id, owner_id, name, color, aliases,
  normalized_name: aliases[0], revision: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });

test('S1-S2: visible brand chips in every ordered option and selected profile; selection does not save', async ({ page, remote }) => {
  remote.brands = [brand(remote.user.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Zeta', '#123456', ['zeta']),
    brand(remote.user.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Álamo', '#ABCDEF', ['álamo'])];
  remote.profiles = [profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Zeta', 'Z', remote.user.id), profile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Álamo', 'A', remote.user.id),
    profile('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'álamo', 'B', remote.user.id), profile('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '', 'N', remote.user.id)];
  const before = structuredClone(remote.profiles);
  await signIn(page);
  await page.goto('/settings.html');
  await expect(page.locator('#spool-profile option')).toHaveCount(5);
  const trigger = page.getByRole('button', { name: /Presentación guardada/ });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const options = page.locator('#spool-picker-list').getByRole('option');
  await expect(options).toHaveCount(4);
  await expect(options.nth(0)).toContainText('N');
  await expect(options.nth(1)).toContainText('Álamo');
  await expect(options.nth(2)).toContainText('Álamo');
  await expect(options.nth(3)).toContainText('Zeta');
  const chips = await options.evaluateAll(nodes => nodes.map(node => getComputedStyle(node.querySelector('.brand-chip')).backgroundColor));
  expect(chips[1]).toBe(chips[2]);
  expect(new Set([chips[1], chips[3]]).size).toBe(2);
  expect(chips[0]).not.toBe(chips[1]);
  expect(chips[1]).toBe('rgb(171, 205, 239)');
  expect(chips[3]).toBe('rgb(18, 52, 86)');
  await options.nth(3).click();
  await expect(page.locator('#spool-profile')).toHaveValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await expect(trigger).toContainText('Zeta');
  await expect(trigger.locator('.brand-chip')).toHaveCSS('background-color', chips[3]);
  await expect(options).toHaveCount(0);
  await page.locator('#edit-spool').click();
  await expect(page.locator('#spool-name')).toHaveValue('Z');
  expect(await remoteRows(page, 'spool_profiles')).toEqual(before);
  expect(remote.calls.filter(call => call.pathname.includes('/rpc/calc3d_save_'))).toEqual([]);
});

test('S2: keyboard navigation, Escape and account switch clear an open list and selected owner name', async ({ page, remote }) => {
  remote.profiles = [profile('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Privada', 'Original', remote.user.id)];
  await signIn(page);
  await page.goto('/settings.html');
  const trigger = page.getByRole('button', { name: /Presentación guardada/ });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const options = page.locator('#spool-picker-list').getByRole('option');
  await expect(options).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await trigger.click();
  await options.click();
  await expect(trigger).toContainText('Privada');
  await trigger.click();
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' });
  });
  await expect(page.locator('#save-spool')).toBeEnabled();
  await expect(trigger).not.toContainText('Privada');
  await expect(trigger).toHaveAccessibleName('Presentación guardada: Todavía no hay bobinas guardadas');
  await expect(options).toHaveCount(0);
  expect(await page.locator('.spool-picker').textContent()).not.toContain('Privada');
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
});

test('S2: Tab leaves the open list and selected profile is announced', async ({ page, remote }) => {
  remote.profiles = [profile('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Privada', 'Original', remote.user.id)];
  await signIn(page);
  await page.goto('/settings.html');
  const trigger = page.locator('.spool-picker-trigger');
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const options = page.locator('#spool-picker-list').getByRole('option');
  await options.click();
  await expect(trigger).toHaveAccessibleName('Presentación guardada: PETG · Privada · Original; Marca: Privada; Filamento: sin color indicado');
  // Compare with the browser's own next Tab stop from the closed trigger. WebKit may skip buttons.
  await page.keyboard.press('Tab');
  const nextId = await page.evaluate(() => document.activeElement.id);
  expect(['edit-spool', 'new-spool', 'spool-name']).toContain(nextId);
  const next = page.locator(`#${nextId}`);
  await expect(next).toBeVisible();
  await expect(next).toBeFocused();
  await trigger.click();
  await expect(options).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(options).toHaveCount(0);
  await expect(next).toBeFocused();
  await expect(page.locator('#spool-profile')).toHaveValue('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
});

test('S2: account switch also clears a closed selected profile and retained DOM text', async ({ page, remote }) => {
  remote.profiles = [profile('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Privada', 'Original', remote.user.id)];
  await signIn(page);
  await page.goto('/settings.html');
  const trigger = page.locator('.spool-picker-trigger');
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.locator('#spool-picker-list').getByRole('option').click();
  await expect(trigger).toContainText('Privada');
  remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' };
  const signInError = await page.evaluate(async () => {
    const { client } = await import('/src/auth/browser.mjs');
    const { error } = await client.auth.signInWithPassword({ email: 'second@example.test', password: 'fake-password' });
    return error?.message ?? null;
  });
  expect(signInError).toBeNull();
  await expect(page.locator('#save-spool')).toBeEnabled();
  await expect(trigger).toHaveAccessibleName('Presentación guardada: Todavía no hay bobinas guardadas');
  expect(await page.locator('.spool-picker').textContent()).not.toContain('Privada');
  await expect(page.locator('#spool-profile')).toHaveValue('');
  expect(await remoteRows(page, 'spool_profiles')).toEqual([]);
});
