import { test, expect, signIn } from './supabase-fixture.mjs';

test('all three pages redirect anonymous visitors to login', async ({ page, remote }) => {
  for (const path of ['/', '/settings.html', '/purchases.html']) {
    await page.goto(path);
    await expect(page).toHaveURL(/login\.html/);
  }
});

test('quote save uses server number and opens immutable copy after reload', async ({ page, remote }) => {
  await signIn(page);
  await page.locator('#title').fill('Primera copia');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const snapshot = structuredClone(remote.quotes[0]);
  await page.locator('#grams').fill('25');
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#title')).toHaveValue('Primera copia');
  expect(remote.quotes[0]).toEqual(snapshot);
});

test('printer save/activate and purchase acquired spool persist across reloads', async ({ page, remote }) => {
  await signIn(page);
  await page.goto('/settings.html');
  await page.locator('#new-printer').click();
  await page.locator('#printer-name').fill('Taller');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('guardada');
  const id = remote.printers.state.printers.at(-1).id;
  await page.locator('#active-printer').selectOption(id);
  await page.locator('#activate-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('activa');
  await page.reload();
  await expect(page.locator('#active-printer')).toHaveValue(id);
  await page.goto('/purchases.html');
  await page.locator('[name="date"]').fill('2025-02-28');
  await page.locator('[name="name"]').fill('Taller Sur');
  for (const [name, value] of Object.entries({ material: 'PLA', brand: 'Sur', color: 'Azul', quantity: '1', netWeightGrams: '1000', purchasePrice: '18000' })) await page.locator(`.purchase-line [name="${name}"]`).fill(value);
  await page.locator('#purchase-save').click();
  await expect(page.locator('#purchase-inventory .saved-item')).toHaveCount(1);
  await page.goto('/');
  await expect(page.locator('#spoolId')).toContainText('PLA · Sur · Azul');
  await page.locator('#spoolId').selectOption('purchase:spool-1');
  await expect(page.locator('#purchasePrice')).toHaveValue('18000');
  await expect(page.locator('#netWeightGrams')).toHaveValue('1000');
});

test('activation persists selected nonactive B rather than previous active printer', async ({ page, remote }) => {
  await signIn(page);
  await page.goto('/settings.html');
  await page.locator('#new-printer').click();
  await page.locator('#printer-name').fill('B nueva');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('guardada');
  const b = remote.printers.state.printers.at(-1).id;
  expect(remote.printers.state.activeId).not.toBe(b);
  await page.locator('#active-printer').selectOption(b);
  await page.locator('#activate-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('activa');
  const writes = remote.calls.filter(call => call.pathname.endsWith('/rpc/calc3d_save_printers'));
  expect(writes.at(-1).body.payload.activeId).toBe(b);
  await expect(page.locator('#active-printer')).toHaveValue(b);
  await page.reload();
  await expect(page.locator('#active-printer')).toHaveValue(b);
});

test('initialization signout never reveals delayed previous-account history', async ({ page, remote }) => {
  await signIn(page);
  remote.quotes.push({ id: 'private-quote', saved_at: '2026-01-01T00:00:00Z', number: 'COT-000001', client: {}, title: 'Private prior account', spool_id: 'demo', form: { purpose: 'sale' }, input: { purpose: 'sale' }, result: { totalCost: 1, finalPrice: 2 } });
  let release;
  remote.holdQuotes = new Promise(resolve => { release = resolve; });
  try {
    await page.reload();
    await expect(page.locator('.account-nav button')).toHaveCount(1);
    await page.evaluate(async () => { const { client } = await import('/src/auth/browser.mjs'); await client.auth.signOut(); });
    await expect(page.locator('.account-nav')).toBeHidden();
  } finally { release(); remote.holdQuotes = null; }
  await expect(page).toHaveURL(/login\.html/);
  await expect(page.getByText('Private prior account')).toHaveCount(0);
});

test('initialization account switch never paints first account snapshot', async ({ page, remote }) => {
  await signIn(page);
  remote.quotes.push({ owner_id: remote.user.id, id: 'private-quote', saved_at: '2026-01-01T00:00:00Z',
    number: 'COT-000001', client: {}, title: 'Private prior account', spool_id: 'demo',
    form: { purpose: 'sale' }, input: { purpose: 'sale' }, result: { totalCost: 1, finalPrice: 2 } });
  let release;
  remote.holdQuotes = new Promise(resolve => { release = resolve; });
  try {
    await page.reload();
    await expect(page.locator('.account-nav button')).toHaveCount(1);
    remote.user = { ...remote.user, id: '22222222-2222-4222-8222-222222222222', email: 'other@example.test' };
    await page.evaluate(async () => {
      const { client } = await import('/src/auth/browser.mjs');
      await client.auth.signInWithPassword({ email: 'other@example.test', password: 'fake-password' });
    });
  } finally { release(); remote.holdQuotes = null; }
  await expect(page.locator('.account-nav')).toContainText('other@example.test');
  await expect(page.getByText('Private prior account')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item')).toHaveCount(0);
});

test('quote refresh failure after committed RPC retains numbered success warning', async ({ page, remote }) => {
  await signIn(page);
  remote.failAfter = { path: '/rest/v1/calc3d_quotes', after: remote.reads['/rest/v1/calc3d_quotes'] };
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  await expect(page.locator('#feedback')).toContainText('no se pudo actualizar el historial');
  expect(remote.number).toBe(1);
  expect(remote.quotes).toHaveLength(1);
  expect(remote.calls.filter(call => call.pathname.endsWith('/rpc/calc3d_save_quote'))).toHaveLength(1);
  await expect(page.locator('#save')).toBeEnabled();
});

test('purchase refresh failure after committed RPC retains purchase success warning', async ({ page, remote }) => {
  await signIn(page);
  await page.goto('/purchases.html');
  await page.locator('[name="date"]').fill('2025-02-28');
  await page.locator('[name="name"]').fill('Taller');
  for (const [name, value] of Object.entries({ material: 'PLA', brand: 'Sur', color: 'Azul', quantity: '2', netWeightGrams: '1000', purchasePrice: '18000' })) await page.locator(`.purchase-line [name="${name}"]`).fill(value);
  remote.failAfter = { path: '/rest/v1/calc3d_purchases', after: remote.reads['/rest/v1/calc3d_purchases'] };
  await page.locator('#purchase-save').click();
  await expect(page.locator('#purchase-feedback')).toContainText('purchase-1');
  await expect(page.locator('#purchase-feedback')).toContainText('no se pudo actualizar');
  await expect(page.locator('[name="name"]')).toBeEmpty();
  expect(remote.purchases).toHaveLength(1);
  expect(remote.spools).toHaveLength(2);
  expect(remote.calls.filter(call => call.pathname.endsWith('/rpc/calc3d_save_purchase'))).toHaveLength(1);
});

test('failed RPC and revoked session never confirm writes or change records', async ({ page, remote }) => {
  await signIn(page);
  remote.fail = 'calc3d_save_quote';
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('Network denied');
  expect(remote.quotes).toHaveLength(0);
  remote.fail = null;
  remote.allowed = false;
  await page.locator('#save').click();
  expect(remote.quotes).toHaveLength(0);
  await page.reload();
  await expect(page).toHaveURL(/login\.html/);
});
