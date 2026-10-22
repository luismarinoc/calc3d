import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpoolProfile } from '../src/domain/spool-profiles.mjs';

const valid = () => ({ name: '  Bobina  ', material: '  PLA+  ', brand: '  Marca  ', purchasePrice: 0, netWeightGrams: 0.25 });

test('rejects formatting controls without changing the supplied profile', () => {
  const input = { name: 'PLA\u200b refill', material: 'PLA', brand: '', purchasePrice: 0, netWeightGrams: 1 };
  const before = structuredClone(input);
  assert.throws(() => validateSpoolProfile(input), TypeError);
  assert.deepEqual(input, before);
});

test('normalizes a detached presentation without restricting materials or defaulting prices', () => {
  const input = valid();
  assert.deepEqual(validateSpoolProfile(input), { name: 'Bobina', material: 'PLA+', brand: 'Marca', purchasePrice: 0, netWeightGrams: 0.25 });
  assert.equal(input.name, '  Bobina  ');
  assert.equal(validateSpoolProfile({ ...input, brand: undefined }).brand, '');
  assert.equal(validateSpoolProfile({ ...input, name: '𐐷'.repeat(120), material: 'Custom TPU' }).name, '𐐷'.repeat(120));
});

test('rejects invalid labels, types, controls and the 120-code-point boundary', () => {
  for (const input of [null, [], 'bobina', { ...valid(), name: '' }, { ...valid(), material: '  ' },
    { ...valid(), name: 2 }, { ...valid(), brand: null }, { ...valid(), name: 'x'.repeat(121) },
    { ...valid(), material: '𐐷'.repeat(121) }, { ...valid(), brand: 'x'.repeat(121) },
    { ...valid(), name: 'ab\ncd' }, { ...valid(), material: 'a\u007fb' }, { ...valid(), brand: '\u0000' }]) {
    assert.throws(() => validateSpoolProfile(input), /bobina|nombre|material|marca|texto/i);
  }
});

test('rejects invalid numeric inputs without coercion', () => {
  for (const price of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null]) {
    assert.throws(() => validateSpoolProfile({ ...valid(), purchasePrice: price }), /precio|CLP/i);
  }
  for (const grams of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null]) {
    assert.throws(() => validateSpoolProfile({ ...valid(), netWeightGrams: grams }), /peso|gramos/i);
  }
  assert.equal(validateSpoolProfile({ ...valid(), purchasePrice: Number.MAX_SAFE_INTEGER, netWeightGrams: Number.MAX_SAFE_INTEGER }).purchasePrice, Number.MAX_SAFE_INTEGER);
});
