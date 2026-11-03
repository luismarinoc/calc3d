import test from 'node:test';
import assert from 'node:assert/strict';
import { composeSharedCatalog } from '../src/domain/shared-catalog.mjs';

const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-negro';
const base = { id: 'base:11111111-1111-5111-8111-111111111111', sku: 'PLA1', sourceUrl: url, status: 'confirmed', profile: { name: 'PLA', material: 'PLA', brand: 'ACME', purchasePrice: 1000, netWeightGrams: 1000 } };
const pending = { id: 'base:22222222-2222-5222-8222-222222222222', sku: 'PEND', sourceUrl: `${url}-pend`, status: 'pending', name: 'Pendiente', material: 'PLA', brand: 'ACME', filamentColor: 'Azul', referencePriceClp: 100, reasons: ['weight_unproven'] };
const copy = value => structuredClone(value);

test('new account sees confirmed base profiles and separate nonquotable pending references', () => {
  const input = [copy(base), copy(pending)];
  const before = copy(input);
  const result = composeSharedCatalog({ base: input });
  assert.deepEqual(result, [copy(base), copy(pending)]);
  assert.equal(result[1].profile, undefined);
  assert.deepEqual(input, before);
});

test('owner-only field mask overlays base, including explicit value equal to old base', () => {
  const input = copy(base);
  const overrides = [{ baseId: base.id, fields: { purchasePrice: 1000, name: 'Mi PLA' } }];
  const before = copy(overrides);
  const result = composeSharedCatalog({ base: [input], overrides });
  assert.equal(result[0].profile.name, 'Mi PLA');
  assert.equal(result[0].profile.purchasePrice, 1000);
  assert.deepEqual(result[0].overriddenFields, ['purchasePrice', 'name']);
  assert.deepEqual(overrides, before);
  assert.deepEqual(input, base);
  assert.throws(() => composeSharedCatalog({ base: [base], overrides: [{ baseId: base.id, fields: { ownerId: 'leak' } }] }), TypeError);
  assert.throws(() => composeSharedCatalog({ base: [base], overrides: [{ baseId: base.id, fields: { netWeightGrams: -1 } }] }), TypeError);
});

test('updated baseline refreshes untouched fields, retaining explicitly overridden values', () => {
  const changed = { ...copy(base), profile: { ...base.profile, purchasePrice: 1700, netWeightGrams: 750, name: 'New PLA' } };
  const result = composeSharedCatalog({ base: [changed], overrides: [{ baseId: base.id, fields: { purchasePrice: 1000 } }] });
  assert.deepEqual(result[0].profile, { ...changed.profile, purchasePrice: 1000 });
  assert.deepEqual(result[0].overriddenFields, ['purchasePrice']);
  assert.deepEqual(changed.profile, { ...base.profile, purchasePrice: 1700, netWeightGrams: 750, name: 'New PLA' });
});

test('only exact verified supplier URL or SKU deduplicates, preserving personal identity and content', () => {
  const own = { id: 'own-id', name: 'Custom', material: 'PETG', brand: 'Mine', purchasePrice: 200, netWeightGrams: 300, sourceUrl: url };
  const other = { id: 'other', name: base.profile.name, material: 'PLA', brand: base.profile.brand, netWeightGrams: 1000, purchasePrice: 1000 };
  const before = copy([own, other]);
  const result = composeSharedCatalog({ base: [base], personal: [own, other] });
  assert.deepEqual(result, [own, other]);
  assert.deepEqual([own, other], before);
  assert.deepEqual(composeSharedCatalog({ base: [base], personal: [{ ...other, sku: 'PLA1', sourceUrl: 'https://unverified.invalid/x' }] }).map(x => x.id), ['other', base.id]);
  assert.deepEqual(composeSharedCatalog({ base: [base], personal: [other] }).map(x => x.id), ['other', base.id]);
});

test('pending reference cannot be made quotable through an override', () => {
  assert.throws(() => composeSharedCatalog({ base: [pending], overrides: [{ baseId: pending.id, fields: { purchasePrice: 100 } }] }), TypeError);
  assert.deepEqual(composeSharedCatalog({ base: [pending] }), [pending]);
});
