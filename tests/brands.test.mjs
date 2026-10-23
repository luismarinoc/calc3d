import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrandName, validateBrand } from '../src/domain/brands.mjs';

test('brand names trim, collapse spacing and normalize identity without fuzzy matching', () => {
  assert.deepEqual(validateBrand({ name: '  eSun  PLA  ', color: '#aBc123' }), { name: 'eSun PLA', color: '#ABC123' });
  assert.equal(normalizeBrandName(' ESUN   pla '), 'esun pla');
  assert.notEqual(normalizeBrandName('eSun'), normalizeBrandName('e Sun'));
});
test('invalid brand input and colors fail with exact feedback', () => {
  for (const input of [{ name: '', color: '#ABC123' }, { name: '   ', color: '#ABC123' }, { name: 'bad\nname', color: '#ABC123' }])
    assert.throws(() => validateBrand(input), { name: 'TypeError', message: 'El nombre de marca debe tener entre 1 y 120 caracteres sin controles.' });
  for (const color of [null, '#FFF', '#12345678', 'red', '#ZZZZZZ'])
    assert.throws(() => validateBrand({ name: 'Brand', color }), { name: 'TypeError', message: 'El color de marca debe ser hexadecimal de 6 dígitos (#RRGGBB).' });
});
