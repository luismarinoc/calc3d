import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/ui/quote.mjs';
import { buildSpoolCatalog } from '../src/ui/spool-catalog.mjs';

const form = () => ({ title: 'Referencia', spoolId: 'demo-petg', purpose: 'sale', calculationMode: 'reference',
  purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0',
  watts: '130', electricityPricePerKwh: '230', replacementCost: '220000', replacementLifetimeHours: '4320',
  errorPercent: '5', multiplierPreset: '2', customMultiplier: '2', discountType: 'percent', discountValue: '0',
  surchargeType: 'percent', surchargeValue: '0' });

test('public form maps reference example, all presets, custom and independent adjustments', () => {
  const source = form();
  const before = structuredClone(source);
  const result = evaluate(source);
  assert.deepEqual(source, before);
  assert.equal(result.error, null);
  assert.deepEqual(Object.fromEntries(Object.entries(result.result.breakdown).map(([key, value]) => [key, value.toFixed(2)])), {
    material: '6468.00', electricity: '328.90', wear: '560.19', allowance: '367.85', maintenance: '0.00', labor: '0.00', extras: '0.00',
  });
  assert.equal(result.result.totalCost.toFixed(2), '7724.94');
  assert.equal(result.result.finalPrice.toFixed(2), '15449.88');
  for (const preset of ['2', '2.5', '3', '3.5', '4', '5']) {
    assert.equal(evaluate({ ...source, multiplierPreset: preset }).result.basePrice,
      Number((7724.939444444444 * Number(preset)).toFixed(2)));
  }
  const custom = evaluate({ ...source, multiplierPreset: 'custom', customMultiplier: '1.5',
    discountValue: '10', surchargeValue: '5' });
  assert.equal(custom.input.multiplier, 1.5);
  assert.equal(custom.result.discountAmount, Number((custom.result.basePrice * .1).toFixed(2)));
  assert.equal(custom.result.surchargeAmount, Number((custom.result.basePrice * .05).toFixed(2)));
  assert.equal(custom.result.finalPrice, Number((custom.result.basePrice - custom.result.discountAmount + custom.result.surchargeAmount).toFixed(2)));
});

test('invalid reference input, discount and floor fail without a result; internal has only expense', () => {
  for (const [change, message, field] of [
    [{ replacementLifetimeHours: '0' }, 'Vida útil de reposición debe ser un número mayor que cero.', 'replacementLifetimeHours'],
    [{ errorPercent: '-1' }, 'Imprevistos debe ser un número no negativo.', 'errorPercent'],
    [{ multiplierPreset: 'custom', customMultiplier: '0' }, 'El multiplicador debe ser un número mayor que cero.', 'customMultiplier'],
    [{ multiplierPreset: 'bad' }, 'Selecciona un multiplicador válido.', 'multiplierPreset'],
    [{ discountValue: '101' }, 'El descuento porcentual no puede superar 100%.', null],
    [{ multiplierPreset: 'custom', customMultiplier: '0.5' }, 'El precio final no puede ser menor al costo total (faltan 3862.47 CLP).', null],
  ]) {
    const result = evaluate({ ...form(), ...change });
    assert.equal(result.error, message);
    assert.equal(result.field, field);
    assert.equal(result.result, null);
  }
  const internal = evaluate({ ...form(), purpose: 'internal', multiplierPreset: 'custom', customMultiplier: '0' });
  assert.equal(internal.error, null);
  assert.equal(internal.result.internalCost, 7724.94);
  assert.equal(internal.result.finalPrice, 0);
  assert.equal(internal.result.commercialProfit, 0);
  assert.equal('multiplier' in internal.input, false);
});

test('reference internal form rejects explicit commercial adjustments without changing its input', () => {
  for (const change of [{ discountValue: '100' }, { surchargeValue: '1' }, { discountValue: '0.001' }]) {
    const source = { ...form(), purpose: 'internal', ...change };
    const before = structuredClone(source);
    const result = evaluate(source);
    assert.equal(result.error, 'El trabajo interno no admite descuentos ni recargos.');
    assert.equal(result.result, null);
    assert.equal(result.input, null);
    assert.deepEqual(source, before);
  }
  const legacy = { ...form(), calculationMode: 'legacy', purpose: 'internal', discountValue: '100', surchargeValue: '1' };
  assert.equal(evaluate(legacy).error, null);
  assert.equal(evaluate(legacy).result.finalPrice, 0);
});

test('omitted mode stays legacy, including integer costs, internal and purchased identities', () => {
  const legacy = form();
  for (const name of ['calculationMode', 'replacementCost', 'replacementLifetimeHours', 'errorPercent', 'multiplierPreset', 'customMultiplier']) delete legacy[name];
  legacy.markupPercent = '35';
  const result = evaluate(legacy);
  assert.equal(result.error, null);
  assert.equal(result.result.totalCost, 6797);
  assert.equal(result.result.finalPrice, 9176);
  assert.equal('replacementCost' in result.input, false);
  const purchased = buildSpoolCatalog([{ id: 'sp-1', purchaseId: 'p-1', date: '2025-02-28', material: 'PLA', brand: 'Sur', color: 'Azul', purchasePrice: 22000, netWeightGrams: 1000 }]);
  assert.equal(evaluate({ ...legacy, spoolId: 'purchase:sp-1' }, purchased).spoolId, 'purchase:sp-1');
  assert.equal(evaluate({ ...legacy, spoolId: 'purchase:missing' }, purchased).error, 'Selecciona una bobina de prueba.');
  assert.equal(evaluate({ ...legacy, purpose: 'internal' }).result.finalPrice, 0);
});
