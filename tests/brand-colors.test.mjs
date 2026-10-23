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

test('S1-S2: collision neighbors cannot change a brand color across Settings and Calculator sets', () => {
  // Existing 360-bucket hash collision: both brands start at the same hue in the old probe scheme.
  const hashHue = key => { let hash = 2166136261; for (const char of key) hash = Math.imul(hash ^ char.codePointAt(0), 16777619); return (hash >>> 0) % 360; };
  const candidates = Array.from({ length: 400 }, (_, i) => `Marca ${i}`);
  const first = candidates.find(brand => candidates.some(other => other !== brand && hashHue(other.toLowerCase()) === hashHue(brand.toLowerCase())));
  const second = candidates.find(other => other !== first && hashHue(other.toLowerCase()) === hashHue(first.toLowerCase()));
  const alone = brandColors([second]).get(second);
  const together = brandColors([first, second, 'Zeta']);
  assert.equal(together.get(second), alone);
  assert.equal(brandColors([` ${second.toUpperCase()} `]).get(` ${second.toUpperCase()} `), alone);
  assert.equal(brandColors([second.normalize('NFD')]).get(second.normalize('NFD')), alone);
  assert.equal(brandColors(['Zeta', second, first]).get(second), alone);
});

test('S1: many displayed brands receive distinct CSS color values', () => {
  const colors = brandColors(Array.from({ length: 73 }, (_, i) => `Marca ${i}`));
  assert.equal(new Set([...colors.values()]).size, 73);
});
