import test from 'node:test';
import assert from 'node:assert/strict';
import { presentSpools } from '../src/ui/brand-display.mjs';
import { buildSpoolCatalog } from '../src/ui/spool-catalog.mjs';

const brands = [{ id: 'a', name: 'Nueva Marca', color: '#AABBCC', aliases: ['prueba', 'nueva marca'] },
  { id: 'b', name: 'Sin configurar', color: null, aliases: ['sin configurar'] }];

test('S1-S6 projection prefers identity, resolves owner aliases and separates representative filament sample without rewriting prices', () => {
  const input = [
    { id: 'profile:1', name: 'Uno', material: 'PLA', brand: 'Prueba', brandId: 'a', filamentColor: 'Azul', filamentColorHex: '#123456', purchasePrice: 12000, netWeightGrams: 1000 },
    { id: 'profile:2', name: 'Dos', material: 'PLA', brand: 'PRUEBA', brandId: null, filamentColor: 'Iridescente', filamentColorHex: null, purchasePrice: 13000, netWeightGrams: 500 },
    { id: 'purchase:3', material: 'PETG', brand: 'pRuEbA', color: 'Verde', date: '2025-02-28', purchaseId: 'purchase-1', spoolId: '3', purchasePrice: 18000, netWeightGrams: 1000 },
    { id: 'profile:4', name: 'Otro', material: 'PETG', brand: 'Sin configurar', brandId: 'b', filamentColor: '', filamentColorHex: null, purchasePrice: 14000, netWeightGrams: 1000 },
    { id: 'profile:5', name: 'Sin marca', material: 'PLA', brand: 'Prueba', brandId: 'missing', purchasePrice: 14000, netWeightGrams: 1000 },
  ];
  const original = structuredClone(input);
  const registry = structuredClone(brands);
  const output = presentSpools(input, brands);
  assert.equal(output[0].brand, 'Nueva Marca');
  assert.equal(output[0].brandColor, '#AABBCC');
  assert.equal(output[0].filamentColor, 'Azul');
  assert.equal(output[0].filamentColorHex, '#123456');
  assert.match(output[0].label, /Nueva Marca.*Azul/);
  assert.equal(output[1].brand, 'Nueva Marca');
  assert.equal(output[1].filamentColor, 'Iridescente');
  assert.equal(output[1].filamentColorHex, null);
  assert.equal(output[2].brand, 'Nueva Marca');
  assert.match(output[2].label, /Nueva Marca.*Verde.*2025-02-28/);
  assert.equal(output[2].brandColor, '#AABBCC');
  assert.equal(output[3].brandColor, null);
  assert.equal(output[4].brandColor, null); // A stale explicit ID cannot borrow another brand's alias.
  assert.equal(output[4].brand, 'Prueba');
  assert.deepEqual(output.map(item => [item.id, item.purchasePrice, item.netWeightGrams]),
    input.map(item => [item.id, item.purchasePrice, item.netWeightGrams]));
  output[0].purchasePrice = 1;
  assert.deepEqual(input, original);
  assert.deepEqual(brands, registry);
});

test('S6 catalog projection keeps full presentation and purchase labels, catalog-first identity and sources detached', () => {
  const profiles = [{ id: 'one', name: 'Prueba XL · presentación Prueba', material: 'PLA', brand: 'Prueba', brandId: 'a', filamentColor: 'Azul', filamentColorHex: '#123456', purchasePrice: 12000, netWeightGrams: 1000 }];
  const purchases = [{ id: 'two', purchaseId: 'purchase-1', date: '2025-02-28', material: 'PLA', brand: 'PRUEBA', color: 'Verde', purchasePrice: 18000, netWeightGrams: 1000 }];
  const originals = structuredClone({ profiles, purchases });
  const catalog = buildSpoolCatalog(purchases, profiles, brands);
  assert.deepEqual(catalog.map(item => item.id), ['profile:one', 'purchase:two']);
  assert.deepEqual(catalog.map(item => item.brand), ['Nueva Marca', 'Nueva Marca']);
  assert.equal(catalog[0].label, 'Prueba XL · presentación Prueba · PLA · Nueva Marca · Azul');
  assert.equal(catalog[1].label, 'PLA · Nueva Marca · Verde · 2025-02-28 · compra de prueba · bobina two');
  assert.deepEqual(catalog.map(item => item.purchasePrice), [12000, 18000]);
  assert.equal(catalog[0].filamentColorHex, '#123456');
  assert.deepEqual({ profiles, purchases }, originals);
});

test('S1/S5/S6 unmatched purchased brand retains full context, neutral marker, price and sources without a fabricated sample', () => {
  const purchases = [{ id: 'unknown', purchaseId: 'purchase-7', date: '2025-03-01', material: 'PETG',
    brand: 'Sin registro', color: 'Tornasol', purchasePrice: 23456, netWeightGrams: 750 }];
  const source = structuredClone(purchases);
  const result = buildSpoolCatalog(purchases, [], brands);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'purchase:unknown');
  assert.equal(result[0].label, 'PETG · Sin registro · Tornasol · 2025-03-01 · compra de prueba · bobina unknown');
  assert.equal(result[0].brand, 'Sin registro');
  assert.equal(result[0].brandColor, null);
  assert.equal(result[0].filamentColorHex, null);
  assert.equal(result[0].purchasePrice, 23456);
  assert.equal(result[0].netWeightGrams, 750);
  result[0].brand = 'Cambio local';
  assert.deepEqual(purchases, source);
});
