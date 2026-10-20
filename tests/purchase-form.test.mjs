import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPurchaseForm } from '../src/ui/purchase-form.mjs';

const draft = () => ({ date: '2025-02-28', name: 'Taller Sur', address: 'Valparaíso', phone: '+56 9 4567 8901', notes: 'Retiro', lines: [
  { material: 'PLA', brand: 'Marca A', color: 'Rojo', quantity: '2', netWeightGrams: '1000', purchasePrice: '18000' },
  { material: 'PETG', brand: 'Marca B', color: 'Negro', quantity: '1', netWeightGrams: '1000', purchasePrice: '22000' },
] });

test('maps multiple draft lines to a validated preview without changing source', () => {
  const source = draft();
  const before = structuredClone(source);
  const preview = mapPurchaseForm(source);
  assert.equal(preview.total, 58000);
  assert.equal(preview.spoolCount, 3);
  assert.deepEqual(preview.supplier, { name: 'Taller Sur', address: 'Valparaíso', phone: '+56 9 4567 8901' });
  assert.deepEqual(preview.lines.map(({ quantity, netWeightGrams, purchasePrice }) => ({ quantity, netWeightGrams, purchasePrice })), [
    { quantity: 2, netWeightGrams: 1000, purchasePrice: 18000 },
    { quantity: 1, netWeightGrams: 1000, purchasePrice: 22000 },
  ]);
  assert.deepEqual(source, before);
  assert.equal('id' in preview, false);
});

test('blank and non-integer numeric fields reject instead of converting to zero or truncating', () => {
  for (const [field, value] of [['quantity', ''], ['quantity', '1.5'], ['quantity', 'Infinity'], ['netWeightGrams', ''], ['netWeightGrams', '0'], ['purchasePrice', ''], ['purchasePrice', '1.5'], ['purchasePrice', '9007199254740992']]) {
    const source = draft();
    source.lines[0][field] = value;
    const before = structuredClone(source);
    assert.throws(() => mapPurchaseForm(source), /línea 1|lines\[0\]/i);
    assert.deepEqual(source, before);
  }
});

test('delegates calendar, required descriptors and spool cap errors to purchase validation', () => {
  for (const [mutate, message] of [
    [(d) => { d.date = '2025-02-29'; }, /Fecha de compra inválida/],
    [(d) => { d.name = ''; }, /supplier.name/],
    [(d) => { d.lines[0].material = ''; }, /lines\[0\].material/],
    [(d) => { d.lines[0].quantity = '1001'; }, /Máximo 1000 bobinas/],
    [(d) => { d.lines = []; }, /al menos una línea/],
  ]) {
    const source = draft();
    mutate(source);
    assert.throws(() => mapPurchaseForm(source), message);
  }
});
