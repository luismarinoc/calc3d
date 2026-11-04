import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const baseId = '33333333-3333-4333-8333-333333333333';
const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-negro';
const hash = 'a'.repeat(64);
const base = { id: baseId, origin: 'supplier', sku: 'PLA1', source_url: url, status: 'confirmed', revision: 3,
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
  } }; }, rpc: async (name, args) => { calls.push({ rpc: name, args }); return { data: name === 'calc3d_create_common_product' ? { ...base, id: other, origin: 'manual', sku: null, source_url: null, source_sha256: null, normalized_sha256: null, profile: args.payload, revision: 1 } :
      { ...base, origin: 'supplier', profile: { ...base.profile, ...args.payload }, revision: args.expected_revision + 1 }, error: null }; } };
  let role = 'admin';
  const repo = createRemoteRepositories(client, session, { requireAccess: async () => ({ session, access: { allowed: true, role } }) });
  return { repo, calls, tables, setRole(value) { role = value; }, switchAccount() { session = { user: { id: other }, access_token: 'other-token' }; } };
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
test('private supplier identity retains ID and archive but reads common values; masks are ignored', async () => {
  const h = harness({ calc3d_spool_profiles: [personal], calc3d_shared_overrides: [{ owner_id: owner, base_id: baseId, fields: { purchasePrice: 700 }, hidden: true, revision: 2 }] });
  let result = await h.repo.sharedCatalog.list();
  assert.deepEqual(result.profiles.map(row => row.id), [other]);
  assert.equal(result.profiles[0].archivedAt, stamp);
  assert.equal(result.profiles[0].purchasePrice, 1000);
  assert.deepEqual(result.profiles[0].commonTarget, { id: baseId, baseRevision: 3 });
  h.tables.calc3d_spool_profiles = [];
  h.tables.calc3d_shared_products = [{ ...base, profile: { ...base.profile, name: 'PLA nuevo', netWeightGrams: 850, purchasePrice: 1200 } }, pending];
  result = await h.repo.sharedCatalog.list();
  assert.equal(result.profiles[0].name, 'PLA nuevo');
  assert.equal(result.profiles[0].netWeightGrams, 850);
  assert.equal(result.profiles[0].purchasePrice, 1200);
  assert.equal(result.profiles[0].overrideRevision, undefined);
});
test('admin manual create then member list retains manual origin without supplier provenance', async () => {
  const h = harness();
  const created = await h.repo.sharedCatalog.create({ name: 'Manual', material: 'PLA', brand: '', purchasePrice: 500, netWeightGrams: 1000 });
  assert.equal(created.origin, 'manual');
  assert.equal(Object.hasOwn(created, 'sourceUrl'), false);
  h.tables.calc3d_shared_products = [{ ...base, id: other, origin: 'manual', source_url: null, sku: null,
    source_sha256: null, normalized_sha256: null, profile: { name: 'Manual', material: 'PLA', brand: '', purchasePrice: 500, netWeightGrams: 1000 }, revision: 1 }];
  h.setRole('member');
  const [visible] = (await h.repo.sharedCatalog.list()).profiles;
  assert.equal(visible.id, created.id);
  assert.equal(visible.origin, 'manual');
  assert.equal(visible.sourceUrl, undefined);
  assert.equal(visible.sku, undefined);
  assert.equal(visible.provenance, undefined);
  assert.equal(visible.baseRevision, 1);
});

test('foreign owner rows, stale account switch, duplicate and truncated pages reject without partial catalog', async () => {
  const foreign = harness({ leakForeign: true, calc3d_spool_profiles: [{ ...personal, owner_id: other }] });
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

test('member cannot mutate common or legacy masks; admin routes common update via revision', async () => {
  const h = harness(); h.setRole('member');
  const before = structuredClone(h.tables);
  for (const mutation of [() => h.repo.sharedCatalog.create(base.profile),
    () => h.repo.sharedCatalog.update(baseId, { name: 'X' }, 3),
    () => h.repo.sharedCatalog.saveOverride(baseId, { name: 'X' }, 0),
    () => h.repo.sharedCatalog.hide(baseId, 0)]) {
    await assert.rejects(mutation(), /administrador|no están disponibles/);
    assert.deepEqual(h.tables, before);
  }
  assert.equal(h.calls.filter(call => call.rpc).length, 0);
  h.setRole('admin');
  await h.repo.sharedCatalog.update(baseId, { name: 'New' }, 3);
  assert.deepEqual(h.calls.at(-1), { rpc: 'calc3d_update_common_product', args: { product_id: baseId, payload: { name: 'New' }, expected_revision: 3 } });
});
