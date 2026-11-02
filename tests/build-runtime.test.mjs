import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('package and lockfile select the Node 22 Nixpacks archive consistently', () => {
  const manifest = read('../package.json');
  const lock = read('../package-lock.json');
  assert.equal(manifest.engines?.node, '22', 'Nixpacks archive selection must see Node 22 in package.json');
  assert.deepEqual(lock.packages[''].engines, manifest.engines, 'npm lock root must preserve the runtime declaration');
});
