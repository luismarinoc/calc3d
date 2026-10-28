import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SPOOLS_PER_PURCHASE, validatePurchase } from '../src/domain/purchases.mjs';

const input = () => ({ date: '2024-02-29', supplier: { name: ' Taller Sur ', address: ' Calle 1 ', phone: '+56 9 1234 ' }, notes: ' retiro ', lines: [
  { material: ' PLA ', brand: ' Marca ', color: ' Rojo ', quantity: 2, netWeightGrams: 750, purchasePrice: 12000 },
  { material: 'PETG', brand: 'Otra', color: 'Azul', quantity: 1, netWeightGrams: 1000, purchasePrice: 16000 },
] });

test('calendar date, contacts, line totals and cap boundary', () => {
  assert.deepEqual(validatePurchase(input()), { date: '2024-02-29', supplier: input().supplier, notes: ' retiro ', lines: input().lines, total: 40000, spoolCount: 3 });
  const boundary = { ...input(), lines: [{ ...input().lines[0], quantity: MAX_SPOOLS_PER_PURCHASE, purchasePrice: 1 }] };
  assert.equal(validatePurchase(boundary).spoolCount, MAX_SPOOLS_PER_PURCHASE);
  assert.throws(() => validatePurchase({ ...boundary, lines: [{ ...boundary.lines[0], quantity: MAX_SPOOLS_PER_PURCHASE + 1 }] }), { message: `Máximo ${MAX_SPOOLS_PER_PURCHASE} bobinas por compra.` });
});

test('invalid dates, empty or malformed fields, quantities, weights and unsafe CLP reject', () => {
  const invalid = [
    [{ date: '2023-02-29' }, 'Fecha de compra inválida (YYYY-MM-DD).'],
    [{ date: '2024-13-01' }, 'Fecha de compra inválida (YYYY-MM-DD).'],
    [{ supplier: { name: ' ', address: '', phone: '' } }, 'supplier.name debe ser texto no vacío.'],
    [{ supplier: { name: 'A', address: 3, phone: '' } }, 'supplier.address debe ser texto.'],
    [{ lines: [] }, 'La compra requiere al menos una línea.'],
    [{ lines: [{ ...input().lines[0], material: '' }] }, 'lines[0].material debe ser texto no vacío.'],
    [{ lines: [{ ...input().lines[0], quantity: '2' }] }, 'lines[0].quantity debe ser un entero positivo seguro.'],
    [{ lines: [{ ...input().lines[0], quantity: 1.5 }] }, 'lines[0].quantity debe ser un entero positivo seguro.'],
    [{ lines: [{ ...input().lines[0], netWeightGrams: 0 }] }, 'lines[0].netWeightGrams debe ser un número finito positivo.'],
    [{ lines: [{ ...input().lines[0], netWeightGrams: Infinity }] }, 'lines[0].netWeightGrams debe ser un número finito positivo.'],
    [{ lines: [{ ...input().lines[0], purchasePrice: -1 }] }, 'lines[0].purchasePrice debe ser un entero CLP no negativo seguro.'],
    [{ lines: [{ ...input().lines[0], purchasePrice: '1' }] }, 'lines[0].purchasePrice debe ser un entero CLP no negativo seguro.'],
    [{ lines: [{ ...input().lines[0], quantity: 2, purchasePrice: Number.MAX_SAFE_INTEGER }] }, 'Total de compra fuera del rango seguro de CLP.'],
    [{ notes: 42 }, 'notes debe ser texto.'],
  ];
  for (const [change, message] of invalid) assert.throws(() => validatePurchase({ ...input(), ...change }), { message });
  assert.throws(() => validatePurchase(null), { message: 'La compra debe ser un objeto.' });
});
