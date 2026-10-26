import { test as base, expect } from '@playwright/test';

const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email: 'member@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' };
const stamp = '2026-01-01T00:00:00.000Z';
const brandKey = name => name.trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC');
const states = new WeakMap();
export const remoteForPage = page => states.get(page);
export const test = base.extend({
  remote: async ({ page }, use) => {
    const state = { quotes: [], printers: null, purchases: [], spools: [], profiles: [], brands: [], number: 0, allowed: true, pending: false,
      fail: null, failAfter: null, reads: {}, calls: [], holdQuotes: null, holdProfiles: null, holdBrands: null, holdArchive: null, user };
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
      if (pathname.endsWith('/rest/v1/rpc/calc3d_claim_invitation')) {
        if (!state.pending) return json({ code: '23514', message: 'Invitation is not pending' }, 400);
        state.pending = false;
        state.allowed = true;
        return json({ email: state.user.email, role: 'member', active: true, created_at: stamp });
      }
      if (state.fail && pathname.includes(state.fail)) return json({ message: 'Network denied' }, 403);
      if (state.failAfter && pathname.includes(state.failAfter.path) && state.reads[pathname] > state.failAfter.after) return json({ message: 'Network denied' }, 403);
      if (pathname.endsWith('/rest/v1/calc3d_quotes')) {
        const visible = state.quotes.filter(row => !row.owner_id || row.owner_id === state.user.id);
        if (url.searchParams.get('order') === 'saved_at.desc') visible.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
        if (state.holdQuotes) await state.holdQuotes;
        return json(visible);
      }
      if (pathname.endsWith('/rest/v1/calc3d_printer_settings')) return json(state.printers && state.printers.owner_id === state.user.id ? [state.printers] : []);
      if (pathname.endsWith('/rest/v1/calc3d_spool_profiles')) {
        const visible = state.profiles.filter(row => row.owner_id === state.user.id);
        if (state.holdProfiles) await state.holdProfiles;
        return json(visible);
      }
      if (pathname.endsWith('/rest/v1/calc3d_brands')) {
        const visible = state.brands.filter(row => row.owner_id === state.user.id);
        if (state.holdBrands) await state.holdBrands;
        return json(visible);
      }
      if (pathname.endsWith('/rest/v1/rpc/calc3d_save_brand')) {
        const current = state.brands.find(row => row.id === body.brand_id && row.owner_id === state.user.id);
        if ((body.brand_id && !current) || body.expected_revision !== (current?.revision ?? 0))
          return json({ code: '40001', message: 'Brand revision conflict' }, 409);
        const payload = body.payload;
        if (!payload || typeof payload.name !== 'string' || !payload.name.trim() ||
            /[\p{Cc}\p{Cf}]/u.test(payload.name) || [...payload.name.trim()].length > 120 ||
            typeof payload.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(payload.color))
          return json({ code: '23514', message: 'Invalid brand' }, 400);
        const name = payload.name.trim().replace(/\s+/gu, ' ');
        const key = brandKey(name);
        if (state.brands.some(row => row.owner_id === state.user.id && row.id !== current?.id && row.aliases.includes(key)))
          return json({ code: '23505', message: 'Brand name already in use' }, 409);
        const row = { id: current?.id ?? crypto.randomUUID(), owner_id: state.user.id, name,
          normalized_name: key, color: payload.color.toUpperCase(), archived_at: current?.archived_at ?? null,
          aliases: current ? [...new Set([...current.aliases, key])] : [key],
          revision: (current?.revision ?? 0) + 1, created_at: current?.created_at ?? stamp, updated_at: stamp };
        state.brands = current ? state.brands.map(item => item.id === current.id ? row : item) : [...state.brands, row];
        return json(row);
      }
      if (pathname.endsWith('/rest/v1/rpc/calc3d_archive_brand') || pathname.endsWith('/rest/v1/rpc/calc3d_archive_spool_profile')) {
        if (!state.allowed) return json({ code: '28000', message: 'Calc3D access denied' }, 403);
        const isBrand = pathname.endsWith('calc3d_archive_brand');
        const collection = isBrand ? 'brands' : 'profiles';
        const key = isBrand ? 'brand_id' : 'profile_id';
        const label = isBrand ? 'brand' : 'spool profile';
        if (!body[key] || !Number.isSafeInteger(body.expected_revision) || body.expected_revision <= 0 ||
            body.expected_revision >= Number.MAX_SAFE_INTEGER) {
          return json({ code: '23514', message: `Invalid ${label} archive` }, 400);
        }
        const current = state[collection].find(row => row.id === body[key] && row.owner_id === state.user.id);
        if (!current || current.revision !== body.expected_revision || current.archived_at) {
          return json({ code: '40001', message: `${isBrand ? 'Brand' : 'Spool profile'} revision conflict` }, 409);
        }
        if (state.holdArchive) await state.holdArchive;
        const archived = { ...current, archived_at: stamp, revision: current.revision + 1, updated_at: stamp };
        state[collection] = state[collection].map(row => row === current ? archived : row);
        return json(archived);
      }
      if (pathname.endsWith('/rest/v1/calc3d_purchases')) return json(state.purchases.filter(row => !row.owner_id || row.owner_id === state.user.id));
      if (pathname.endsWith('/rest/v1/calc3d_spools')) return json(state.spools.filter(row => !row.owner_id || row.owner_id === state.user.id));
      if (pathname.endsWith('/rest/v1/rpc/calc3d_save_quote')) {
        state.number++;
        const row = { ...body.payload, owner_id: state.user.id, id: `quote-${state.number}`, saved_at: stamp, number: `COT-${String(state.number).padStart(6, '0')}`, spool_id: body.payload.spoolId };
        state.quotes.unshift(row);
        return json(row);
      }
      if (pathname.endsWith('/rest/v1/rpc/calc3d_save_spool_profile')) {
        const current = state.profiles.find(row => row.id === body.profile_id && row.owner_id === state.user.id);
        if ((body.profile_id && !current) || body.expected_revision !== (current?.revision ?? 0)) {
          return json({ code: '40001', message: 'Spool profile revision conflict' }, 409);
        }
        const payload = body.payload;
        if (!payload || !payload.name?.trim() || !payload.material?.trim() ||
            !Number.isSafeInteger(payload.purchasePrice) || payload.purchasePrice < 0 ||
            !Number.isFinite(payload.netWeightGrams) || payload.netWeightGrams <= 0) {
          return json({ code: '23514', message: 'Invalid spool profile' }, 400);
        }
        const brandId = Object.hasOwn(payload, 'brandId') ? payload.brandId : current?.brand_id ?? null;
        const selectedBrand = state.brands.find(row => row.id === brandId && row.owner_id === state.user.id);
        if (brandId !== null && !selectedBrand) return json({ code: '23514', message: 'Invalid spool profile' }, 400);
        const label = Object.hasOwn(payload, 'brand') ? payload.brand : current?.brand ?? '';
        const aliasBrand = state.brands.find(row => row.owner_id === state.user.id && row.aliases.includes(brandKey(label)));
        const resolvedBrand = selectedBrand ?? (Object.hasOwn(payload, 'brandId') ? null : aliasBrand);
        const suppliedFilament = Object.hasOwn(payload, 'filamentColor');
        if (suppliedFilament && typeof payload.filamentColor !== 'string')
          return json({ code: '23514', message: 'Invalid spool profile' }, 400);
        const filamentColor = suppliedFilament ? payload.filamentColor.trim() : current?.filament_color ?? '';
        const filamentColorHex = Object.hasOwn(payload, 'filamentColorHex') ? payload.filamentColorHex :
          (Object.hasOwn(payload, 'filamentColor') && !filamentColor ? null : current?.filament_color_hex ?? null);
        if (typeof filamentColor !== 'string' || [...filamentColor].length > 120 || /[\p{Cc}\p{Cf}]/u.test(filamentColor) ||
            (filamentColorHex !== null && (!/^#[0-9a-f]{6}$/i.test(filamentColorHex) ||
              !Object.hasOwn(payload, 'filamentColor'))) || (!filamentColor && filamentColorHex))
          return json({ code: '23514', message: 'Invalid spool profile' }, 400);
        const row = { id: current?.id ?? crypto.randomUUID(), owner_id: state.user.id,
          name: payload.name, material: payload.material,
          brand: resolvedBrand?.name ?? (Object.hasOwn(payload, 'brandId') && brandId === null && !Object.hasOwn(payload, 'brand') ? '' : label),
          brand_id: resolvedBrand?.id ?? null, filament_color: filamentColor,
          filament_color_hex: filamentColorHex?.toUpperCase() ?? null,
          purchase_price: payload.purchasePrice, net_weight_grams: payload.netWeightGrams,
          archived_at: current?.archived_at ?? null,
          revision: (current?.revision ?? 0) + 1, created_at: current?.created_at ?? stamp, updated_at: stamp };
        state.profiles = current ? state.profiles.map(item => item.id === current.id ? row : item) : [...state.profiles, row];
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
export const signedInEmptyTest = test.extend({
  authenticated: [async ({ page, remote }, use) => { await signIn(page, { withProfile: false }); await use(); }, { auto: true }],
});
export const signedInTest = test.extend({
  authenticated: [async ({ page, remote }, use) => { await signIn(page); await use(); }, { auto: true }],
});
/** Test-only profile revision through the public RPC; never edits calculator financial fields. */
export async function setQuoteProfilePrice(page, purchasePrice, netWeightGrams = 1000) {
  const [profile] = await remoteRows(page, 'spool_profiles');
  const error = await page.evaluate(async ({ profile, purchasePrice, netWeightGrams }) => {
    const { client } = await import('/src/auth/browser.mjs');
    const { error } = await client.rpc('calc3d_save_spool_profile', {
      payload: { name: profile.name, material: profile.material, brand: profile.brand, purchasePrice, netWeightGrams },
      profile_id: profile.id, expected_revision: profile.revision,
    });
    return error?.message ?? null;
  }, { profile, purchasePrice, netWeightGrams });
  if (error) throw Error(error);
  await page.reload();
  await expect(page.locator('#spoolId')).toHaveValue(`profile:${profile.id}`);
  await expect(page.locator('#save')).toBeEnabled();
  return `profile:${profile.id}`;
}
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
export async function signIn(page, { withProfile = true } = {}) {
  const remote = remoteForPage(page);
  // Fixture-owned legacy profile, never an application default or a production seed.
  if (withProfile && !remote.profiles.some(row => row.owner_id === remote.user.id)) {
    remote.profiles.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: remote.user.id,
      name: 'PETG 1 kg', material: 'PETG', brand: 'Prueba', purchase_price: 21900,
      net_weight_grams: 1000, revision: 1, created_at: stamp, updated_at: stamp });
  }
  await page.goto('/login.html');
  await page.getByText('Entrar con correo y contraseña').click();
  await page.getByLabel('Correo', { exact: true }).fill('member@example.test');
  await page.getByLabel('Contraseña').fill('fake-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  // A WebKit policy-canceled navigation wait can reject even after the root document
  // arrives. Assert its actual URL, then wait for the protected app to finish mounting.
  await expect(page).toHaveURL('/');
  await expect(page.locator('#spool-info')).not.toBeEmpty();
  await expect(page.locator('.account-nav')).toBeVisible();
}
