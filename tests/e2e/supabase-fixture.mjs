import { test as base, expect } from '@playwright/test';

const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email: 'member@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' };
const stamp = '2026-01-01T00:00:00.000Z';
const states = new WeakMap();
export const remoteForPage = page => states.get(page);
export const test = base.extend({
  remote: async ({ page }, use) => {
    const state = { quotes: [], printers: null, purchases: [], spools: [], number: 0, allowed: true,
      fail: null, failAfter: null, reads: {}, calls: [], holdQuotes: null, user };
    await page.route('http://127.0.0.1:54321/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;
      const body = request.postDataJSON?.() ?? {};
      state.calls.push({ pathname, body });
      state.reads[pathname] = (state.reads[pathname] ?? 0) + 1;
      const json = (value, status = 200) => route.fulfill({ status, json: value });
      if (pathname.endsWith('/auth/v1/token')) return json({ access_token: 'fake.browser.test', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, user: state.user });
      if (pathname.endsWith('/auth/v1/user')) return json(state.user);
      if (pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
      if (pathname.endsWith('/rest/v1/rpc/calc3d_access_status')) return json({ allowed: state.allowed, role: state.allowed ? 'member' : null, email: state.allowed ? state.user.email : null });
      if (state.fail && pathname.includes(state.fail)) return json({ message: 'Network denied' }, 403);
      if (state.failAfter && pathname.includes(state.failAfter.path) && state.reads[pathname] > state.failAfter.after) return json({ message: 'Network denied' }, 403);
      if (pathname.endsWith('/rest/v1/calc3d_quotes')) {
        const visible = state.quotes.filter(row => !row.owner_id || row.owner_id === state.user.id);
        if (url.searchParams.get('order') === 'saved_at.desc') visible.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
        if (state.holdQuotes) await state.holdQuotes;
        return json(visible);
      }
      if (pathname.endsWith('/rest/v1/calc3d_printer_settings')) return json(state.printers && state.printers.owner_id === state.user.id ? [state.printers] : []);
      if (pathname.endsWith('/rest/v1/calc3d_purchases')) return json(state.purchases.filter(row => !row.owner_id || row.owner_id === state.user.id));
      if (pathname.endsWith('/rest/v1/calc3d_spools')) return json(state.spools.filter(row => !row.owner_id || row.owner_id === state.user.id));
      if (pathname.endsWith('/rest/v1/rpc/calc3d_save_quote')) {
        state.number++;
        const row = { ...body.payload, owner_id: state.user.id, id: `quote-${state.number}`, saved_at: stamp, number: `COT-${String(state.number).padStart(6, '0')}`, spool_id: body.payload.spoolId };
        state.quotes.unshift(row);
        return json(row);
      }
      if (pathname.endsWith('/rest/v1/rpc/calc3d_save_printers')) {
        if (body.expected_revision !== (state.printers?.revision ?? 0)) return json({ message: 'Printer revision conflict' }, 409);
        state.printers = { owner_id: state.user.id, revision: body.expected_revision + 1, state: body.payload };
        return json(state.printers);
      }
      if (pathname.endsWith('/rest/v1/rpc/calc3d_save_purchase')) {
        const purchase = body.payload;
        const id = `purchase-${state.purchases.length + 1}`;
        const row = { id, owner_id: state.user.id, created_at: stamp, purchase_date: purchase.date, supplier: purchase.supplier, notes: purchase.notes, lines: purchase.lines, total: purchase.total, spool_count: purchase.spoolCount };
        state.purchases.unshift(row);
        for (const line of purchase.lines) for (let i = 0; i < line.quantity; i++) state.spools.push({ id: `spool-${state.spools.length + 1}`, owner_id: state.user.id, purchase_id: id, purchase_date: purchase.date, supplier: purchase.supplier, material: line.material, brand: line.brand, color: line.color, purchase_price: line.purchasePrice, net_weight_grams: line.netWeightGrams, remaining_grams: line.netWeightGrams });
        return json(row);
      }
      return json({ message: 'Unexpected endpoint' }, 404);
    });
    states.set(page, state);
    try { await use(state); } finally { states.delete(page); }
  },
});
export { expect };
export const signedInTest = test.extend({
  authenticated: [async ({ page, remote }, use) => { await signIn(page); await use(); }, { auto: true }],
});
/** Read through the same public authenticated REST API as the application. */
export async function remoteRows(page, table) {
  return page.evaluate(async table => {
    const { client } = await import('/src/auth/browser.mjs');
    const { data, error } = await client.from(`calc3d_${table}`).select('*');
    if (error) throw Error(error.message);
    return data;
  }, table);
}
export async function remoteQuotes(page) {
  return (await remoteRows(page, 'quotes')).map(row => ({ id: row.id, savedAt: row.saved_at,
    number: row.number, client: row.client, title: row.title, spoolId: row.spool_id,
    form: row.form, input: row.input, result: row.result }));
}
export async function remotePurchases(page) {
  const [records, spools] = await Promise.all([remoteRows(page, 'purchases'), remoteRows(page, 'spools')]);
  return records.map(row => ({ id: row.id, createdAt: row.created_at, date: row.purchase_date,
    supplier: row.supplier, notes: row.notes, lines: row.lines, total: row.total,
    spoolCount: row.spool_count, spools: spools.filter(spool => spool.purchase_id === row.id)
      .map(spool => ({ id: spool.id, purchaseId: row.id, date: spool.purchase_date,
        supplier: spool.supplier, material: spool.material, brand: spool.brand, color: spool.color,
        purchasePrice: spool.purchase_price, netWeightGrams: Number(spool.net_weight_grams),
        remainingGrams: Number(spool.remaining_grams) })) }));
}
export async function remotePrinterState(page) {
  return (await remoteRows(page, 'printer_settings'))[0]?.state ?? null;
}
/** Seed only the fake HTTP server with a domain-evaluated legacy snapshot. */
export async function seedHistoricalQuote(page, remote, fields) {
  const evaluated = await page.evaluate(async fields => {
    const { evaluate } = await import('/src/ui/quote.mjs');
    return evaluate(fields);
  }, fields);
  if (evaluated.error) throw Error(evaluated.error);
  const number = `COT-${String(++remote.number).padStart(6, '0')}`;
  const row = { id: `historical-${remote.number}`, saved_at: stamp, number,
    client: { name: '', phone: '', email: '' }, title: evaluated.title,
    spool_id: evaluated.spoolId, form: evaluated.form, input: evaluated.input, result: evaluated.result };
  remote.quotes.unshift(row);
  return row;
}
export async function signIn(page) {
  await page.goto('/login.html');
  await page.getByText('Entrar con correo y contraseña').click();
  await page.getByLabel('Correo', { exact: true }).fill('member@example.test');
  await page.getByLabel('Contraseña').fill('fake-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('/');
  await expect(page.locator('#save')).toBeEnabled();
}
