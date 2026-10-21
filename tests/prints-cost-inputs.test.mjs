import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchaseStore } from '../src/data/purchases.mjs';
import { createPrintStore } from '../src/data/prints.mjs';

const costError = 'costInputs debe contener solo costos de producción.';

test('unknown production expense rejects without saving, consuming stock or allocating IDs', () => {
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  let purchaseIds = 0;
  const purchases = createPurchaseStore(storage, {
    id: () => `purchase-${++purchaseIds}`,
    now: () => new Date('2025-01-01T00:00:00Z'),
  });
  assert.equal(purchases.savePurchase({
    date: '2025-01-01', supplier: { name: 'Proveedor' },
    lines: [{ material: 'PLA', brand: 'B', color: 'C',
      quantity: 1, netWeightGrams: 100, purchasePrice: 1000 }],
  }).ok, true);

  let ids = 0;
  const prints = createPrintStore(storage, {
    purchaseStore: purchases,
    id: () => `job-${++ids}`,
    now: () => new Date('2025-01-01T00:00:00Z'),
  });
  const draft = {
    submissionId: 'one', date: '2025-01-01', title: 'Trabajo',
    purpose: 'internal', outcome: 'failed', pieceCount: 1,
    spoolId: purchases.listSpools()[0].id, actualGrams: 1,
    hours: 0, minutes: 0,
    costInputs: { watts: 0, electricityPricePerKwh: 0,
      extraProductionCosts: 5000 },
  };
  const before = JSON.stringify([...data]);
  const result = prints.savePrint(draft);
  assert.deepEqual(result, { ok: false, error: costError });
  assert.equal(JSON.stringify([...data]), before);
  assert.equal(ids, 0);
  assert.deepEqual(prints.listPrints().records, []);
  assert.equal(prints.listInventory().inventory[0].remainingGrams, 100);

  // Correcting the same submission must still save the original intended expense.
  draft.costInputs = { watts: 0, electricityPricePerKwh: 0, extraProductionCost: 5000 };
  const saved = prints.savePrint(draft);
  assert.equal(saved.ok, true);
  assert.equal(saved.record.cost.breakdown.extras, 5000);
  assert.equal(saved.record.cost.totalCost, 5010);
  assert.equal(ids, 1);
  assert.equal(prints.listPrints().records.length, 1);
  assert.equal(prints.listInventory().inventory[0].remainingGrams, 99);
});
