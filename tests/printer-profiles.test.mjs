import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printerProfiles, customPrinter, profileForStoredPower } from '../src/ui/printer-profiles.mjs';

test('user-provided printer estimates and custom fallback are fixed and distinct', () => {
  assert.deepEqual(printerProfiles.map(({ id, watts }) => [id, watts]), [
    ['a1', 95], ['a1-mini', 45], ['p1p', 80], ['p1s', 100],
    ['x1-carbon', 120], ['p2s', 130], ['h2s', 210],
  ]);
  assert.equal(customPrinter, 'custom');
  assert.equal(profileForStoredPower('p2s', '130'), 'p2s');
  assert.equal(profileForStoredPower('p2s', '145'), 'custom');
  assert.equal(profileForStoredPower(undefined, '130'), 'custom');
  assert.equal(profileForStoredPower('unknown', '130'), 'custom');
  assert.equal(profileForStoredPower('p2s', ''), 'custom');
});
