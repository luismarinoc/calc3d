import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const stamp = '2026-01-01T00:00:00Z';
const brand = { id, name: 'Acme', normalized_name: 'acme', color: '#AABBCC', aliases: ['acme'], revision: 2,
  archived_at: null, created_at: stamp, updated_at: stamp };
const profile = { id, name: 'PLA', material: 'PLA', brand: 'Acme', brand_id: id,
  filament_color: 'Azul', filament_color_hex: '#123456', purchase_price: 12000,
  net_weight_grams: 1000, revision: 2, archived_at: null, created_at: stamp, updated_at: stamp };
function harness() {
  let session = { user: { id }, access_token: 'fixture-owner-token' }, allowed = true, reply = null;
  const calls = [];
  const client = { from: table => ({ select: columns => {
    calls.push([table, columns]);
    const result = { data: [table === 'calc3d_brands' ? brand : profile],
      ...(table === 'calc3d_spool_profiles' ? { count: 1 } : {}), error: null };
    return { eq(column, value) { assert.equal(table, 'calc3d_spool_profiles');
      assert.equal(column, 'owner_id'); assert.equal(value, id); return this; },
    setHeader(name, value) { assert.equal(name, 'Authorization'); assert.equal(value, 'Bearer fixture-owner-token'); return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
  } }), rpc: async (name, args) => { calls.push([name, args]); return { data: reply, error: null }; } };
  const repo = createRemoteRepositories(client, session, { requireAccess: async () => ({ session, access: { allowed } }) });
  return { repo, calls, respond: value => { reply = value; }, switchOwner: () => { session = { user: { id: '22222222-2222-4222-8222-222222222222' } }; }, deny: () => { allowed = false; } };
}
test('archive DTOs remain readable, detached and include nullable timestamp', async () => {
  const h = harness();
  assert.equal((await h.repo.brands.list())[0].archivedAt, null);
  assert.equal((await h.repo.spoolProfiles.list())[0].archivedAt, null);
  assert.match(h.calls[0][1], /archived_at/);
  assert.match(h.calls[1][1], /archived_at/);
});
test('archive brand and profile use guarded CAS RPC and verify response identity, revision and timestamp', async () => {
  for (const [key, method, row, rpc] of [['brands', 'archiveBrand', brand, 'calc3d_archive_brand'],
    ['spoolProfiles', 'archiveProfile', profile, 'calc3d_archive_spool_profile']]) {
    const h = harness();
    for (const args of [['bad', 2], [id, 0], [id, Number.MAX_SAFE_INTEGER]]) {
      await assert.rejects(h.repo[key][method](...args), TypeError);
    }
    assert.deepEqual(h.calls, []);
    h.respond({ ...row, revision: 3, archived_at: stamp });
    const result = await h.repo[key][method](id, 2);
    assert.equal(result[key === 'brands' ? 'brand' : 'profile'].archivedAt, stamp);
    assert.deepEqual(h.calls.at(-1), [rpc, { [key === 'brands' ? 'brand_id' : 'profile_id']: id, expected_revision: 2 }]);
    h.respond({ ...row, revision: 3, archived_at: null });
    await assert.rejects(h.repo[key][method](id, 2), /remota inválida/);
    h.respond({ ...row, revision: 3, archived_at: stamp, id: '22222222-2222-4222-8222-222222222222' });
    await assert.rejects(h.repo[key][method](id, 2), /remota inválida/);
    h.respond({ ...row, revision: 3, archived_at: stamp, id });
    h.switchOwner();
    await assert.rejects(h.repo[key][method](id, 2), /cuenta/);
    const denied = harness(); denied.deny();
    await assert.rejects(denied.repo[key][method](id, 2), /Acceso/);
    assert.deepEqual(denied.calls, []);
  }
});
