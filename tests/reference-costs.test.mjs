import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReferenceQuote } from '../src/domain/reference-costs.mjs';

const example = () => ({ purpose: 'sale', spool: { purchasePrice: 22000, netWeightGrams: 1000 }, grams: 294,
  hours: 11, minutes: 0, watts: 130, electricityPricePerKwh: 230,
  replacementCost: 220000, replacementLifetimeHours: 4320, errorPercent: 5, multiplier: 2 });

test('reference example preserves intermediate precision, including sale from unrounded cost', () => {
  const input = example();
  const before = structuredClone(input);
  const result = calculateReferenceQuote(input);
  assert.deepEqual(input, before);
  assert.deepEqual(Object.fromEntries(Object.entries(result.breakdown).map(([key, value]) => [key, value.toFixed(2)])), {
    material: '6468.00', electricity: '328.90', wear: '560.19', allowance: '367.85', maintenance: '0.00', labor: '0.00', extras: '0.00',
  });
  assert.equal(result.totalCost.toFixed(2), '7724.94');
  assert.equal(result.basePrice.toFixed(2), '15449.88');
  assert.equal(result.finalPrice.toFixed(2), '15449.88');
  assert.equal(result.commercialProfit.toFixed(2), '7724.94');
  assert.equal(result.internalCost, 0);
  assert.equal(result.discountAmount, 0);
  assert.equal(result.surchargeAmount, 0);
});

test('internal reference work rejects positive sale adjustments before rounding', () => {
  for (const name of ['discount', 'surcharge']) {
    for (const selected of [{ type: 'percent', value: 1 }, { type: 'amount', value: 0.001 }]) {
      assert.throws(() => calculateReferenceQuote({ ...example(), purpose: 'internal', [name]: selected }), {
        message: 'El trabajo interno no admite descuentos ni recargos.',
      });
    }
  }
  const result = calculateReferenceQuote({ ...example(), purpose: 'internal', discount: { type: 'percent', value: 0 }, surcharge: { type: 'amount', value: 0 } });
  assert.equal(result.totalCost, 7724.94);
  assert.equal(result.internalCost, 7724.94);
  assert.equal(result.finalPrice, 0);
  assert.equal(result.commercialProfit, 0);
});
