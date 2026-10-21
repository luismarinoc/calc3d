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
