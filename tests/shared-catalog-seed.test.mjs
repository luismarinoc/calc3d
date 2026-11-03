import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { curateSharedSeed } from '../ops/shared-catalog-seed.mjs';
import { validateSpoolProfile } from '../src/domain/spool-profiles.mjs';
import { composeSharedCatalog } from '../src/domain/shared-catalog.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/shared-supplier-catalog.json', import.meta.url)));
const sha = 'a'.repeat(64);
const fixture = { sourceSha256: sha, records: [
  { sku: 'OK', sourceUrl: 'https://www.todotoner.cl/ok', status: 'confirmed', profile: { name: 'Ok', material: 'PLA', brand: 'ACME', purchasePrice: 100, netWeightGrams: 1000, ownerId: 'private' }, provenance: { providerSku: 'OK', offerUrl: 'https://www.todotoner.cl/ok', sourceSha256: sha, normalizedSha256: sha }, ownerId: 'private' },
  { sku: 'PEND', sourceUrl: 'https://www.todotoner.cl/pending', status: 'pending', available: { name: 'Pending', material: 'PLA', brand: 'ACME', color: 'Rojo', price: 100 }, reasons: ['mass_unproven'], provenance: { providerSku: 'PEND', offerUrl: 'https://www.todotoner.cl/pending', sourceSha256: sha, normalizedSha256: sha } },
  { sku: 'HELD', status: 'nonfilament', ownerId: 'private' }
] };

test('public color and pending consultation metadata survive curation and composition without becoming quotable', () => {
  const source = structuredClone(fixture);
  source.records[0].profile.filamentColor = 'Azul';
  source.records[0].profile.filamentColorHex = '#ABCDEF';
  source.records[1].available = { name: 'Pending', material: 'PLA', brand: 'ACME', color: 'Rojo', price: 100 };
  source.records[1].provenance.offerUrl = source.records[1].sourceUrl;
  const before = structuredClone(source);
  const curated = curateSharedSeed(source);
  assert.equal(curated.records[0].profile.filamentColor, 'Azul');
  assert.equal(curated.records[0].profile.filamentColorHex, '#ABCDEF');
  assert.deepEqual(curated.records[1], {
    id: curated.records[1].id, sku: 'PEND', sourceUrl: source.records[1].sourceUrl, status: 'pending',
    provenance: curated.records[1].provenance, name: 'Pending', material: 'PLA', brand: 'ACME',
    filamentColor: 'Rojo', referencePriceClp: 100, reasons: ['mass_unproven']
  });
  const composed = composeSharedCatalog({ base: curated.records, overrides: [{ baseId: curated.records[0].id, fields: { purchasePrice: 80 } }] });
  assert.equal(composed[0].profile.filamentColorHex, '#ABCDEF');
  assert.equal(composed[0].profile.purchasePrice, 80);
  assert.deepEqual(composed[1], { ...curated.records[1] });
  assert.equal(composed[1].profile, undefined);
  assert.equal(composed[1].purchasePrice, undefined);
  assert.equal(composed[1].netWeightGrams, undefined);
  assert.deepEqual(source, before);
  assert.deepEqual(curated.records[1].reasons, ['mass_unproven']);
});

test('curation excludes held sources and owner data, rejects unverified evidence and remains deterministic', () => {
  const before = structuredClone(fixture);
  const curated = curateSharedSeed(fixture);
  assert.equal(curated.records.length, 2);
  assert.deepEqual(curated, curateSharedSeed(fixture));
  assert.equal(JSON.stringify(curated).includes('private'), false);
  assert.equal(curated.records[1].profile, undefined);
  assert.deepEqual(fixture, before);
  assert.throws(() => curateSharedSeed({ ...fixture, records: [{ ...fixture.records[0], sourceUrl: 'https://bad.invalid/ok' }] }), TypeError);
  assert.throws(() => curateSharedSeed({ ...fixture, records: [{ ...fixture.records[0], provenance: { ...fixture.records[0].provenance, providerSku: 'WRONG' } }] }), TypeError);
  assert.throws(() => curateSharedSeed({ ...fixture, records: [{ ...fixture.records[1], available: { ...fixture.records[1].available, price: -1 } }] }), TypeError);
  assert.throws(() => curateSharedSeed({ ...fixture, records: [{ ...fixture.records[1], available: { ...fixture.records[1].available, color: '\u0000' } }] }), TypeError);
});

test('checked-in seed contains reviewed public identities, stable unique ids, and no private/quotable pending payload', () => {
  assert.equal(seed.version, 1);
  assert.match(seed.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(seed.records.length, 1171);
  assert.equal(seed.records.filter(row => row.status === 'confirmed').length, 1127);
  assert.equal(seed.records.filter(row => row.status === 'pending').length, 44);
  assert.equal(new Set(seed.records.map(row => row.id)).size, seed.records.length);
  assert.equal(new Set(seed.records.map(row => row.sku)).size, seed.records.length);
  assert.equal(new Set(seed.records.map(row => row.sourceUrl)).size, seed.records.length);
  for (const row of seed.records) {
    assert.deepEqual(Object.keys(row).sort(), (row.status === 'confirmed' ? ['id', 'sku', 'sourceUrl', 'status', 'provenance', 'profile'] : ['id', 'sku', 'sourceUrl', 'status', 'provenance', 'name', 'material', 'brand', 'filamentColor', 'referencePriceClp', 'reasons']).sort());
    const hash = createHash('sha256').update(`calc3d:shared:todotoner:v1:${row.sku}`).digest('hex');
    assert.equal(row.id, `base:${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`);
    assert.match(row.sourceUrl, /^https:\/\/www\.todotoner\.cl\/[^?#]+$/);
    assert.deepEqual(Object.keys(row.provenance).sort(), ['normalizedSha256', 'sourceSha256']);
    assert.equal(row.provenance.normalizedSha256, seed.sourceSha256);
    if (row.status === 'confirmed') {
      assert.deepEqual(Object.keys(row.profile).sort(), ['brand', 'filamentColor', 'material', 'name', 'netWeightGrams', 'purchasePrice', ...(Object.hasOwn(row.profile, 'filamentColorHex') ? ['filamentColorHex'] : [])].sort());
      assert.deepEqual(validateSpoolProfile(row.profile), row.profile);
    } else {
      assert.equal(row.profile, undefined);
      assert.equal(row.purchasePrice, undefined);
      assert.equal(row.netWeightGrams, undefined);
      assert.deepEqual(validateSpoolProfile({ name: row.name, material: row.material, brand: row.brand,
        filamentColor: row.filamentColor, purchasePrice: 0, netWeightGrams: 1 }).filamentColor, row.filamentColor);
      assert.ok(row.referencePriceClp === null || Number.isSafeInteger(row.referencePriceClp) && row.referencePriceClp >= 0);
      assert.ok(row.reasons.length > 0);
    }
  }
  assert.equal(JSON.stringify(seed).match(/"(?:ownerId|email|quote|printer|purchase|brandId)"/i), null);
});
