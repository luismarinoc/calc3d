import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const baseId = '33333333-3333-4333-8333-333333333333';
const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-negro';
const hash = 'a'.repeat(64);
const base = { id: baseId, sku: 'PLA1', source_url: url, status: 'confirmed', revision: 3,
  source_sha256: hash, normalized_sha256: hash, profile: { name: 'PLA', material: 'PLA', brand: 'ACME', purchasePrice: 1000, netWeightGrams: 1000, filamentColor: 'Azul' }, pending: null };
const pending = { ...base, id: other, sku: 'PEND', source_url: `${url}-pending`, status: 'pending', profile: null,
  pending: { name: 'Pendiente', material: 'PLA', brand: 'ACME', filamentColor: 'Rojo', referencePriceClp: 200, reasons: ['weight_unproven'] } };
const stamp = '2026-01-01T00:00:00Z';
const personal = { id: other, owner_id: owner, name: 'Propio', material: 'PETG', brand: 'Mía', brand_id: null,
  filament_color: '', filament_color_hex: null, source_url: url, purchase_price: 300, net_weight_grams: 750,
  revision: 1, created_at: stamp, updated_at: stamp, archived_at: stamp };
function harness(data = {}) {
  let session = { user: { id: owner }, access_token: 'owner-token' };
  const calls = [];
  const tables = { calc3d_shared_products: [base, pending], calc3d_shared_overrides: [], calc3d_spool_profiles: [], calc3d_supplier_references: [], ...data };
  const client = { from(table) { return { select(columns, options) {
    const state = { table, columns, options, owner: null, cursor: null, order: null, limit: null, token: null };
    calls.push(state);
    const query = { eq(key, value) { assert.equal(key, 'owner_id'); state.owner = value; return this; },
      gt(key, value) { assert.equal(key, state.order); state.cursor = value; return this; },
      order(key, opts) { assert.equal(key, table === 'calc3d_shared_overrides' ? 'base_id' : 'id'); assert.equal(opts.ascending, true); state.order = key; return this; },
      limit(value) { state.limit = value; return this; },
      setHeader(key, value) { assert.equal(key, 'Authorization'); state.token = value; return this; },
      then(resolve, reject) { let rows = tables[table]; if (!rows) return Promise.resolve({ data: null, error: Error('missing table') }).then(resolve, reject);
        rows = rows.filter(row => !state.owner || row.owner_id === state.owner || data.leakForeign);
        const count = rows.length;
        if (state.cursor) rows = rows.filter(row => row[state.order] > state.cursor);
        if (state.order) rows = [...rows].sort((a, b) => a[state.order].localeCompare(b[state.order]));
        if (state.limit) rows = rows.slice(0, state.limit);
        if (data.afterRead) data.afterRead(table, state);
        return Promise.resolve({ data: rows, count: state.options?.count ? count + (data.reportExtraCount && table === 'calc3d_shared_products' ? 1 : 0) : null, error: null }).then(resolve, reject); } };
    return query;
  } }; }, rpc: async (name, args) => { calls.push({ rpc: name, args }); return { data: { owner_id: owner, base_id: baseId, fields: args.fields ?? {}, hidden: name === 'calc3d_hide_shared_product', revision: args.expected_revision + 1 }, error: null }; } };
  const repo = createRemoteRepositories(client, session, { requireAccess: async () => ({ session, access: { allowed: true } }) });
  return { repo, calls, tables, switchAccount() { session = { user: { id: other }, access_token: 'other-token' }; } };
}
test('new account reads complete confirmed and pending rows with no writes; pending stays nonquotable', async () => {
  const h = harness(); const result = await h.repo.sharedCatalog.list();
  assert.deepEqual(result.profiles.map(row => row.id), [`base:${baseId}`]);
  assert.equal(result.profiles[0].filamentColor, 'Azul');
  assert.equal(result.profiles[0].brandId, null);
  assert.equal(result.profiles[0].source, 'base');
  assert.equal(result.profiles[0].baseRevision, 3);
  assert.deepEqual(result.pendingReferences.map(row => [row.id, row.referencePriceClp, row.reasons, row.quotable]),
    [[`base:${other}`, 200, ['weight_unproven'], false]]);
  assert.equal(h.calls.filter(call => call.rpc).length, 0);
  assert.ok(h.calls.filter(call => call.table).every(call => call.token === 'Bearer owner-token'));
});
test('sparse owner mask refreshes untouched fields; exact verified personal duplicate retains ID, fields and archive', async () => {
  const h = harness({ calc3d_spool_profiles: [personal], calc3d_shared_overrides: [{ owner_id: owner, base_id: baseId, fields: { purchasePrice: 700 }, hidden: false, revision: 2 }] });
  let result = await h.repo.sharedCatalog.list();
  assert.deepEqual(result.profiles.map(row => row.id), [other]);
  assert.equal(result.profiles[0].archivedAt, stamp);
  h.tables.calc3d_spool_profiles = [];
  result = await h.repo.sharedCatalog.list();
  assert.equal(result.profiles[0].purchasePrice, 700);
  assert.equal(result.profiles[0].name, 'PLA');
  assert.deepEqual(result.profiles[0].overriddenFields, ['purchasePrice']);
  assert.equal(result.profiles[0].overrideRevision, 2);
  h.tables.calc3d_shared_products = [{ ...base, profile: { ...base.profile, name: 'PLA nuevo', netWeightGrams: 850, purchasePrice: 1200 } }, pending];
  result = await h.repo.sharedCatalog.list();
  assert.equal(result.profiles[0].name, 'PLA nuevo');
  assert.equal(result.profiles[0].netWeightGrams, 850);
  assert.equal(result.profiles[0].purchasePrice, 700);
  h.tables.calc3d_shared_overrides = [{ owner_id: owner, base_id: baseId, fields: { purchasePrice: 700 }, hidden: true, revision: 3 }];
  assert.deepEqual((await h.repo.sharedCatalog.list()).profiles, []);
  assert.deepEqual(h.tables.calc3d_shared_products[0].profile.purchasePrice, 1200);
});
test('foreign owner rows, stale account switch, duplicate and truncated pages reject without partial catalog', async () => {
  const foreign = harness({ leakForeign: true, calc3d_shared_overrides: [{ owner_id: other, base_id: baseId, fields: {}, hidden: true, revision: 1 }] });
  await assert.rejects(foreign.repo.sharedCatalog.list(), /catálogo completo/);
  const switched = harness(); switched.switchAccount();
  await assert.rejects(switched.repo.sharedCatalog.list(), /cuenta/);
  let delayed;
  delayed = harness({ afterRead(table) { if (table === 'calc3d_shared_products') delayed.switchAccount(); } });
  await assert.rejects(delayed.repo.sharedCatalog.list(), /cuenta/);
  assert.equal(delayed.calls.filter(call => call.table === 'calc3d_shared_overrides').length, 0);
  const duplicate = harness({ calc3d_shared_products: [base, base] });
  await assert.rejects(duplicate.repo.sharedCatalog.list(), /catálogo completo/);
  const truncated = harness({ reportExtraCount: true });
  await assert.rejects(truncated.repo.sharedCatalog.list(), /catálogo completo/);
  const reversed = harness({ calc3d_shared_products: [base, pending], reportExtraCount: true });
  await assert.rejects(reversed.repo.sharedCatalog.list(), /catálogo completo/);
  const missing = harness({ calc3d_shared_products: null });
  await assert.rejects(missing.repo.sharedCatalog.list(), /missing table/);
});
test('existing private profile and pending reads stay owner-filtered with no shared calls', async () => {
  const h = harness({ calc3d_spool_profiles: [personal] });
  assert.equal((await h.repo.spoolProfiles.list())[0].id, other);
  assert.deepEqual(await h.repo.supplierReferences.list(), []);
  assert.deepEqual(h.calls.map(call => call.table), ['calc3d_spool_profiles', 'calc3d_supplier_references']);
  assert.ok(h.calls.every(call => call.owner === owner && call.token === 'Bearer owner-token'));
});

test('edit and hide route sparse fields/revision to owner RPC only; invalid changes never write', async () => {
  const h = harness();
  await assert.rejects(h.repo.sharedCatalog.saveOverride('bad', { name: 'X' }, 0), TypeError);
  assert.equal(h.calls.length, 0);
  const result = await h.repo.sharedCatalog.saveOverride(baseId, { name: 'Mi PLA' }, 0);
  assert.deepEqual(h.calls.at(-1), { rpc: 'calc3d_save_shared_override', args: { product_id: baseId, fields: { name: 'Mi PLA' }, expected_revision: 0 } });
  assert.equal(result.overrideRevision, 1);
  await h.repo.sharedCatalog.hide(baseId, 1);
  assert.deepEqual(h.calls.at(-1), { rpc: 'calc3d_hide_shared_product', args: { product_id: baseId, expected_revision: 1 } });
});
