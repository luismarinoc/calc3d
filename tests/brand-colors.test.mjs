import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandColors } from '../src/ui/brand-colors.mjs';

test('S1: same brand identity ignores case/space, different displayed brands differ, blank stays neutral', () => {
  const colors = brandColors([' Álamo ', 'álamo', 'Zeta', '', '   ', 'Prueba']);
  assert.equal(colors.get(' Álamo '), colors.get('álamo'));
  assert.notEqual(colors.get('Zeta'), colors.get('Prueba'));
  assert.notEqual(colors.get('álamo'), colors.get('Zeta'));
  assert.equal(colors.get(''), null);
  assert.equal(colors.get('   '), null);
  assert.equal(brandColors(['zeta']).get('zeta'), brandColors(['ZETA']).get('ZETA'));
});

test('S1: many displayed brands receive distinct CSS color values', () => {
  const colors = brandColors(Array.from({ length: 73 }, (_, i) => `Marca ${i}`));
  assert.equal(new Set([...colors.values()]).size, 73);
});
