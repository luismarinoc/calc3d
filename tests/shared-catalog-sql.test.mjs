import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSharedCatalogSql } from '../ops/shared-catalog-sql.mjs';

const source = JSON.parse(readFileSync(resolve('data/shared-supplier-catalog.json'), 'utf8'));
test('reviewable deterministic owner-free SQL compilation rejects unexpected input', () => {
  const result = compileSharedCatalogSql(source);
  assert.equal(result, compileSharedCatalogSql(source));
  assert.match(result, /on conflict \(id\) do update/);
  assert.match(result, /source_sha256/);
  assert.doesNotMatch(result, /owner_id|brand_id|auth\.users/i);
  for (const wrong of [
    { ...source, records: [{ ...source.records[0], ownerId: 'fake' }] },
    { ...source, records: [{ ...source.records[0], profile: { ...source.records[0].profile, brandId: 'fake' } }] },
    { ...source, records: [{ ...source.records[0], id: 'base:00000000-0000-0000-0000-000000000000' }] },
    { ...source, records: [{ ...source.records[0], provenance: { ...source.records[0].provenance, ownerId: 'fake' } }] },
  ]) assert.throws(() => compileSharedCatalogSql(wrong), /Invalid shared seed/);
});
