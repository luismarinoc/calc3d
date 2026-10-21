import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrinterSettingsStore } from '../src/data/printer-settings.mjs';

const KEY = 'calc3d.printer.settings.v1';
const printer = (name, modelId = 'p2s') => ({ name, modelId, watts: 130,
  electricityPricePerKwh: 215, replacementCost: 220000, replacementLifetimeHours: 4320 });
function memory(initial = null) {
  let raw = initial;
  let writes = 0;
  let ids = 0;
  const storage = {
    getItem(key) { assert.equal(key, KEY); return raw; },
    setItem(key, value) { assert.equal(key, KEY); raw = value; writes++; },
  };
  return { storage, inspect: () => ({ raw, writes, ids }), id: () => `unique-${++ids}`,
    external(value) { raw = value; } };
}

const demo = { id: 'demo-printer-p2s', name: 'Bambu Lab P2S (de ejemplo)', ...printer('Bambu Lab P2S (de ejemplo)') };

test('absent key exposes labelled demo without writing; create two physical printers of same model and switch active without losing either', () => {
  const mem = memory();
  const store = createPrinterSettingsStore(mem.storage, { id: mem.id });
  assert.equal(store.error, null);
  assert.deepEqual(store.snapshot(), { activeId: demo.id, printers: [demo] });
  assert.deepEqual(mem.inspect(), { raw: null, writes: 0, ids: 0 });
  const a = store.createPrinter(printer('Equipo A'));
  assert.deepEqual(a, { ok: true, printer: { id: 'printer-unique-1', ...printer('Equipo A') } });
  assert.deepEqual(mem.inspect(), { raw: JSON.stringify(store.snapshot()), writes: 1, ids: 1 });
  const b = store.createPrinter(printer('Equipo B'));
  assert.deepEqual(b, { ok: true, printer: { id: 'printer-unique-2', ...printer('Equipo B') } });
  assert.equal(store.snapshot().activeId, demo.id);
  assert.equal(store.activatePrinter(a.printer.id).ok, true);
  assert.equal(store.snapshot().activeId, a.printer.id);
  assert.equal(store.activatePrinter(b.printer.id).ok, true);
  assert.deepEqual(store.snapshot().printers, [demo, a.printer, b.printer]);
  assert.equal(store.snapshot().activeId, b.printer.id);
  assert.deepEqual(createPrinterSettingsStore(mem.storage).snapshot(), store.snapshot());
  assert.equal(mem.inspect().writes, 4);
});

test('updates replace only selected printer settings and never mutate previously returned snapshots', () => {
  const mem = memory();
  const store = createPrinterSettingsStore(mem.storage, { id: mem.id });
  const a = store.createPrinter(printer('A')).printer;
  const b = store.createPrinter(printer('B', 'custom')).printer;
  const earlier = store.snapshot();
  const changed = { ...printer('B revised', 'custom'), watts: 200, electricityPricePerKwh: 217.5, replacementCost: 1000, replacementLifetimeHours: 2000 };
  assert.deepEqual(store.updatePrinter(b.id, changed), { ok: true, printer: { id: b.id, ...changed } });
  assert.deepEqual(earlier.printers, [demo, a, b]);
  const detached = store.snapshot();
  detached.printers[2].watts = 1;
  detached.printers.push(printer('Intruder'));
  assert.deepEqual(store.snapshot().printers, [demo, a, { id: b.id, ...changed }]);
  assert.equal(store.snapshot().activeId, demo.id);
  assert.equal(mem.inspect().writes, 3);
});

test('invalid required fields, numeric bounds, unknown active or update ID and repeated generated ID reject without writes or ID advancement', () => {
  const mem = memory();
  const store = createPrinterSettingsStore(mem.storage, { id: mem.id });
  const invalid = [
    { name: '   ' }, { name: 'x'.repeat(121) }, { modelId: '' }, { modelId: 'x'.repeat(121) },
    { modelId: 'bad\nmodel' }, { watts: '' }, { watts: '130' }, { watts: -1 },
    { watts: Infinity }, { watts: Number.MAX_VALUE }, { electricityPricePerKwh: NaN },
    { electricityPricePerKwh: -1 }, { replacementCost: 1.1 }, { replacementCost: Number.MAX_SAFE_INTEGER + 1 },
    { replacementLifetimeHours: 0 }, { replacementLifetimeHours: -1 },
    { replacementLifetimeHours: Infinity }, { replacementLifetimeHours: Number.MAX_VALUE },
  ];
  for (const patch of invalid) {
    const before = store.snapshot();
    const count = mem.inspect();
    const result = store.createPrinter({ ...printer('Valid'), ...patch });
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(typeof result.error, 'string');
    assert.deepEqual(store.snapshot(), before);
    assert.deepEqual(mem.inspect(), count);
  }
  assert.deepEqual(store.activatePrinter('missing'), { ok: false, error: 'Impresora desconocida.' });
  assert.deepEqual(store.updatePrinter('missing', printer('Valid')), { ok: false, error: 'Impresora desconocida.' });
  assert.deepEqual(mem.inspect(), { raw: null, writes: 0, ids: 0 });
  const created = store.createPrinter(printer('Valid'));
  assert.equal(created.ok, true);
  const before = store.snapshot();
  const count = mem.inspect();
  const rejectedUpdate = store.updatePrinter(created.printer.id, { ...printer('Valid'), watts: NaN });
  assert.equal(rejectedUpdate.ok, false);
  assert.equal(typeof rejectedUpdate.error, 'string');
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(mem.inspect(), count);
  assert.equal(store.createPrinter(printer('Duplicate')).ok, true);
  const duplicate = createPrinterSettingsStore(mem.storage, { id: () => 'unique-1' });
  const snapshot = duplicate.snapshot();
  const raw = mem.inspect();
  assert.deepEqual(duplicate.createPrinter(printer('Duplicate')), { ok: false, error: 'No se pudo generar un identificador único; intenta de nuevo.' });
  assert.deepEqual(duplicate.snapshot(), snapshot);
  assert.deepEqual(mem.inspect(), raw);
  assert.deepEqual(before.printers, [demo, created.printer]);
  assert.equal(count.ids, 1);
});

test('corrupt, duplicate, orphaned-active and denied storage reads fail closed, never showing demo or writing', () => {
  for (const raw of ['{bad', '{}', JSON.stringify({ activeId: 'lost', printers: [demo] }),
    JSON.stringify({ activeId: demo.id, printers: [demo, demo] }),
    JSON.stringify({ activeId: demo.id, printers: [{ ...demo, watts: -1 }] })]) {
    const mem = memory(raw);
    const store = createPrinterSettingsStore(mem.storage, { id: mem.id });
    assert.equal(typeof store.error, 'string');
    assert.equal(store.snapshot(), null);
    assert.deepEqual(store.createPrinter(printer('A')), { ok: false, error: store.error });
    assert.deepEqual(store.updatePrinter(demo.id, printer('A')), { ok: false, error: store.error });
    assert.deepEqual(store.activatePrinter(demo.id), { ok: false, error: store.error });
    assert.deepEqual(mem.inspect(), { raw, writes: 0, ids: 0 });
  }
  const denied = createPrinterSettingsStore({ getItem() { throw Error('denied'); }, setItem() { throw Error('unexpected'); } });
  assert.equal(denied.snapshot(), null);
  assert.deepEqual(denied.activatePrinter(demo.id), { ok: false, error: denied.error });
});

test('failed writes and stale key guard leave public state and saved bytes unchanged on create/update/activate', () => {
  const mem = memory();
  const store = createPrinterSettingsStore(mem.storage, { id: mem.id });
  const a = store.createPrinter(printer('A')).printer;
  const baseline = store.snapshot();
  const prior = mem.inspect();
  mem.external('external-change');
  for (const result of [store.createPrinter(printer('B')),
    store.updatePrinter(a.id, printer('Changed')), store.activatePrinter(a.id)]) {
    assert.deepEqual(result, { ok: false, error: 'La configuración de impresoras cambió en otra pestaña; recarga antes de guardar.' });
  }
  assert.deepEqual(store.snapshot(), baseline);
  assert.deepEqual(mem.inspect(), { ...prior, raw: 'external-change' });

  let raw = null;
  let writes = 0;
  const failed = createPrinterSettingsStore({ getItem: () => raw, setItem: () => { writes++; throw Error('quota'); } }, { id: () => 'candidate' });
  const initial = failed.snapshot();
  for (const result of [failed.createPrinter(printer('B')),
    failed.updatePrinter(demo.id, printer('Changed')), failed.activatePrinter(demo.id)]) {
    assert.deepEqual(result, { ok: false, error: 'No se pudo guardar la configuración de impresoras en este navegador.' });
  }
  assert.deepEqual(failed.snapshot(), initial);
  assert.equal(raw, null);
  assert.equal(writes, 3);
});
