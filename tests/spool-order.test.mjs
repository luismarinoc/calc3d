import test from 'node:test';
import assert from 'node:assert/strict';
import { orderSpoolsForDisplay } from '../src/ui/spool-order.mjs';

test('display groups mixed-case and custom materials, then names or labels, without touching values or input', () => {
  const items = Object.freeze([
    Object.freeze({ id: 'profile:p2', material: 'PETG', name: 'Bobina 10', purchasePrice: 21900, netWeightGrams: 1000 }),
    Object.freeze({ id: 'profile:a', material: 'pla', name: 'Azul', purchasePrice: 0, netWeightGrams: 750 }),
    Object.freeze({ id: 'profile:p1', material: 'petg', name: 'Bobina 2', purchasePrice: 18000, netWeightGrams: 800 }),
    Object.freeze({ id: 'purchase:abs', material: 'ABS', label: 'ABS · Azul', purchasePrice: 9000, netWeightGrams: 500 }),
    Object.freeze({ id: 'profile:z', material: 'PLA', name: 'Ámbar', purchasePrice: 30000, netWeightGrams: 1000 }),
    Object.freeze({ id: 'profile:c', material: 'PLA seda', name: 'Seda', purchasePrice: 12000, netWeightGrams: 500 }),
    Object.freeze({ id: 'profile:p0', material: 'Petg', name: 'Bobina 2', purchasePrice: 15000, netWeightGrams: 900 }),
  ]);
  const ordered = orderSpoolsForDisplay(items);
  assert.deepEqual(ordered.map(item => item.id), ['purchase:abs', 'profile:p0', 'profile:p1', 'profile:p2', 'profile:z', 'profile:a', 'profile:c']);
  assert.notStrictEqual(ordered, items);
  assert.deepEqual(items.map(item => item.id), ['profile:p2', 'profile:a', 'profile:p1', 'purchase:abs', 'profile:z', 'profile:c', 'profile:p0']);
  for (const item of ordered) assert.strictEqual(item, items.find(source => source.id === item.id));
  assert.deepEqual(orderSpoolsForDisplay(Object.freeze([])), []);
});

test('display sorts material, then optional brand, then name or label and ID with Spanish numeric collation', () => {
  const items = Object.freeze([
    Object.freeze({ id: 'profile:z', material: 'PETG', brand: 'Zeta', name: 'Bobina 1' }),
    Object.freeze({ id: 'profile:b', material: 'petg', brand: 'Álamo', name: 'Bobina 10' }),
    Object.freeze({ id: 'profile:no-brand', material: 'PETG', name: 'Última' }),
    Object.freeze({ id: 'purchase:2', material: 'PETG', brand: 'alamo', label: 'Bobina 2' }),
    Object.freeze({ id: 'profile:a', material: 'PETG', brand: 'Alamo', name: 'Bobina 2' }),
    Object.freeze({ id: 'profile:abs', material: 'ABS', brand: 'Zeta', name: 'Primera' }),
    Object.freeze({ id: 'profile:empty', material: 'PETG', brand: '', name: 'Antes' }),
  ]);
  const ordered = orderSpoolsForDisplay(items);
  assert.deepEqual(ordered.map(item => item.id), [
    'profile:abs', 'profile:empty', 'profile:no-brand', 'profile:a', 'purchase:2', 'profile:b', 'profile:z',
  ]);
  assert.deepEqual(items.map(item => item.id), [
    'profile:z', 'profile:b', 'profile:no-brand', 'purchase:2', 'profile:a', 'profile:abs', 'profile:empty',
  ]);
  for (const item of ordered) assert.strictEqual(item, items.find(source => source.id === item.id));
});

test('existing catalog identity and numeric values remain attached to each selection', () => {
  const catalog = Object.freeze([
    Object.freeze({ id: 'profile:first', material: 'PETG', label: 'First', purchasePrice: 21900, netWeightGrams: 1000 }),
    Object.freeze({ id: 'purchase:second', material: 'ABS', label: 'Second', purchasePrice: 18000, netWeightGrams: 800 }),
  ]);
  const displayed = orderSpoolsForDisplay(catalog);
  assert.strictEqual(catalog[0].id, 'profile:first'); // Unsorted first entry remains the default catalog identity.
  assert.strictEqual(displayed.find(item => item.id === 'profile:first'), catalog[0]);
  assert.deepEqual(displayed.find(item => item.id === 'purchase:second'), catalog[1]);
});
