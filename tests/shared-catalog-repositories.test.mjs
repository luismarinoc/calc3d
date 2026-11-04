import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-01-01T00:00:00Z';
const profile = { id: other, owner_id: other, name: 'PLA', material: 'PLA', brand: '', brand_id: null,
  filament_color: 'Azul', filament_color_hex: '#123456', purchase_price: 1000,
  net_weight_grams: 1000, revision: 1, created_at: stamp, updated_at: stamp, archived_at: null };
function harness({ countOffset = 0, switchAfter = false, rows = [profile] } = {}) {
  let session = { user: { id: owner }, access_token: 'owner-token' }; let role = 'member';
  const calls = []; const stored = rows.map(row => ({ ...row }));
  const client = {
    from(table) { assert.equal(table, 'calc3d_spool_profiles'); return { select(columns, options) {
      const state = { table, columns, options, cursor: null, token: null, limit: null, order: null };
      calls.push(state);
      return { order(key) { state.order = key; return this; }, limit(n) { state.limit = n; return this; },
        gt(key, value) { state.cursor = value; return this; }, setHeader(key, value) { state.token = value; return this; },
        then(resolve, reject) {
          const sorted = stored.filter(row => !state.cursor || row.id > state.cursor).sort((a, b) => a.id.localeCompare(b.id));
          const data = sorted.slice(0, state.limit);
          if (switchAfter) session = { user: { id: other }, access_token: 'other-token' };
          return Promise.resolve({ data, count: stored.length + countOffset, error: null }).then(resolve, reject);
        } };
    } }; },
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return { data: {
      ...profile, ...(!args.profile_id ? { id: owner, owner_id: owner } : {}),
      name: args.payload.name, purchase_price: args.payload.purchasePrice, revision: args.expected_revision + 1 }, error: null }; },
  };
  const repo = createRemoteRepositories(client, session, { requireAccess: async () => ({ session, access: { allowed: true, role } }) });
  return { repo, calls, stored, setRole(value) { role = value; } };
}

test('member sees foreign existing ID, brand/color and complete catalog with no writes', async () => {
  const h = harness({ rows: Array.from({ length: 701 }, (_, i) => ({ ...profile,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` })) });
  const result = await h.repo.spoolProfiles.listCatalog();
  assert.equal(result.length, 701);
  assert.equal(result[0].filamentColorHex, '#123456');
  assert.equal(result.at(-1).id, h.stored.at(-1).id);
  assert.equal(h.calls.filter(call => call.rpc).length, 0);
  assert.ok(h.calls.every(call => call.token === 'Bearer owner-token' && call.order === 'id' && call.limit === 500));
});

test('member cannot create/update/archive catalog profiles; administrator updates original ID with CAS', async () => {
  const h = harness(); const before = structuredClone(h.stored);
  const input = { name: 'Nuevo', material: 'PLA', brand: '', purchasePrice: 2000, netWeightGrams: 1000 };
  for (const mutation of [() => h.repo.spoolProfiles.createProfile(input),
    () => h.repo.spoolProfiles.updateProfile(other, input, 1),
    () => h.repo.spoolProfiles.archiveProfile(other, 1)]) await assert.rejects(mutation(), /administrador/);
  assert.deepEqual(h.stored, before);
  assert.equal(h.calls.filter(call => call.rpc).length, 0);
  h.setRole('admin');
  const updated = await h.repo.spoolProfiles.updateProfile(other, input, 1);
  assert.equal(updated.profile.id, other);
  assert.deepEqual(h.calls.at(-1), { rpc: 'calc3d_save_spool_profile', args: {
    profile_id: other, payload: input, expected_revision: 1 } });
});

test('catalog read rejects duplicate public profile identity without writing', async () => {
  const h = harness({ rows: [profile, { ...profile }] });
  const before = structuredClone(h.stored);
  await assert.rejects(h.repo.spoolProfiles.listCatalog(), /catálogo completo/);
  assert.deepEqual(h.stored, before);
  assert.equal(h.calls.filter(call => call.rpc).length, 0);
});

test('catalog read rejects malformed owner metadata without writing', async () => {
  const h = harness({ rows: [{ ...profile, owner_id: 'bad' }] });
  const before = structuredClone(h.stored);
  await assert.rejects(h.repo.spoolProfiles.listCatalog(), /remota inválida/);
  assert.deepEqual(h.stored, before);
  assert.equal(h.calls.filter(call => call.rpc).length, 0);
});

test('catalog rejects incomplete count and account switch before publishing any partial rows', async () => {
  await assert.rejects(harness({ countOffset: 1 }).repo.spoolProfiles.listCatalog(), /catálogo completo/);
  await assert.rejects(harness({ switchAfter: true }).repo.spoolProfiles.listCatalog(), /cuenta/);
});
