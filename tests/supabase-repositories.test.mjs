import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const owner = { user: { id: '11111111-1111-4111-8111-111111111111' }, access_token: 'fixture-owner-token' };
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
        return { eq(column, value) { assert.equal(column, 'owner_id'); assert.equal(value, owner.user.id); return this; },
          setHeader(name, value) { assert.equal(name, 'Authorization'); assert.equal(value, 'Bearer fixture-owner-token'); return this; },
          then(resolve, reject) { const result = { data: stored, count: stored.length, error: null }; afterCall(); return Promise.resolve(result).then(resolve, reject); } };
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
  assert.deepEqual(h.calls[0], ['calc3d_spool_profiles', 'id,name,material,brand,brand_id,filament_color,filament_color_hex,source_url,purchase_price,net_weight_grams,revision,created_at,updated_at,archived_at']);
  assert.deepEqual(rows, [{ id: profileId, name: 'Bobina', material: 'PLA+', brand: '', brandId: null,
    filamentColor: '', filamentColorHex: null, purchasePrice: 0, netWeightGrams: 0.5,
    revision: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', archivedAt: null }]);
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

const catalogId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const catalogRow = n => ({ ...profileRow(), id: catalogId(n), name: `Filamento ${n}`, brand_id: owner.user.id,
  filament_color: 'Azul', filament_color_hex: '#123456', source_url:
    `https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/filamento-${n}`,
  archived_at: n === 2 ? '2026-01-03T00:00:00Z' : null, revision: n === 2 ? 4 : 1 });
function cappedCatalog({ size = 1092, cap = 1000, onResponse = () => {}, page = () => null } = {}) {
  const stored = Array.from({ length: size }, (_, n) => catalogRow(n + 1));
  const calls = []; let session = owner; let writes = 0; let counter = 7;
  const client = {
    from(table) {
      assert.equal(table, 'calc3d_spool_profiles');
      return { select(columns, options) {
        const query = { cursor: null, pageSize: null, ownerFilter: null, authorization: null,
          setHeader(name, value) { assert.equal(name, 'Authorization'); this.authorization = value; return this; },
          eq(column, value) { assert.equal(column, 'owner_id'); this.ownerFilter = value; return this; },
          gt(column, value) { assert.equal(column, 'id'); this.cursor = value; return this; },
          order(column, options) { assert.equal(column, 'id'); assert.deepEqual(options, { ascending: true }); return this; },
          limit(value) { this.pageSize = value; return this; },
          then(resolve, reject) {
            calls.push({ columns, options, cursor: this.cursor, limit: this.pageSize, ownerFilter: this.ownerFilter,
              authorization: this.authorization });
            const setJWT = id => { session = id === owner.user.id ? owner :
              { user: { id }, access_token: 'fixture-other-token' }; };
            const effectiveOwner = this.authorization?.startsWith('Bearer fixture-owner-token') ? owner.user.id : session.user.id;
            const result = page(this, calls.length, stored, setJWT, effectiveOwner) ??
              (this.ownerFilter && effectiveOwner !== this.ownerFilter ? { data: [], count: 0, error: null } :
                { data: (this.cursor ? stored.filter(row => row.id > this.cursor) : stored)
                  .slice(0, Math.min(cap, this.pageSize ?? cap)), count: stored.length, error: null });
            onResponse(calls.length, () => setJWT(catalogId(9000)), () => setJWT(owner.user.id),
              () => { session = { ...owner, access_token: 'fixture-owner-token-rotated' }; });
            return Promise.resolve(result).then(resolve, reject);
          },
        }; return query;
      } };
    },
    rpc() { writes++; counter++; throw Error('unexpected write'); },
  };
  const access = { requireAccess: async () => ({ session, access: { allowed: true } }) };
  return { repo: createRemoteRepositories(client, owner, access), stored, calls,
    get writes() { return writes; }, get counter() { return counter; } };
}

test('capped public profile list returns every field and URL without duplicates or writes', async () => {
  const h = cappedCatalog();
  const result = await h.repo.spoolProfiles.list();
  assert.equal(result.length, 1092);
  assert.equal(new Set(result.map(row => row.id)).size, 1092);
  assert.deepEqual(result.map(row => row.id), h.stored.map(row => row.id));
  assert.deepEqual(result[1], { id: catalogId(2), name: 'Filamento 2', material: 'PLA+', brand: '',
    brandId: owner.user.id, filamentColor: 'Azul', filamentColorHex: '#123456',
    sourceUrl: h.stored[1].source_url, purchasePrice: 0, netWeightGrams: 0.5,
    revision: 4, createdAt: h.stored[1].created_at, updatedAt: h.stored[1].updated_at,
    archivedAt: h.stored[1].archived_at });
  assert.equal(h.writes, 0); assert.equal(h.counter, 7);
  assert.deepEqual(h.stored, Array.from({ length: 1092 }, (_, n) => catalogRow(n + 1)));
});

test('small profile list preserves server order, full projection and one query', async () => {
  const h = cappedCatalog({ size: 3, page: (query, call, stored) =>
    ({ data: [stored[2], stored[0], stored[1]], count: 3, error: null }) });
  const result = await h.repo.spoolProfiles.list();
  assert.deepEqual(result.map(row => row.id), [catalogId(3), catalogId(1), catalogId(2)]);
  assert.equal(result[2].sourceUrl, h.stored[1].source_url);
  assert.equal(result[2].archivedAt, h.stored[1].archived_at);
  assert.equal(result[2].revision, 4);
  assert.equal(h.calls.length, 1); assert.equal(h.writes, 0); assert.equal(h.counter, 7);
  assert.equal(h.calls[0].ownerFilter, owner.user.id);
});

test('account switch after first protected response rejects before next page request', async () => {
  const h = cappedCatalog({ onResponse: (call, switchOwner) => { if (call === 1) switchOwner(); } });
  await assert.rejects(h.repo.spoolProfiles.list(), { message: 'La cuenta cambió; vuelve a iniciar sesión.' });
  assert.equal(h.calls.length, 1); assert.equal(h.writes, 0); assert.equal(h.counter, 7);
  assert.equal(h.stored.length, 1092);
  const later = cappedCatalog({ onResponse: (call, switchOwner) => { if (call === 2) switchOwner(); } });
  await assert.rejects(later.repo.spoolProfiles.list(), { message: 'La cuenta cambió; vuelve a iniciar sesión.' });
  assert.equal(later.calls.length, 2); assert.equal(later.writes, 0); assert.equal(later.counter, 7);
});

test('each page uses the current validated A token after refresh, not the creation token', async () => {
  const h = cappedCatalog({ onResponse(call, switchOwner, restoreOwner, rotateToken) {
    if (call === 1) rotateToken();
  } });
  assert.equal((await h.repo.spoolProfiles.list()).length, 1092);
  assert.equal(h.calls[0].authorization, 'Bearer fixture-owner-token');
  assert.ok(h.calls.slice(1).every(call => call.authorization === 'Bearer fixture-owner-token-rotated'));
  assert.equal(h.writes, 0); assert.equal(h.counter, 7);
});

test('A-B-A initial empty result binds the validated A credential and returns real A profiles', async () => {
  const h = cappedCatalog({ size: 3,
    page(query, call, stored, setJWT) {
      setJWT(catalogId(9000)); // The global client switches to B only while this request runs.
      const effectiveOwner = query.authorization === 'Bearer fixture-owner-token' ? owner.user.id : catalogId(9000);
      return { data: effectiveOwner === owner.user.id ? stored : [], count: effectiveOwner === owner.user.id ? 3 : 0, error: null };
    },
    onResponse(call, switchOwner, restoreOwner) { restoreOwner(); },
  });
  assert.deepEqual((await h.repo.spoolProfiles.list()).map(row => row.id), h.stored.map(row => row.id));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].ownerFilter, owner.user.id);
  assert.equal(h.calls[0].authorization, 'Bearer fixture-owner-token');
  assert.equal(h.writes, 0); assert.equal(h.counter, 7);
  assert.deepEqual(h.stored, Array.from({ length: 3 }, (_, n) => catalogRow(n + 1)));
  const empty = cappedCatalog({ size: 0 });
  assert.deepEqual(await empty.repo.spoolProfiles.list(), []);
  assert.equal(empty.calls.length, 1); assert.equal(empty.calls[0].authorization, 'Bearer fixture-owner-token');
  assert.equal(empty.writes, 0); assert.equal(empty.counter, 7);
});

test('A-B-A JWT race during a page uses A-bound credential, never B rows', async () => {
  const h = cappedCatalog({
    page: (query, call, stored, setJWT) => {
      if (call !== 2) return null;
      setJWT(catalogId(9000));
      if (query.authorization === 'Bearer fixture-owner-token') return null; // A-bound request reads A rows.
      if (query.ownerFilter === owner.user.id) return { data: [], error: null }; // B cannot read A-filtered rows.
      return { data: stored.slice(1000).map(row => ({ ...row, name: `B ${row.name}` })), error: null };
    },
    onResponse: (call, switchOwner, restoreOwner) => { if (call === 2) restoreOwner(); },
  });
  const result = await h.repo.spoolProfiles.list();
  assert.deepEqual(result.map(row => row.id), h.stored.map(row => row.id));
  assert.equal(result[1000].name, h.stored[1000].name);
  assert.ok(h.calls.length >= 2);
  assert.ok(h.calls.every(call => call.ownerFilter === owner.user.id &&
    call.authorization === 'Bearer fixture-owner-token'));
  assert.equal(h.writes, 0); assert.equal(h.counter, 7);
  assert.deepEqual(h.stored, Array.from({ length: 1092 }, (_, n) => catalogRow(n + 1)));
});

test('smaller server pages continue; replay, empty, errors and missing counts never report completion', async () => {
  const small = cappedCatalog({ cap: 37 });
  assert.equal((await small.repo.spoolProfiles.list()).length, 1092);
  assert.ok(small.calls.length > 2);
  for (const page of [
    (query, call, stored) => call === 3 ? { data: [stored[0]], count: stored.length, error: null } :
      call === 2 ? { data: [stored[0]], count: stored.length, error: null } : null,
    (query, call, stored) => call === 2 ? { data: [], count: stored.length, error: null } : null,
    (query, call, stored) => call === 2 ? { data: null, count: stored.length, error: new Error('Backend denied') } : null,
    (query, call, stored) => call === 2 ? { data: [{ ...stored[1000], owner_id: catalogId(9000) }], error: null } : null,
  ]) {
    const h = cappedCatalog({ page });
    await assert.rejects(h.repo.spoolProfiles.list());
    assert.ok(h.calls.length === 2 || h.calls.length === 3);
    assert.equal(h.writes, 0); assert.equal(h.counter, 7);
    assert.equal(h.stored.length, 1092);
  }
  const unknown = cappedCatalog({ page: (query, call, stored) =>
    call === 1 ? { data: stored.slice(0, 1000), count: null, error: null } : null });
  await assert.rejects(unknown.repo.spoolProfiles.list());
  assert.equal(unknown.calls.length, 1);
  assert.equal(unknown.writes, 0); assert.equal(unknown.counter, 7);
  const inconsistent = cappedCatalog({ size: 1092, page: (query, call, stored) =>
    call === 1 ? { data: stored.slice(0, 1000), count: stored.length + 1, error: null } : null });
  await assert.rejects(inconsistent.repo.spoolProfiles.list(), /catálogo completo/);
  assert.equal(inconsistent.writes, 0); assert.equal(inconsistent.counter, 7);
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
