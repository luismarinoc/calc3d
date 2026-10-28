import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchaseStore } from '../src/data/purchases.mjs';

const KEY = 'calc3d.demo.purchases.v1';
const purchase = () => ({ date: '2024-02-29', supplier: { name: 'Taller', address: 'Santiago', phone: '123' }, notes: 'Prueba', lines: [
  { material: 'PLA', brand: 'Uno', color: 'Rojo', quantity: 2, netWeightGrams: 750, purchasePrice: 12000 },
  { material: 'PETG', brand: 'Dos', color: 'Azul', quantity: 1, netWeightGrams: 900, purchasePrice: 15000 },
] });
function memory(raw = null) {
  let writes = 0;
  return { getItem: (key) => { assert.equal(key, KEY); return raw; }, setItem: (key, value) => { assert.equal(key, KEY); raw = value; writes++; }, inspect: () => ({ raw, writes }), external: (value) => { raw = value; } };
}
function fixture(storage, ids = ['p1', 's1', 's2', 's3']) {
  let calls = 0, clocks = 0;
  const store = createPurchaseStore(storage, { id: () => { calls++; return ids.shift(); }, now: () => { clocks++; return new Date('2025-03-01T12:00:00.000Z'); } });
  return { store, counts: () => ({ calls, clocks }) };
}

test('only explicit save writes; multiple lines create individual detached spool snapshots and reload', () => {
  const storage = memory();
  const { store, counts } = fixture(storage);
  const original = purchase();
  assert.deepEqual(store.listPurchases(), []);
  assert.deepEqual(store.listSpools(), []);
  assert.deepEqual(counts(), { calls: 0, clocks: 0 });
  assert.deepEqual(storage.inspect(), { raw: null, writes: 0 });
  const saved = store.savePurchase(original);
  assert.equal(saved.ok, true);
  assert.equal(saved.record.id, 'p1');
  assert.equal(saved.record.createdAt, '2025-03-01T12:00:00.000Z');
  assert.equal(saved.record.date, '2024-02-29');
  assert.deepEqual(saved.record.supplier, original.supplier);
  assert.equal(saved.record.notes, 'Prueba');
  assert.deepEqual(saved.record.lines, original.lines);
  assert.equal(saved.record.total, 39000);
  assert.equal(saved.record.spoolCount, 3);
  assert.deepEqual(store.listSpools(), ['s1', 's2', 's3'].map((id, index) => ({ id, purchaseId: 'p1', date: original.date, supplier: original.supplier, material: original.lines[index === 2 ? 1 : 0].material, brand: original.lines[index === 2 ? 1 : 0].brand, color: original.lines[index === 2 ? 1 : 0].color, purchasePrice: index === 2 ? 15000 : 12000, netWeightGrams: index === 2 ? 900 : 750, remainingGrams: index === 2 ? 900 : 750 })));
  assert.deepEqual(counts(), { calls: 4, clocks: 1 });
  assert.equal(storage.inspect().writes, 1);
  original.lines[0].color = 'editado';
  saved.record.lines[0].color = 'editado';
  store.listPurchases()[0].supplier.name = 'editado';
  store.getPurchase('p1').lines[0].color = 'editado';
  store.listSpools()[0].remainingGrams = 0;
  assert.equal(store.getPurchase('p1').lines[0].color, 'Rojo');
  assert.equal(store.listSpools()[0].remainingGrams, 750);
  const reopened = createPurchaseStore(storage);
  assert.deepEqual(reopened.listPurchases(), store.listPurchases());
  assert.deepEqual(reopened.listSpools(), store.listSpools());
  assert.equal(reopened.getPurchase('missing'), null);
  assert.equal(storage.inspect().writes, 1);
});

test('rejected inputs and duplicate generated identifiers never write or advance public state', () => {
  const storage = memory();
  const { store, counts } = fixture(storage, ['same', 'same']);
  const invalid = store.savePurchase({ ...purchase(), date: '2023-02-29' });
  assert.deepEqual(invalid, { ok: false, error: 'Fecha de compra inválida (YYYY-MM-DD).' });
  assert.deepEqual(counts(), { calls: 0, clocks: 0 });
  assert.deepEqual(store.savePurchase(purchase()), { ok: false, error: 'No se pudo generar un identificador único; intenta de nuevo.' });
  assert.deepEqual(store.listPurchases(), []);
  assert.deepEqual(store.listSpools(), []);
  assert.deepEqual(storage.inspect(), { raw: null, writes: 0 });
});

test('duplicate across saved records and failed setItem never claim stock', () => {
  const storage = memory();
  const { store } = fixture(storage, ['p1', 's1', 's2', 's3', 'p2', 's1']);
  assert.equal(store.savePurchase(purchase()).ok, true);
  const before = storage.inspect();
  assert.deepEqual(store.savePurchase(purchase()), { ok: false, error: 'No se pudo generar un identificador único; intenta de nuevo.' });
  assert.deepEqual(storage.inspect(), before);
  assert.equal(store.listSpools().length, 3);
  const denied = { getItem: storage.getItem, setItem: () => { throw Error('quota'); } };
  const other = fixture(denied, ['p2', 's4', 's5', 's6']).store;
  assert.deepEqual(other.savePurchase(purchase()), { ok: false, error: 'No se pudo guardar en este navegador; la compra no quedó registrada.' });
  assert.equal(other.listPurchases().length, 1);
  assert.equal(other.listSpools().length, 3);
  assert.deepEqual(storage.inspect(), before);
});

test('corrupt/unavailable storage and changed key cannot be overwritten', () => {
  const validStorage = memory();
  fixture(validStorage).store.savePurchase(purchase());
  const tampered = JSON.parse(validStorage.inspect().raw);
  tampered[0].spools[0].remainingGrams = -1;
  for (const raw of ['{bad', JSON.stringify([{ id: 'fake', date: '2024-01-01', total: -1 }]), JSON.stringify(tampered)]) {
    const storage = memory(raw);
    const { store } = fixture(storage);
    assert.equal(store.error, 'Las compras de prueba no se pueden leer; no se modificaron sus datos.');
    assert.deepEqual(store.listPurchases(), []);
    assert.deepEqual(store.savePurchase(purchase()), { ok: false, error: store.error });
    assert.deepEqual(storage.inspect(), { raw, writes: 0 });
  }
  const unavailable = createPurchaseStore({ getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('should not write'); } });
  assert.deepEqual(unavailable.savePurchase(purchase()), { ok: false, error: unavailable.error });
  const storage = memory();
  const { store, counts } = fixture(storage);
  storage.external('other-tab');
  assert.deepEqual(store.savePurchase(purchase()), { ok: false, error: 'Las compras cambiaron en otra pestaña; recarga antes de guardar.' });
  assert.deepEqual(storage.inspect(), { raw: 'other-tab', writes: 0 });
  assert.deepEqual(counts(), { calls: 0, clocks: 0 });
  assert.deepEqual(store.listPurchases(), []);
});

test('impossible stored creation timestamps block reads and saves without changing data or counters', () => {
  for (const timestamp of ['2025-02-30T00:00:00.000Z', '2025-02-29T00:00:00.000Z', '2025-03-01T24:00:00.000Z', '2025-13-01T00:00:00.000Z']) {
    const storage = memory();
    assert.equal(fixture(storage).store.savePurchase(purchase()).ok, true);
    const records = JSON.parse(storage.inspect().raw);
    records[0].createdAt = timestamp;
    const raw = JSON.stringify(records);
    storage.external(raw);
    const { store, counts } = fixture(storage);
    const error = 'Las compras de prueba no se pueden leer; no se modificaron sus datos.';
    const input = purchase();
    const original = structuredClone(input);
    assert.equal(store.error, error, timestamp);
    assert.deepEqual(store.listPurchases(), []);
    assert.deepEqual(store.listSpools(), []);
    assert.deepEqual(store.savePurchase(input), { ok: false, error });
    assert.deepEqual(input, original);
    assert.deepEqual(storage.inspect(), { raw, writes: 1 });
    assert.deepEqual(counts(), { calls: 0, clocks: 0 });
  }
});
