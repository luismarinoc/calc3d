import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const owner = { user: { id: '11111111-1111-4111-8111-111111111111' } };
function harness() {
  const calls = [];
  const responses = new Map();
  let session = owner;
  let allowed = true;
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }) },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return responses.get(name) ?? { data: name === 'calc3d_access_status' ? { allowed, role: 'member', email: 'a@example.test' } : null, error: null };
    },
    from: (table) => ({ select: (columns) => {
      calls.push([table, columns]);
      const query = { order: async () => responses.get(table) ?? { data: [], error: null },
        then: (resolve, reject) => Promise.resolve(responses.get(table) ?? { data: [], error: null }).then(resolve, reject) };
      return query;
    } }),
  };
  return { client, calls, responses, setSession: value => { session = value; }, deny: () => { allowed = false; } };
}

test('quote uses server number, preserves snapshots, lists detached mapped rows', async () => {
  const h = harness();
  const repo = createRemoteRepositories(h.client, owner);
  const evaluated = { title: 'Pieza', spoolId: 'demo', form: { purpose: 'sale' }, input: { purpose: 'sale' }, result: { totalCost: 2, finalPrice: 4 } };
  const row = { id: 'server-id', saved_at: '2026-01-01T00:00:00Z', number: 'COT-000079', client: { name: 'Ana', phone: '', email: '' }, title: 'Pieza', spool_id: 'demo', form: evaluated.form, input: evaluated.input, result: evaluated.result };
  h.responses.set('calc3d_save_quote', { data: row, error: null });
  const saved = await repo.quotes.save(evaluated, { name: ' Ana ' });
  assert.equal(saved.record.number, 'COT-000079');
  assert.deepEqual(h.calls.find(([name]) => name === 'calc3d_save_quote'), ['calc3d_save_quote', { payload: { ...evaluated, client: row.client } }]);
  h.responses.set('calc3d_quotes', { data: [row], error: null });
  const records = await repo.quotes.list();
  assert.deepEqual(records, [saved.record]);
  records[0].form.purpose = 'gift';
  assert.equal((await repo.quotes.get('server-id')).form.purpose, 'sale');
});

test('empty/failed quote RPC cannot claim success or reuse a number', async () => {
  const h = harness(); const repo = createRemoteRepositories(h.client, owner);
  await assert.rejects(repo.quotes.save({ title: 'x', spoolId: 'y', form: {}, input: {}, result: {} }), /No se pudo guardar/);
  h.responses.set('calc3d_save_quote', { data: null, error: new Error('denied') });
  await assert.rejects(repo.quotes.save({ title: 'x', spoolId: 'y', form: {}, input: {}, result: {} }), /denied/);
  assert.deepEqual(await repo.quotes.list(), []);
});

test('printer default is not written, CAS rejects stale revision and retains state', async () => {
  const h = harness(); const repo = createRemoteRepositories(h.client, owner);
  const first = await repo.printers.load();
  assert.equal(first.printers.length, 1);
  assert.equal(h.calls.some(([name]) => name === 'calc3d_save_printers'), false);
  h.responses.set('calc3d_save_printers', { data: null, error: new Error('Printer revision conflict') });
  await assert.rejects(repo.printers.createPrinter({ ...first.printers[0], name: 'Otro' }), /revision conflict/);
  assert.deepEqual(await repo.printers.snapshot(), first);
  h.responses.set('calc3d_save_printers', { data: { revision: 1, state: first }, error: null });
  await repo.printers.activatePrinter(first.activeId);
  assert.deepEqual(h.calls.filter(([name]) => name === 'calc3d_save_printers').at(-1), ['calc3d_save_printers', { payload: first, expected_revision: 0 }]);
});

test('purchase save RPC and spool rows preserve acquisition snapshots', async () => {
  const h = harness(); const repo = createRemoteRepositories(h.client, owner);
  const input = { date: '2026-01-02', supplier: { name: 'Shop', address: '', phone: '' }, lines: [{ material: 'PLA', brand: 'X', color: 'Blue', quantity: 1, netWeightGrams: 1000, purchasePrice: 1000 }], notes: '' };
  const row = { id: 'p1', created_at: '2026-01-02T00:00:00Z', purchase_date: input.date, supplier: input.supplier, lines: input.lines, notes: '', total: 1000, spool_count: 1 };
  h.responses.set('calc3d_save_purchase', { data: row, error: null });
  assert.equal((await repo.purchases.savePurchase(input)).record.id, 'p1');
  assert.deepEqual(h.calls.find(([name]) => name === 'calc3d_save_purchase'), ['calc3d_save_purchase', { payload: { ...input, total: 1000, spoolCount: 1 } }]);
  h.responses.set('calc3d_purchases', { data: [row], error: null });
  h.responses.set('calc3d_spools', { data: [{ id: 's1', purchase_id: 'p1', purchase_date: input.date, supplier: input.supplier, material: 'PLA', brand: 'X', color: 'Blue', purchase_price: 1000, net_weight_grams: 1000, remaining_grams: 1000 }], error: null });
  assert.deepEqual((await repo.purchases.listPurchases())[0].lines, input.lines);
  assert.equal((await repo.purchases.listSpools())[0].netWeightGrams, 1000);
  const before = await repo.purchases.listPurchases();
  h.responses.set('calc3d_save_purchase', { data: null, error: null });
  await assert.rejects(repo.purchases.savePurchase(input), /No se pudo guardar/);
  assert.deepEqual(await repo.purchases.listPurchases(), before);
});

test('revocation and account switch fail closed before reads or writes', async () => {
  const h = harness(); const repo = createRemoteRepositories(h.client, owner);
  h.deny();
  await assert.rejects(repo.quotes.list(), /Acceso/);
  assert.equal(h.calls.some(([name]) => name === 'calc3d_quotes'), false);
  h.setSession({ user: { id: 'other' } });
  await assert.rejects(repo.purchases.savePurchase({}), /cuenta/);
  assert.equal(h.calls.some(([name]) => name === 'calc3d_save_purchase'), false);
});

const profileId = '22222222-2222-4222-8222-222222222222';
const profileInput = { name: '  Bobina  ', material: 'PLA+', brand: '', purchasePrice: 0, netWeightGrams: 0.5 };
const profileRow = (revision = 1) => ({ id: profileId, name: 'Bobina', material: 'PLA+', brand: '', purchase_price: 0,
  net_weight_grams: '0.5', revision, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' });

function profileHarness() {
  let session = owner;
  let allowed = true;
  let afterCall = () => {};
  let stored = [profileRow()];
  let mutations = 0;
  const calls = [];
  let reply = profileRow();
  const client = {
    from(table) {
      assert.equal(table, 'calc3d_spool_profiles');
      return { select(columns) {
        calls.push([table, columns]);
        return { then(resolve, reject) { const result = { data: stored, error: null }; afterCall(); return Promise.resolve(result).then(resolve, reject); } };
      } };
    },
    async rpc(name, args) {
      calls.push([name, args]);
      mutations++;
      const result = reply?.error ? { data: null, error: reply.error } : { data: reply, error: null };
      afterCall();
      return result;
    },
  };
  const access = { async requireAccess() { return { session, access: { allowed } }; } };
  return { repo: createRemoteRepositories(client, owner, access), calls, get mutations() { return mutations; },
    get stored() { return stored; }, setStored(value) { stored = value; }, setReply(value) { reply = value; },
    switchAccount() { session = { user: { id: profileId } }; }, deny() { allowed = false; },
    after(fn) { afterCall = fn; } };
}

test('profile list maps selected columns, controlled numeric conversion and detached DTOs', async () => {
  const h = profileHarness();
  const rows = await h.repo.spoolProfiles.list();
  assert.deepEqual(h.calls[0], ['calc3d_spool_profiles', 'id,name,material,brand,purchase_price,net_weight_grams,revision,created_at,updated_at']);
  assert.deepEqual(rows, [{ id: profileId, name: 'Bobina', material: 'PLA+', brand: '', purchasePrice: 0,
    netWeightGrams: 0.5, revision: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }]);
  rows[0].name = 'Changed';
  assert.equal(h.stored[0].name, 'Bobina');
  assert.equal((await h.repo.spoolProfiles.list())[0].name, 'Bobina');
  for (const invalid of [{ ...profileRow(), id: 'bad' }, { ...profileRow(), revision: 0 },
    { ...profileRow(), net_weight_grams: 'Infinity' }, { ...profileRow(), purchase_price: '5' },
    { ...profileRow(), name: ' ' }]) {
    h.setStored([invalid]);
    await assert.rejects(h.repo.spoolProfiles.list(), /remota inválida/i);
  }
});

test('create/update send normalized payload and CAS args, verify returned ID/revision, and detach records', async () => {
  const h = profileHarness();
  const created = await h.repo.spoolProfiles.createProfile(profileInput);
  assert.deepEqual(h.calls[0], ['calc3d_save_spool_profile', { payload: { ...profileInput, name: 'Bobina' }, profile_id: null, expected_revision: 0 }]);
  created.profile.name = 'Changed';
  assert.equal(h.stored[0].name, 'Bobina');
  h.setReply(profileRow(2));
  const updated = await h.repo.spoolProfiles.updateProfile(profileId, profileInput, 1);
  assert.equal(updated.profile.revision, 2);
  assert.deepEqual(h.calls.at(-1), ['calc3d_save_spool_profile', { payload: { ...profileInput, name: 'Bobina' }, profile_id: profileId, expected_revision: 1 }]);
  for (const reply of [{ ...profileRow(), id: 'bad' }, profileRow(1), { ...profileRow(2), id: owner.user.id }, { ...profileRow(2), net_weight_grams: 'NaN' }]) {
    h.setReply(reply);
    await assert.rejects(h.repo.spoolProfiles.updateProfile(profileId, profileInput, 1), /remota inválida|guard/i);
  }
});

test('invalid profile inputs and revisions never call mutation or alter stored rows', async () => {
  const h = profileHarness();
  for (const action of [() => h.repo.spoolProfiles.createProfile({ ...profileInput, purchasePrice: '5' }),
    () => h.repo.spoolProfiles.updateProfile('bad', profileInput, 1),
    () => h.repo.spoolProfiles.updateProfile(profileId, profileInput, 0),
    () => h.repo.spoolProfiles.updateProfile(profileId, profileInput, Number.MAX_SAFE_INTEGER),
    () => h.repo.spoolProfiles.updateProfile(profileId, { ...profileInput, netWeightGrams: 0 }, 1)]) {
    await assert.rejects(action());
  }
  assert.equal(h.mutations, 0);
  assert.deepEqual(h.stored, [profileRow()]);
  assert.deepEqual(h.calls, []);
});

test('stale conflict propagates meaningful Spanish feedback without retry or local writes', async () => {
  const h = profileHarness();
  h.setReply({ error: Object.assign(new Error('Spool profile revision conflict'), { code: '40001' }) });
  await assert.rejects(h.repo.spoolProfiles.updateProfile(profileId, profileInput, 1), /bobina.*cambió|perfil.*cambió/i);
  assert.equal(h.mutations, 1);
  assert.deepEqual(h.stored, [profileRow()]);
});

test('profile repository guard rejects before calls and after returned protected data', async () => {
  const h = profileHarness();
  h.deny();
  await assert.rejects(h.repo.spoolProfiles.list(), /Acceso/);
  await assert.rejects(h.repo.spoolProfiles.createProfile(profileInput), /Acceso/);
  assert.deepEqual(h.calls, []);
  const switched = profileHarness();
  switched.switchAccount();
  await assert.rejects(switched.repo.spoolProfiles.updateProfile(profileId, profileInput, 1), /cuenta/);
  assert.equal(switched.mutations, 0);
  for (const method of ['list', 'create', 'update']) {
    const changed = profileHarness();
    changed.after(() => changed.switchAccount());
    await assert.rejects(method === 'list' ? changed.repo.spoolProfiles.list() : method === 'create'
      ? changed.repo.spoolProfiles.createProfile(profileInput)
      : changed.repo.spoolProfiles.updateProfile(profileId, profileInput, 1), /cuenta/);
  }
});
