import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const owner = { user: { id } };
const row = (revision = 1) => ({ id, name: 'Acme', normalized_name: 'acme', color: '#AABBCC', aliases: ['acme', 'old'], revision,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
function harness() {
  const calls = []; let session = owner; let allowed = true; let after = () => {}; let response = row();
  const client = { from(table) { return { select(columns) { calls.push([table, columns]); return { then(resolve) { after(); resolve({ data: [row()], error: null }); } }; } }; },
    async rpc(name, args) { calls.push([name, args]); after(); return response?.error ? { data: null, error: response.error } : { data: response, error: null }; } };
  const access = { async requireAccess() { return { session, access: { allowed } }; } };
  return { repo: createRemoteRepositories(client, owner, access), calls,
    switchOwner() { session = { user: { id: '22222222-2222-4222-8222-222222222222' } }; },
    deny() { allowed = false; }, after(fn) { after = fn; }, reply(value) { response = value; } };
}
test('list and save use guarded public brand contract with detached alias keys', async () => {
  const h = harness();
  const listed = await h.repo.brands.list();
  assert.deepEqual(h.calls[0], ['calc3d_brands', 'id,name,normalized_name,color,aliases,revision,created_at,updated_at,archived_at']);
  assert.deepEqual(listed[0].aliases, ['acme', 'old']);
  listed[0].aliases.push('mutated');
  assert.deepEqual((await h.repo.brands.list())[0].aliases, ['acme', 'old']);
  const created = await h.repo.brands.createBrand({ name: ' Acme ', color: '#aabbcc' });
  assert.equal(created.brand.id, id);
  assert.deepEqual(h.calls.at(-1), ['calc3d_save_brand', { payload: { name: 'Acme', color: '#AABBCC' }, brand_id: null, expected_revision: 0 }]);
  h.reply(row(2));
  assert.equal((await h.repo.brands.updateBrand(id, { name: 'Acme', color: '#AABBCC' }, 1)).brand.revision, 2);
  assert.deepEqual(h.calls.at(-1), ['calc3d_save_brand', { payload: { name: 'Acme', color: '#AABBCC' }, brand_id: id, expected_revision: 1 }]);
});
test('invalid input, revision, remote shape and conflict reject without false success', async () => {
  const h = harness();
  for (const action of [() => h.repo.brands.createBrand({ name: '', color: '#AABBCC' }),
    () => h.repo.brands.createBrand({ name: 'Acme', color: 'red' }),
    () => h.repo.brands.updateBrand(id, { name: 'Acme', color: '#AABBCC' }, 0),
    () => h.repo.brands.updateBrand('bad', { name: 'Acme', color: '#AABBCC' }, 1)]) await assert.rejects(action());
  assert.deepEqual(h.calls, []);
  h.reply({ ...row(), aliases: ['other'] });
  await assert.rejects(h.repo.brands.createBrand({ name: 'Acme', color: '#AABBCC' }), /remota inválida/);
  h.reply({ ...row(), id: '22222222-2222-4222-8222-222222222222' });
  await assert.rejects(h.repo.brands.updateBrand(id, { name: 'Acme', color: '#AABBCC' }, 1), /remota inválida/);
  h.reply({ error: Object.assign(new Error('Brand revision conflict'), { code: '40001' }) });
  await assert.rejects(h.repo.brands.updateBrand(id, { name: 'Acme', color: '#AABBCC' }, 1),
    { message: 'La marca cambió; recarga antes de guardar.' });
});
test('owner and admission fencing before and after asynchronous reads and writes', async () => {
  const h = harness(); h.deny();
  await assert.rejects(h.repo.brands.list(), /Acceso/);
  await assert.rejects(h.repo.brands.createBrand({ name: 'Acme', color: '#AABBCC' }), /Acceso/);
  assert.deepEqual(h.calls, []);
  for (const method of ['list', 'create', 'update']) {
    const changed = harness(); changed.after(() => changed.switchOwner());
    await assert.rejects(method === 'list' ? changed.repo.brands.list() : method === 'create'
      ? changed.repo.brands.createBrand({ name: 'Acme', color: '#AABBCC' })
      : changed.repo.brands.updateBrand(id, { name: 'Acme', color: '#AABBCC' }, 1), /cuenta/);
  }
  const before = harness(); before.switchOwner();
  await assert.rejects(before.repo.brands.list(), /cuenta/);
  assert.deepEqual(before.calls, []);
});
