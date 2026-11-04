import test from 'node:test';
import assert from 'node:assert/strict';
import { composeSharedCatalog } from '../src/domain/shared-catalog.mjs';

const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-negro';
const base = { id: 'base:11111111-1111-5111-8111-111111111111', sku: 'PLA1', sourceUrl: url, status: 'confirmed', revision: 1, profile: { name: 'PLA', material: 'PLA', brand: 'ACME', purchasePrice: 1000, netWeightGrams: 1000 } };
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

test('manual base identity and provenance remain explicit without supplier metadata', () => {
  const manual = { id: 'base:33333333-3333-4333-8333-333333333333', origin: 'manual', status: 'confirmed',
    profile: { name: 'Manual', material: 'PLA', brand: '', purchasePrice: 500, netWeightGrams: 1000 } };
  assert.deepEqual(composeSharedCatalog({ base: [manual] }), [manual]);
  for (const id of ['base:bad', 'base:', 'private:33333333-3333-4333-8333-333333333333']) {
    assert.throws(() => composeSharedCatalog({ base: [{ ...manual, id }] }), TypeError);
  }
  assert.deepEqual(composeSharedCatalog({ base: [manual], personal: [{ id: 'own', name: 'Manual', material: 'PLA' }] }).map(row => row.id), ['own', manual.id]);
});

test('legacy member masks do not alter common rows, while supplier identity keeps private ID and common values', () => {
  const privateRow = { id: 'private', sourceUrl: url, name: 'Old', material: 'PLA', brand: 'Mine', purchasePrice: 1, netWeightGrams: 1 };
  const result = composeSharedCatalog({ base: [base], personal: [privateRow], overrides: [{ baseId: base.id, fields: { name: 'Mask' } }] });
  assert.deepEqual(result, [{ ...privateRow, ...base.profile, id: 'private', sourceUrl: url,
    commonTarget: { id: base.id.slice(5), baseRevision: 1 } }]);
  assert.equal(composeSharedCatalog({ base: [base], overrides: [{ baseId: base.id, fields: { name: 'Mask' } }] })[0].profile.name, 'PLA');
});

test('legacy masks never override common values', () => {
  const input = copy(base);
  const overrides = [{ baseId: base.id, fields: { purchasePrice: 1000, name: 'Mi PLA' } }];
  const before = copy(overrides);
  const result = composeSharedCatalog({ base: [input], overrides });
  assert.equal(result[0].profile.name, 'PLA');
  assert.equal(result[0].profile.purchasePrice, 1000);
  assert.equal(result[0].overriddenFields, undefined);
  assert.deepEqual(overrides, before);
  assert.deepEqual(input, base);
  assert.deepEqual(composeSharedCatalog({ base: [base], overrides: [{ baseId: base.id, fields: { netWeightGrams: -1 } }] })[0].profile, base.profile);
});

test('updated common values replace legacy masks', () => {
  const changed = { ...copy(base), profile: { ...base.profile, purchasePrice: 1700, netWeightGrams: 750, name: 'New PLA' } };
  const result = composeSharedCatalog({ base: [changed], overrides: [{ baseId: base.id, fields: { purchasePrice: 1000 } }] });
  assert.deepEqual(result[0].profile, changed.profile);
  assert.equal(result[0].overriddenFields, undefined);
  assert.deepEqual(changed.profile, { ...base.profile, purchasePrice: 1700, netWeightGrams: 750, name: 'New PLA' });
});

test('only exact verified supplier URL or SKU deduplicates, preserving private identity with common values', () => {
  const own = { id: 'own-id', name: 'Custom', material: 'PETG', brand: 'Mine', purchasePrice: 200, netWeightGrams: 300, sourceUrl: url };
  const other = { id: 'other', name: base.profile.name, material: 'PLA', brand: base.profile.brand, netWeightGrams: 1000, purchasePrice: 1000 };
  const before = copy([own, other]);
  const result = composeSharedCatalog({ base: [base], personal: [own, other] });
  assert.deepEqual(result, [{ ...own, ...base.profile, commonTarget: { id: base.id.slice(5), baseRevision: 1 } }, other]);
  assert.deepEqual([own, other], before);
  assert.deepEqual(composeSharedCatalog({ base: [base], personal: [{ ...other, sku: 'PLA1', sourceUrl: 'https://unverified.invalid/x' }] }).map(x => x.id), ['other', base.id]);
  assert.deepEqual(composeSharedCatalog({ base: [base], personal: [other] }).map(x => x.id), ['other', base.id]);
});

test('pending reference cannot be made quotable through an override', () => {
  assert.deepEqual(composeSharedCatalog({ base: [pending], overrides: [{ baseId: pending.id, fields: { purchasePrice: 100 } }] }), [pending]);
  assert.deepEqual(composeSharedCatalog({ base: [pending] }), [pending]);
});
