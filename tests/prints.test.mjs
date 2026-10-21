import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrint } from '../src/domain/prints.mjs';

const spool = { id: 's1', purchaseId: 'p1', netWeightGrams: 0.3, purchasePrice: 300 };
const input = () => ({ submissionId: 'draft-1', date: '2024-02-29', title: 'Pieza', purpose: 'internal', outcome: 'failed', pieceCount: 2, spoolId: 's1', actualGrams: 0.1, hours: 1, minutes: 30, costInputs: { watts: 100, electricityPricePerKwh: 200, depreciationPerHour: 10, maintenancePerHour: 20, laborMinutes: 30, laborRatePerHour: 600, extraProductionCost: 5 }, notes: 'Prueba' });

test('pure production snapshot uses selected acquisition and total job consumption, never sale amounts', () => {
  const original = input();
  const value = validatePrint(original, spool);
  assert.deepEqual(original, input());
  assert.equal(value.actualGrams, 0.1);
  assert.equal(value.pieceCount, 2);
  assert.equal(value.purchaseId, 'p1');
  assert.deepEqual(value.cost, { breakdown: { material: 100, electricity: 30, depreciation: 15, maintenance: 30, labor: 300, extras: 5 }, totalCost: 480 });
  for (const field of ['basePrice', 'finalPrice', 'revenue', 'commercialProfit', 'internalCost']) assert.equal(field in value, false);
  value.cost.breakdown.material = 0;
  assert.deepEqual(original, input());
});

test('calendar, identifiers, outcome, actual grams, duration and cost engine numeric boundaries reject', () => {
  const cases = [
    [{ date: '2025-02-29' }, 'Fecha de impresión inválida (YYYY-MM-DD).'],
    [{ title: ' ' }, 'title debe ser texto no vacío.'],
    [{ submissionId: '' }, 'submissionId debe ser texto no vacío.'],
    [{ purpose: 'family' }, 'Propósito inválido: use sale o internal.'],
    [{ outcome: 'pending' }, 'Resultado inválido: use completed o failed.'],
    [{ pieceCount: 0 }, 'pieceCount debe ser un entero positivo seguro.'],
    [{ pieceCount: 1.5 }, 'pieceCount debe ser un entero positivo seguro.'],
    [{ spoolId: '' }, 'spoolId debe ser texto no vacío.'],
    [{ actualGrams: -0.01 }, 'actualGrams debe ser un número finito no negativo.'],
    [{ actualGrams: Infinity }, 'actualGrams debe ser un número finito no negativo.'],
    [{ minutes: 60 }, 'minutes debe ser un entero entre 0 y 59.'],
    [{ costInputs: { ...input().costInputs, watts: -1 } }, 'watts debe ser un número finito no negativo.'],
    [{ costInputs: { ...input().costInputs, laborMinutes: NaN } }, 'laborMinutes debe ser un número finito no negativo.'],
    [{ notes: 3 }, 'notes debe ser texto.'],
    [{ finalPrice: 200 }, 'Una impresión no registra cobros ni precios de venta.'],
  ];
  for (const [change, message] of cases) assert.throws(() => validatePrint({ ...input(), ...change }, spool), { message });
  assert.throws(() => validatePrint(null, spool), { message: 'La impresión debe ser un objeto.' });
  assert.throws(() => validatePrint(input(), null), { message: 'Bobina adquirida inválida.' });
  assert.equal(validatePrint({ ...input(), actualGrams: 0, purpose: 'sale', outcome: 'failed' }, spool).cost.breakdown.material, 0);
});
