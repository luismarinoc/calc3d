import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalSpool, selectedSpool } from '../src/ui/spool-selection.mjs';

test('historical material stays pinned after a profile revision; new selection uses current costs', () => {
  const saved = { spoolId: 'profile:abc', form: { spoolId: 'profile:abc', purchasePrice: 21900, netWeightGrams: 1000 }, input: { spool: { purchasePrice: 21900, netWeightGrams: 1000 } } };
  const catalog = [{ id: 'profile:abc', purchasePrice: 30000, netWeightGrams: 750 }];
  const before = structuredClone(saved);
  const pinned = historicalSpool(saved);
  assert.deepEqual(selectedSpool(catalog, saved.spoolId, pinned), { id: 'profile:abc', purchasePrice: 21900, netWeightGrams: 1000 });
  assert.equal(selectedSpool(catalog, saved.spoolId).purchasePrice, 30000);
  assert.deepEqual(saved, before);
  assert.equal(historicalSpool({ form: { spoolId: 'purchase:missing' }, input: { spool: { purchasePrice: -1, netWeightGrams: 1000 } } }), null);
});

test('legacy saved material uses its owned snapshot even when its demo identity is absent', () => {
  const saved = { form: { spoolId: 'demo-petg', purchasePrice: '10000', netWeightGrams: '1000' } };
  assert.deepEqual(historicalSpool(saved), { id: 'demo-petg', purchasePrice: 10000, netWeightGrams: 1000 });
  assert.equal(selectedSpool([], 'demo-petg', historicalSpool(saved)).purchasePrice, 10000);
});
