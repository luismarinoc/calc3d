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

test('Creality and eSun stay visibly separated without recoloring other brands', () => {
  const alone = brandColors(['Creality', 'eSun', 'Zeta', '', '   ']);
  const reversed = brandColors(['Zeta', ' ESUN ', 'CREALITY', 'eSun', 'Creality']);
  const parse = color => {
    const match = /^oklch\((\d+%) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)\)$/.exec(color);
    assert.ok(match, `expected oklch color, got ${color}`);
    return { lightness: match[1], chroma: match[2], hue: Number(match[3]) };
  };
  const creality = parse(alone.get('Creality'));
  const esun = parse(alone.get('eSun'));
  assert.equal(creality.lightness, esun.lightness);
  assert.equal(creality.chroma, esun.chroma);
  const gap = Math.abs(creality.hue - esun.hue);
  assert.ok(Math.min(gap, 360 - gap) >= 60, `circular hue gap ${gap} must be at least 60 degrees`);
  assert.equal(alone.get('Creality'), 'oklch(69% 0.15 58.374727)');
  assert.equal(reversed.get('CREALITY'), alone.get('Creality'));
  assert.equal(reversed.get('Creality'), alone.get('Creality'));
  assert.equal(reversed.get(' ESUN '), alone.get('eSun'));
  assert.equal(reversed.get('eSun'), alone.get('eSun'));
  assert.equal(reversed.get('Zeta'), alone.get('Zeta'));
  assert.equal(alone.get('Zeta'), brandColors(['Zeta']).get('Zeta'));
  assert.equal(alone.get(''), null);
  assert.equal(alone.get('   '), null);
});

test('S1: many displayed brands receive distinct CSS color values', () => {
  const colors = brandColors(Array.from({ length: 73 }, (_, i) => `Marca ${i}`));
  assert.equal(new Set([...colors.values()]).size, 73);
});
