import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from '../src/domain/costs.mjs';

const input = () => ({
  purpose: 'sale',
  spool: { purchasePrice: 20000, netWeightGrams: 1000 },
  grams: 50,
  hours: 1,
  minutes: 30,
  watts: 200,
  electricityPricePerKwh: 200,
});

function unchanged(candidate, check) {
  const before = structuredClone(candidate);
  check();
  assert.deepEqual(candidate, before);
}

function rejects(candidate, message) {
  unchanged(candidate, () => assert.throws(() => calculateQuote(candidate), { message }));
}

test('selected spool cost uses total consumed grams including supports, independent of remaining stock', () => {
  const candidate = { ...input(), spool: { ...input().spool, remainingGrams: 1 }, grams: 75 };
  unchanged(candidate, () => {
    const result = calculateQuote(candidate);
    assert.equal(result.breakdown.material, 1500);
    assert.equal(result.totalCost, 1560);
    assert.equal(result.basePrice, 1560);
    assert.equal(result.finalPrice, 1560);
    assert.equal(result.commercialProfit, 0);
  });
});

test('hours and minutes determine electricity and hourly expenses', () => {
  const candidate = { ...input(), depreciationPerHour: 100, maintenancePerHour: 20 };
  unchanged(candidate, () => {
    const r = calculateQuote(candidate);
    assert.deepEqual(r.breakdown, { material: 1000, electricity: 60, depreciation: 150, maintenance: 30, labor: 0, extras: 0 });
    assert.equal(r.totalCost, 1240);
  });
});

test('configured costs sum, with integer CLP rounding and optional zero defaults', () => {
  const candidate = { ...input(), laborMinutes: 30, laborRatePerHour: 1200, extraProductionCost: 21, markupPercent: 50 };
  unchanged(candidate, () => {
    const r = calculateQuote(candidate);
    assert.deepEqual(r.breakdown, { material: 1000, electricity: 60, depreciation: 0, maintenance: 0, labor: 600, extras: 21 });
    assert.equal(r.totalCost, 1681);
    assert.equal(r.basePrice, 2522);
    assert.equal(r.finalPrice, 2522);
    assert.equal(r.commercialProfit, 841);
    assert.equal(r.internalCost, 0);
  });
});

test('simultaneous percentages independently use original marked-up base', () => {
  const candidate = { ...input(), markupPercent: 100, discount: { type: 'percent', value: 25 }, surcharge: { type: 'percent', value: 10 } };
  unchanged(candidate, () => {
    const r = calculateQuote(candidate);
    assert.equal(r.totalCost, 1060);
    assert.equal(r.basePrice, 2120);
    assert.equal(r.discountAmount, 530);
    assert.equal(r.surchargeAmount, 212);
    assert.equal(r.finalPrice, 1802);
    assert.equal(r.commercialProfit, 742);
  });
});

test('fixed and percentage adjustments coexist without compounding', () => {
  const candidate = { ...input(), markupPercent: 100, discount: { type: 'amount', value: 250 }, surcharge: { type: 'percent', value: 10 } };
  unchanged(candidate, () => {
    const r = calculateQuote(candidate);
    assert.equal(r.discountAmount, 250);
    assert.equal(r.surchargeAmount, 212);
    assert.equal(r.finalPrice, 2082);
  });
});

test('sale floor permits equality but rejects below cost, even with surcharge', () => {
  const equal = { ...input(), discount: { type: 'percent', value: 10 }, surcharge: { type: 'percent', value: 10 } };
  unchanged(equal, () => assert.equal(calculateQuote(equal).finalPrice, 1060));
  rejects({ ...input(), discount: { type: 'amount', value: 1 } }, 'El precio final no puede ser menor al costo total (faltan 1 CLP).');
  rejects({ ...input(), discount: { type: 'percent', value: 100 }, surcharge: { type: 'amount', value: 1059 } }, 'El precio final no puede ser menor al costo total (faltan 1 CLP).');
});

test('internal work shows expense without revenue or profit and ignores markup', () => {
  const candidate = { ...input(), purpose: 'internal', markupPercent: 90 };
  unchanged(candidate, () => {
    const r = calculateQuote(candidate);
    assert.equal(r.totalCost, 1060);
    assert.equal(r.internalCost, 1060);
    assert.equal(r.basePrice, 0);
    assert.equal(r.finalPrice, 0);
    assert.equal(r.commercialProfit, 0);
    assert.equal(r.discountAmount, 0);
    assert.equal(r.surchargeAmount, 0);
  });
  rejects({ ...candidate, discount: { type: 'amount', value: 1 } }, 'El trabajo interno no admite descuentos ni recargos.');
  rejects({ ...candidate, surcharge: { type: 'percent', value: 1 } }, 'El trabajo interno no admite descuentos ni recargos.');
});

test('required fields, purpose, duration and numeric boundaries reject invalid inputs', () => {
  rejects({ ...input(), purpose: 'family' }, 'Propósito inválido: use sale o internal.');
  rejects({ ...input(), grams: -1 }, 'grams debe ser un número finito no negativo.');
  rejects({ ...input(), hours: 1.5 }, 'hours debe ser un entero no negativo.');
  rejects({ ...input(), minutes: 60 }, 'minutes debe ser un entero entre 0 y 59.');
  rejects({ ...input(), spool: { purchasePrice: 20, netWeightGrams: 0 } }, 'spool.netWeightGrams debe ser un número finito mayor que cero.');
  rejects({ ...input(), watts: '200' }, 'watts debe ser un número finito no negativo.');
  rejects({ ...input(), electricityPricePerKwh: Infinity }, 'electricityPricePerKwh debe ser un número finito no negativo.');
  rejects({ ...input(), laborMinutes: -1 }, 'laborMinutes debe ser un número finito no negativo.');
  rejects({ ...input(), extraProductionCost: NaN }, 'extraProductionCost debe ser un número finito no negativo.');
  rejects({ ...input(), markupPercent: -1 }, 'markupPercent debe ser un número finito no negativo.');
});

test('adjustment types, limits and arithmetic overflow reject invalid inputs', () => {
  rejects({ ...input(), discount: { type: 'ratio', value: 1 } }, 'discount.type debe ser amount o percent.');
  rejects({ ...input(), surcharge: { type: 'percent', value: '10' } }, 'surcharge.value debe ser un número finito no negativo.');
  rejects({ ...input(), discount: { type: 'percent', value: 101 } }, 'El descuento porcentual no puede superar 100%.');
  rejects({ ...input(), discount: { type: 'amount', value: 1061 } }, 'El descuento no puede superar el precio base.');
  rejects({ ...input(), grams: Number.MAX_VALUE }, 'Resultado fuera del rango seguro de CLP.');
  rejects({ ...input(), markupPercent: Number.MAX_VALUE }, 'Resultado fuera del rango seguro de CLP.');
});
