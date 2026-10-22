import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpoolCatalog } from '../src/ui/spool-catalog.mjs';
import { evaluate, demoSpools } from '../src/ui/quote.mjs';
import { createPurchaseStore } from '../src/data/purchases.mjs';

const form = (spoolId = 'demo-petg') => ({ title: 'Pieza', purpose: 'sale', spoolId, purchasePrice: '21900', netWeightGrams: '1000', grams: '50', hours: '0', minutes: '0', watts: '0', electricityPricePerKwh: '0', markupPercent: '0', discountType: 'percent', discountValue: '0', surchargeType: 'percent', surchargeValue: '0' });
const purchased = [{ id: 'demo-petg', purchaseId: 'purchase-one', date: '2025-02-28', material: 'PLA', brand: 'Sur', color: 'Ámbar', purchasePrice: 18000, netWeightGrams: 800, remainingGrams: 800 }, { id: 'spool-two', purchaseId: 'purchase-one', date: '2025-02-28', material: 'PLA', brand: 'Sur', color: 'Azul', purchasePrice: 19000, netWeightGrams: 900, remainingGrams: 900 }];

test('catalog uses collision-safe identities, date and provenance with detached records', () => {
  const source = structuredClone(purchased);
  const catalog = buildSpoolCatalog(purchased, [{ id: 'abc', name: 'PLA 800 g', material: 'PLA', brand: 'Sur', purchasePrice: 21900, netWeightGrams: 800 }]);
  assert.deepEqual(catalog.map(({ id }) => id), ['profile:abc', 'purchase:demo-petg', 'purchase:spool-two']);
  assert.match(catalog[1].label, /PLA.*Sur.*Ámbar.*2025-02-28/);
  assert.equal(catalog[1].purchaseId, 'purchase-one');
  assert.equal(catalog[1].spoolId, 'demo-petg');
  catalog[1].purchasePrice = 1;
  assert.deepEqual(purchased, source);
  assert.equal(demoSpools[0].purchasePrice, 21900);
});

test('injected catalog estimates actual price and weight without stock deduction or input changes', () => {
  const catalog = buildSpoolCatalog(purchased);
  const candidate = { ...form('purchase:demo-petg'), purchasePrice: '18000', netWeightGrams: '800', grams: '1600' };
  const inputBefore = structuredClone(candidate);
  const catalogBefore = structuredClone(catalog);
  const result = evaluate(candidate, catalog);
  assert.equal(result.error, null);
  assert.equal(result.result.breakdown.material, 36000);
  assert.equal(result.form.spoolId, 'purchase:demo-petg');
  assert.deepEqual(candidate, inputBefore);
  assert.deepEqual(catalog, catalogBefore);
  assert.equal(evaluate(form('purchase:demo-petg')).error, 'Selecciona una bobina de prueba.');
  assert.equal(evaluate(form('unknown'), catalog).error, 'Selecciona una bobina de prueba.');
  assert.deepEqual(evaluate(form()), evaluate(form(), demoSpools));
});

test('corrupt purchase storage cannot introduce spools into the validated catalog', () => {
  const store = createPurchaseStore({ getItem: () => '{bad', setItem: () => { throw Error('unexpected write'); } });
  assert.match(store.error, /no se pueden leer/);
  assert.deepEqual(store.listSpools(), []);
  assert.deepEqual(buildSpoolCatalog(store.listSpools()), []);
});
