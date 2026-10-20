import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, demoSpools } from '../src/ui/quote.mjs';

const form = () => ({ title: 'Soporte de mesa', purpose: 'sale', spoolId: 'demo-petg', purchasePrice: '21900', netWeightGrams: '1000', grams: '50', hours: '1', minutes: '30', watts: '200', electricityPricePerKwh: '200', depreciationPerHour: '0', maintenancePerHour: '0', laborMinutes: '0', laborRatePerHour: '0', extraProductionCost: '0', markupPercent: '50', discountType: 'percent', discountValue: '10', surchargeType: 'amount', surchargeValue: '100' });

test('demo spool identity and required inputs map to domain quote without saving', () => {
  assert.equal(demoSpools[0].id, 'demo-petg');
  const candidate = form();
  const before = structuredClone(candidate);
  const evaluated = evaluate(candidate);
  assert.deepEqual(candidate, before);
  assert.equal(evaluated.error, null);
  assert.equal(evaluated.input.spool.purchasePrice, 21900);
  assert.equal(evaluated.result.totalCost, 1155);
  assert.equal(evaluated.result.basePrice, 1733);
  assert.equal(evaluated.result.discountAmount, 173);
  assert.equal(evaluated.result.surchargeAmount, 100);
  assert.equal(evaluated.result.finalPrice, 1660);
});

test('required blank, invalid minutes and cost floor suppress stale totals and save', () => {
  for (const [field, value, message] of [['grams', '', 'Ingresa un valor para Gramos consumidos.'], ['minutes', '60', 'Los minutos deben estar entre 0 y 59.'], ['discountValue', '90', 'El precio final no puede ser menor al costo total (faltan 1040 CLP).']]) {
    const candidate = { ...form(), [field]: value, ...(field === 'discountValue' ? { discountType: 'percent', markupPercent: '0', surchargeValue: '0' } : {}) };
    const evaluated = evaluate(candidate);
    assert.equal(evaluated.result, null);
    assert.equal(evaluated.error, message);
  }
  assert.equal(evaluate({ ...form(), grams: '0', hours: '0', minutes: '0' }).error, null);
});

test('internal purpose ignores commercial fields, reports expense and preserves original form', () => {
  const candidate = { ...form(), purpose: 'internal' };
  const evaluated = evaluate(candidate);
  assert.equal(evaluated.error, null);
  assert.equal(evaluated.input.markupPercent, 0);
  assert.equal(evaluated.input.discount, undefined);
  assert.equal(evaluated.result.internalCost, evaluated.result.totalCost);
  assert.equal(evaluated.result.finalPrice, 0);
  assert.equal(candidate.discountValue, '10');
});
