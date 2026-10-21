import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/ui/quote.mjs';
import { calculateReferenceQuote } from '../src/domain/reference-costs.mjs';
import { createDemoHistory } from '../src/data/demo.mjs';

const form = (mode = 'reference') => ({ title: 'Regalo', spoolId: 'demo-petg', purpose: 'sale', calculationMode: mode,
  purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0', watts: '130', electricityPricePerKwh: '230',
  depreciationPerHour: '0', maintenancePerHour: '0', laborMinutes: '0', laborRatePerHour: '0', extraProductionCost: '0',
  replacementCost: '220000', replacementLifetimeHours: '4320', errorPercent: '5', markupPercent: '35', multiplierPreset: '2',
  discountType: 'percent', discountValue: '0', surchargeType: 'percent', surchargeValue: '0' });
const optional = ['hours', 'minutes', 'depreciationPerHour', 'maintenancePerHour', 'laborMinutes', 'laborRatePerHour', 'extraProductionCost', 'markupPercent', 'discountValue', 'surchargeValue', 'replacementCost', 'errorPercent'];

test('S1 optional blanks map to explicit zeros in both modes; malformed and required blanks still fail', () => {
  for (const mode of ['reference', 'legacy']) {
    const explicit = form(mode);
    for (const key of optional) explicit[key] = '0';
    const blank = structuredClone(explicit);
    for (const key of optional) blank[key] = '  ';
    const snapshot = structuredClone(blank);
    const actual = evaluate(blank);
    assert.deepEqual(blank, snapshot);
    assert.equal(actual.error, null);
    assert.deepEqual(actual.input, evaluate(explicit).input);
    assert.deepEqual(actual.result, evaluate(explicit).result);
    for (const [key, value, error] of [
      ['grams', '', 'Ingresa un valor para Gramos consumidos.'], ['purchasePrice', '', 'Ingresa un valor para Precio de compra.'],
      ['netWeightGrams', '', 'Ingresa un valor para Peso neto.'], ['watts', '', 'Ingresa un valor para Potencia estimada.'],
      ['electricityPricePerKwh', '', 'Ingresa un valor para Tarifa eléctrica.'],
      ['minutes', '60', 'Los minutos deben estar entre 0 y 59.'], ['hours', '1.5', 'Las horas deben ser un entero no negativo.'],
      ['discountValue', '-1', 'Descuento debe ser un número no negativo.'], ['extraProductionCost', 'NaN', 'Otros costos de producción debe ser un número no negativo.'],
    ]) {
      const source = { ...explicit, [key]: value };
      const before = structuredClone(source);
      const failure = evaluate(source);
      assert.equal(failure.error, error);
      assert.equal(failure.input, null);
      assert.equal(failure.result, null);
      assert.deepEqual(source, before);
    }
  }
  for (const [key, error] of [['replacementLifetimeHours', 'Ingresa un valor para Vida útil de reposición.'], ['customMultiplier', 'El multiplicador debe ser un número mayor que cero.']]) {
    const source = { ...form(), ...(key === 'customMultiplier' ? { multiplierPreset: 'custom' } : {}), [key]: '' };
    assert.equal(evaluate(source).error, error);
  }
});

test('S2 reference gift is a cost-only purpose; positive adjustments rejected in domain and mapper', () => {
  const source = { ...form(), purpose: 'gift' };
  const before = structuredClone(source);
  const quote = evaluate(source);
  assert.deepEqual(source, before);
  assert.equal(quote.error, null);
  assert.equal(quote.input.purpose, 'gift');
  assert.equal(quote.result.totalCost, 7724.94);
  assert.equal(quote.result.giftCost, 7724.94);
  assert.equal(quote.result.finalPrice, 0);
  assert.equal(quote.result.commercialProfit, 0);
  assert.equal(evaluate(form()).result.finalPrice, 15449.88);
  for (const key of ['discountValue', 'surchargeValue']) {
    const rejected = evaluate({ ...source, [key]: '0.001' });
    assert.equal(rejected.error, 'El regalo no admite descuentos ni recargos.');
    assert.equal(rejected.result, null);
    assert.throws(() => calculateReferenceQuote({ ...quote.input, discount: { type: 'percent', value: 0.001 } }), { message: 'El regalo no admite descuentos ni recargos.' });
  }
});

test('S2 legacy gift keeps legacy production cost, and explicit save/reload preserves old bytes and rejects invalid saves without side effects', () => {
  let raw = null, writes = 0, ids = 0, clocks = 0;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; writes++; } };
  const options = { id: () => `id-${++ids}`, now: () => { clocks++; return new Date('2025-03-01T00:00:00Z'); } };
  const history = createDemoHistory(storage, options);
  const old = history.save(evaluate(form('legacy')));
  assert.equal(old.ok, true);
  const oldBytes = raw;
  const legacy = evaluate({ ...form('legacy'), purpose: 'gift' });
  assert.equal(legacy.error, null);
  assert.equal(legacy.result.totalCost, evaluate({ ...form('legacy'), purpose: 'internal' }).result.totalCost);
  assert.equal(legacy.result.giftCost, legacy.result.totalCost);
  assert.equal(legacy.result.finalPrice, 0);
  assert.equal(legacy.result.commercialProfit, 0);
  const rejected = history.save(evaluate({ ...form(), purpose: 'gift', grams: '' }));
  assert.deepEqual(rejected, { ok: false, error: 'No se puede guardar un cálculo inválido.' });
  assert.equal(raw, oldBytes);
  assert.deepEqual([writes, ids, clocks], [1, 1, 1]);
  const forged = { ...legacy, result: { ...legacy.result, finalPrice: 1 } };
  assert.deepEqual(history.save(forged), { ok: false, error: 'No se puede guardar un cálculo inválido.' });
  assert.equal(raw, oldBytes);
  assert.deepEqual([writes, ids, clocks], [1, 1, 1]);
  const gift = history.save(legacy);
  assert.equal(gift.ok, true);
  assert.equal(gift.record.form.purpose, 'gift');
  assert.equal(gift.record.input.purpose, 'gift');
  const reloaded = createDemoHistory(storage, options);
  assert.equal(reloaded.error, null);
  assert.deepEqual(reloaded.get(gift.record.id), gift.record);
  assert.deepEqual(reloaded.list()[1], old.record);
  assert.equal(JSON.stringify(JSON.parse(raw)[1]), JSON.stringify(JSON.parse(oldBytes)[0]));
});
