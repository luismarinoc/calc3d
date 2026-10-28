import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoHistory } from '../src/data/demo.mjs';
import { evaluate } from '../src/ui/quote.mjs';

const form = { title: 'Prueba', purpose: 'sale', spoolId: 'demo-petg', purchasePrice: '21900', netWeightGrams: '1000', grams: '50', hours: '1', minutes: '0', watts: '200', electricityPricePerKwh: '200', discountType: 'percent', surchargeType: 'percent' };
const quote = evaluate(form);
function fixture(initial = null) {
  let raw = initial;
  let writes = 0;
  let ids = 0;
  let clocks = 0;
  let reject = false;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => { if (reject) throw Error('quota'); raw = value; writes++; },
  };
  const history = () => createDemoHistory(storage, {
    id: () => `id-${++ids}`,
    now: () => { clocks++; return new Date('2025-03-01T12:00:00.000Z'); },
  });
  return { history, inspect: () => ({ raw, writes, ids, clocks }), change: (value) => { raw = value; }, fail: (value) => { reject = value; } };
}

test('optional customer fields normalize to detached text and persist through reload and copy', () => {
  const f = fixture();
  const h = f.history();
  const original = h.save(quote, { name: '  <Cliente>  ', phone: ' +56 9 1234-5678 ', email: '  A@Example.cl  ' });
  assert.equal(original.ok, true);
  assert.equal(original.record.number, 'COT-000001');
  assert.deepEqual(original.record.client, { name: '<Cliente>', phone: '+56 9 1234-5678', email: 'A@Example.cl' });
  original.record.client.name = 'mutated';
  assert.equal(h.get('id-1').client.name, '<Cliente>');
  const reloaded = f.history();
  assert.equal(reloaded.get('id-1').client.name, '<Cliente>');
  const copy = reloaded.save(quote, { ...reloaded.get('id-1').client, name: 'Otro' });
  assert.equal(copy.record.number, 'COT-000002');
  assert.equal(reloaded.get('id-1').client.name, '<Cliente>');
  assert.equal(reloaded.list()[0].client.name, 'Otro');
  assert.equal(f.inspect().writes, 2);
});

test('blank customer is optional for sale, internal and gift', () => {
  const f = fixture();
  const h = f.history();
  for (const purpose of ['sale', 'internal', 'gift']) {
    const candidate = evaluate({ ...form, purpose });
    assert.equal(candidate.error, null);
    const saved = h.save(candidate, { name: '  ', phone: '', email: '\t' });
    assert.equal(saved.ok, true);
    assert.deepEqual(saved.record.client, { name: '', phone: '', email: '' });
  }
  assert.deepEqual(h.list().map((item) => item.number), ['COT-000003', 'COT-000002', 'COT-000001']);
});

test('invalid supplied customer rejects without ID, clock, number, bytes or writes', () => {
  const f = fixture();
  const h = f.history();
  const before = f.inspect();
  for (const [client, error] of [
    [{ name: 'x'.repeat(121) }, 'Cliente o empresa debe tener 120 caracteres o menos.'],
    [{ phone: '12abc' }, 'Ingresa un teléfono válido (hasta 30 caracteres).'],
    [{ phone: '1'.repeat(31) }, 'Ingresa un teléfono válido (hasta 30 caracteres).'],
    [{ email: 'sin-arroba' }, 'Ingresa un correo válido (hasta 254 caracteres).'],
    [{ email: `${'a'.repeat(250)}@x.cl` }, 'Ingresa un correo válido (hasta 254 caracteres).'],
    [{ name: 12 }, 'Cliente o empresa debe ser texto.'],
  ]) {
    assert.deepEqual(h.save(quote, client), { ok: false, error });
    assert.deepEqual(f.inspect(), before);
    assert.deepEqual(h.list(), []);
  }
  assert.equal(h.save(quote).record.number, 'COT-000001');
});

test('existing unnumbered records stay unchanged, highest number survives reload', () => {
  const f = fixture();
  const first = f.history().save(quote).record;
  const legacy = { ...first, id: 'old' };
  delete legacy.number;
  delete legacy.client;
  f.change(JSON.stringify([legacy, { ...first, number: 'COT-000009' }]));
  const h = f.history();
  assert.equal(h.error, null);
  assert.deepEqual(h.get('old'), legacy);
  assert.equal(h.save(quote).record.number, 'COT-000010');
  assert.deepEqual(h.get('old'), legacy);
});

test('duplicate and malformed numbered histories are unreadable and never overwritten', () => {
  const seed = fixture().history().save(quote).record;
  for (const records of [
    [seed, { ...seed, id: 'other' }],
    [{ ...seed, number: 'COT-000000' }],
    [{ ...seed, number: 'COT-0000001' }],
    [{ ...seed, number: 'COT-9007199254740992' }],
  ]) {
    const f = fixture(JSON.stringify(records));
    const h = f.history();
    const before = f.inspect();
    assert.equal(h.error, 'El historial de prueba no se puede leer; no se modificaron sus datos.');
    assert.deepEqual(h.save(quote), { ok: false, error: h.error });
    assert.deepEqual(f.inspect(), before);
    assert.deepEqual(h.list(), []);
  }
});

test('failed write and known stale snapshot preserve bytes, counter and next number', () => {
  const f = fixture();
  const h = f.history();
  f.fail(true);
  assert.deepEqual(h.save(quote), { ok: false, error: 'No se pudo guardar en este navegador; el cálculo no quedó registrado.' });
  assert.deepEqual(f.inspect(), { raw: null, writes: 0, ids: 1, clocks: 1 });
  assert.deepEqual(h.list(), []);
  f.fail(false);
  assert.equal(h.save(quote).record.number, 'COT-000001');
  const stale = f.history();
  const current = f.history();
  assert.equal(current.save(quote).record.number, 'COT-000002');
  const before = f.inspect();
  assert.deepEqual(stale.save(quote), { ok: false, error: 'El historial cambió en otra pestaña; recarga la página antes de guardar.' });
  assert.deepEqual(f.inspect(), before);
  assert.equal(stale.list().length, 1);
  assert.equal(f.history().save(quote).record.number, 'COT-000003');
});
