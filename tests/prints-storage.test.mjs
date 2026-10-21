import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrintStore } from '../src/data/prints.mjs';
import { createPurchaseStore } from '../src/data/purchases.mjs';

const KEY = 'calc3d.demo.prints.v1';
const PKEY = 'calc3d.demo.purchases.v1';
function memory() {
  const data = new Map(); const writes = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); writes.set(key, (writes.get(key) ?? 0) + 1); },
    inspect: (key) => ({ raw: data.get(key) ?? null, writes: writes.get(key) ?? 0 }), external: (key, value) => data.set(key, value) };
}
function setup(storage = memory(), ids = ['job1', 'job2', 'job3']) {
  const purchases = createPurchaseStore(storage, { id: (() => { const keys = ['buy1', 's1', 's2']; return () => keys.shift(); })(), now: () => new Date('2025-01-01T00:00:00.000Z') });
  assert.equal(purchases.savePurchase({ date: '2024-02-29', supplier: { name: 'Tienda' }, lines: [{ material: 'PLA', brand: 'Marca', color: 'Azul', quantity: 2, netWeightGrams: 0.3, purchasePrice: 300 }] }).ok, true);
  let idCalls = 0, clockCalls = 0;
  const options = { purchaseStore: purchases, id: () => { idCalls++; return ids.shift(); }, now: () => { clockCalls++; return new Date('2025-03-01T12:00:00.000Z'); } };
  return { storage, purchases, options, store: createPrintStore(storage, options), counts: () => ({ idCalls, clockCalls }) };
}
const job = (submissionId = 'draft1', overrides = {}) => ({ submissionId, date: '2024-02-29', title: 'Pieza', purpose: 'sale', outcome: 'completed', pieceCount: 4, spoolId: 's1', actualGrams: 0.1, hours: 1, minutes: 30, costInputs: { watts: 100, electricityPricePerKwh: 200, depreciationPerHour: 10, maintenancePerHour: 20, laborMinutes: 30, laborRatePerHour: 600, extraProductionCost: 5 }, ...overrides });
const inventory = (store) => { const result = store.listInventory(); assert.equal(result.ok, true); return result.inventory; };

// Every refusal checks public state, input, source bytes and both counters, not private adapter fields.
function refusal(f, input, error, expectedAllocation = { idCalls: 0, clockCalls: 0 }) {
  const original = structuredClone(input);
  const before = { print: f.storage.inspect(KEY), purchase: f.storage.inspect(PKEY), counts: f.counts(), prints: f.store.listPrints(), inventory: f.store.listInventory() };
  assert.deepEqual(f.store.savePrint(input), { ok: false, error });
  assert.deepEqual(input, original);
  assert.deepEqual({ print: f.storage.inspect(KEY), purchase: f.storage.inspect(PKEY), prints: f.store.listPrints(), inventory: f.store.listInventory() },
    { print: before.print, purchase: before.purchase, prints: before.prints, inventory: before.inventory });
  assert.deepEqual(f.counts(), { idCalls: before.counts.idCalls + expectedAllocation.idCalls, clockCalls: before.counts.clockCalls + expectedAllocation.clockCalls });
}

test('explicit save, two purchased spools, completed/failed/internal and zero-gram failure; detached reload', () => {
  const f = setup(); const original = job();
  assert.deepEqual(f.store.listPrints(), { ok: true, records: [] });
  assert.equal(f.store.getPrint('missing').record, null);
  assert.deepEqual(inventory(f.store).map((s) => s.remainingGrams), [0.3, 0.3]);
  assert.deepEqual(f.storage.inspect(KEY), { raw: null, writes: 0 });
  assert.deepEqual(f.counts(), { idCalls: 0, clockCalls: 0 });
  const a = f.store.savePrint(original);
  assert.equal(a.ok, true);
  assert.equal(a.record.createdAt, '2025-03-01T12:00:00.000Z');
  assert.equal(a.record.purchaseId, 'buy1');
  assert.equal(a.record.cost.totalCost, 480);
  assert.equal(a.record.cost.breakdown.material, 100);
  for (const field of ['basePrice', 'finalPrice', 'revenue', 'commercialProfit']) assert.equal(field in a.record, false);
  assert.deepEqual(inventory(f.store).map((s) => s.remainingGrams), [0.2, 0.3]);
  assert.equal(f.store.savePrint(job('draft2', { spoolId: 's2', outcome: 'failed', purpose: 'internal', actualGrams: 0.2 })).ok, true);
  assert.deepEqual(inventory(f.store).map((s) => s.remainingGrams), [0.2, 0.1]);
  assert.equal(f.store.savePrint(job('draft3', { spoolId: 's2', outcome: 'failed', purpose: 'internal', actualGrams: 0 })).ok, true);
  assert.deepEqual(inventory(f.store).map((s) => s.remainingGrams), [0.2, 0.1]);
  assert.deepEqual(f.counts(), { idCalls: 3, clockCalls: 3 });
  assert.equal(f.storage.inspect(KEY).writes, 3);
  assert.equal(f.storage.inspect(PKEY).writes, 1);
  original.title = 'modificado'; a.record.cost.breakdown.material = 999;
  f.store.listPrints().records[0].title = 'modificado'; f.store.getPrint('job1').record.cost.totalCost = 0;
  assert.equal(f.store.getPrint('job1').record.title, 'Pieza');
  assert.equal(f.store.getPrint('job1').record.cost.totalCost, 480);
  const reopened = createPrintStore(f.storage, f.options);
  assert.deepEqual(reopened.listPrints(), f.store.listPrints());
  assert.deepEqual(reopened.listInventory(), f.store.listInventory());
  assert.equal(f.storage.inspect(KEY).writes, 3);
});

test('exact depletion and decimal equality work; genuine overdraw, unknown spool and overflow reject', () => {
  const f = setup();
  assert.equal(f.store.savePrint(job('one')).ok, true);
  assert.equal(f.store.savePrint(job('two', { actualGrams: 0.2 })).ok, true);
  assert.deepEqual(inventory(f.store).map((s) => s.remainingGrams), [0, 0.3]);
  refusal(f, job('three', { actualGrams: Number.MIN_VALUE }), 'Stock insuficiente en la bobina seleccionada.');
  refusal(f, job('four', { spoolId: 'unknown' }), 'Bobina adquirida no encontrada.');
  refusal(f, job('five', { actualGrams: 0.31 }), 'Stock insuficiente en la bobina seleccionada.');
  refusal(f, job('overflow', { actualGrams: Number.MAX_VALUE }), 'Resultado fuera del rango seguro de CLP.');
  assert.equal(f.store.savePrint(job('zero', { actualGrams: 0 })).ok, true);
});

test('submission token is idempotent; new submission may record identical job, duplicate factory ID rejects', () => {
  const f = setup(undefined, ['same', 'same', 'new']);
  assert.equal(f.store.savePrint(job()).ok, true);
  refusal(f, job(), 'Esta confirmación ya fue registrada.');
  refusal(f, job('another'), 'No se pudo generar un identificador único; intenta de nuevo.', { idCalls: 1, clockCalls: 0 });
  assert.equal(f.store.savePrint(job('fresh')).ok, true);
  assert.deepEqual(inventory(f.store).map((s) => s.remainingGrams), [0.1, 0.3]);
});

test('malformed saved timestamp, spoofed cost, unknown spool, duplicate identifiers and negative aggregate fail closed', () => {
  const valid = setup(); assert.equal(valid.store.savePrint(job()).ok, true);
  const record = JSON.parse(valid.storage.inspect(KEY).raw)[0];
  const invalid = [
    [{ ...record, createdAt: '2025-02-30T00:00:00.000Z' }],
    [{ ...record, createdAt: '2025-03-01T24:00:00.000Z' }],
    [{ ...record, cost: { ...record.cost, totalCost: 1 } }],
    [{ ...record, spoolId: 'fake' }],
    [record, record],
    [record, { ...record, id: 'other' }],
    [record, { ...record, submissionId: 'other' }],
    [record, { ...record, id: 'other', submissionId: 'different', actualGrams: 0.3, cost: { ...record.cost, breakdown: { ...record.cost.breakdown, material: 300 }, totalCost: 680 } }],
  ];
  for (const records of invalid) {
    const f = setup(); const raw = JSON.stringify(records); f.storage.external(KEY, raw);
    const store = createPrintStore(f.storage, f.options); f.store = store;
    assert.equal(store.error, 'Las impresiones de prueba no se pueden leer; no se modificaron sus datos.');
    assert.deepEqual(store.listPrints(), { ok: false, error: store.error });
    assert.deepEqual(store.listInventory(), { ok: false, error: store.error });
    assert.deepEqual(store.getPrint(record.id), { ok: false, error: store.error });
    refusal(f, job('new'), store.error);
  }
});

test('denied reads and writes, purchase source failure, and changed print key never fabricate stock or overwrite', () => {
  const f = setup(); f.storage.external(KEY, '{broken');
  const corrupt = createPrintStore(f.storage, f.options);
  assert.deepEqual(corrupt.savePrint(job()), { ok: false, error: corrupt.error });
  assert.deepEqual(f.storage.inspect(KEY), { raw: '{broken', writes: 0 });
  const denied = createPrintStore({ getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('unexpected'); } }, f.options);
  assert.deepEqual(denied.listInventory(), { ok: false, error: denied.error });
  const g = setup(); g.storage.external(KEY, 'other-tab');
  refusal(g, job(), 'Las impresiones cambiaron en otra pestaña; recarga antes de guardar.');
  const h = setup();
  const noWrite = createPrintStore({ getItem: (key) => h.storage.getItem(key), setItem: () => { throw Error('quota'); } }, h.options);
  h.store = noWrite;
  refusal(h, job(), 'No se pudo guardar en este navegador; la impresión no quedó registrada.', { idCalls: 1, clockCalls: 1 });
  const source = setup(); // purchased source must be read fresh, never reset to an empty catalog
  const brokenSource = { get error() { return 'Compra no disponible'; }, listSpools: () => { throw Error('must not read'); } };
  source.options.purchaseStore = brokenSource; source.store = createPrintStore(source.storage, source.options);
  assert.deepEqual(source.store.listInventory(), { ok: false, error: 'No se pueden leer las bobinas adquiridas; no se modificaron los datos.' });
  refusal(source, job(), 'No se pueden leer las bobinas adquiridas; no se modificaron los datos.');
  const throwing = setup(); throwing.options.purchaseStore = { error: null, listSpools: () => { throw Error('denied'); } };
  throwing.store = createPrintStore(throwing.storage, throwing.options);
  assert.deepEqual(throwing.store.listInventory(), { ok: false, error: 'No se pueden leer las bobinas adquiridas; no se modificaron los datos.' });
  const fresh = setup();
  fresh.storage.external(PKEY, '{broken');
  assert.deepEqual(fresh.store.listPrints(), { ok: false, error: 'No se pueden leer las bobinas adquiridas; no se modificaron los datos.' });
  assert.deepEqual(fresh.store.listInventory(), { ok: false, error: 'No se pueden leer las bobinas adquiridas; no se modificaron los datos.' });
  refusal(fresh, job(), 'No se pueden leer las bobinas adquiridas; no se modificaron los datos.');
});
