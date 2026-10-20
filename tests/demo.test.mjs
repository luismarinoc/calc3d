import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoHistory } from '../src/data/demo.mjs';
import { evaluate } from '../src/ui/quote.mjs';

const form = { title: 'Prueba', purpose: 'internal', spoolId: 'demo-petg', purchasePrice: '21900', netWeightGrams: '1000', grams: '50', hours: '1', minutes: '0', watts: '200', electricityPricePerKwh: '200' };
const memory = (initial = null) => {
  let raw = initial;
  let writes = 0;
  return { getItem: () => raw, setItem: (_, value) => { raw = value; writes++; }, inspect: () => ({ raw, writes }) };
};

test('evaluation and edits do not persist; explicit save snapshots independently and reopen does not overwrite', () => {
  const storage = memory();
  const history = createDemoHistory(storage, { now: () => new Date('2025-03-01T12:00:00.000Z'), id: () => 'unique-1' });
  const candidate = evaluate(form);
  assert.deepEqual(history.list(), []);
  assert.equal(storage.inspect().writes, 0);
  const saved = history.save(candidate);
  assert.equal(saved.ok, true);
  assert.equal(saved.record.savedAt, '2025-03-01T12:00:00.000Z');
  assert.equal(saved.record.spoolId, 'demo-petg');
  assert.equal(storage.inspect().writes, 1);
  const edited = evaluate({ ...form, grams: '300', purchasePrice: '50000' });
  assert.equal(edited.error, null);
  assert.equal(history.list()[0].result.totalCost, candidate.result.totalCost);
  assert.equal(history.get('unique-1').input.grams, 50);
  assert.equal(storage.inspect().writes, 1);
  assert.deepEqual(history.get('unique-1'), saved.record);
});

test('rejected or invalid save leaves stored data and write count unchanged', () => {
  const storage = memory();
  const history = createDemoHistory(storage);
  const failure = history.save(evaluate({ ...form, grams: '' }));
  assert.deepEqual(failure, { ok: false, error: 'No se puede guardar un cálculo inválido.' });
  assert.deepEqual(storage.inspect(), { raw: null, writes: 0 });
});

test('corrupt storage is not overwritten; unavailable reads and failed writes do not claim saving', () => {
  const corrupt = memory('{bad');
  const history = createDemoHistory(corrupt);
  assert.equal(history.list().length, 0);
  assert.equal(history.error, 'El historial de prueba no se puede leer; no se modificaron sus datos.');
  assert.equal(history.save(evaluate(form)).ok, false);
  assert.deepEqual(corrupt.inspect(), { raw: '{bad', writes: 0 });
  const unavailable = createDemoHistory({ getItem: () => { throw Error('denied'); }, setItem: () => {} });
  assert.equal(unavailable.save(evaluate(form)).ok, false);
  const fail = createDemoHistory({ getItem: () => null, setItem: () => { throw Error('quota'); } });
  assert.deepEqual(fail.save(evaluate(form)), { ok: false, error: 'No se pudo guardar en este navegador; el cálculo no quedó registrado.' });
  assert.deepEqual(fail.list(), []);
});
