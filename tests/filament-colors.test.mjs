import test from 'node:test';
import assert from 'node:assert/strict';
import { filamentSample } from '../src/domain/filament-colors.mjs';

test('an explicit sample wins over the basic name and brand color without rewriting the profile', () => {
  const profile = Object.freeze({ filamentColor: 'Blanco', filamentColorHex: '#3366aa', brandColor: '#61D95B', purchasePrice: 13990 });
  assert.deepEqual(filamentSample(profile), { name: 'Blanco', hex: '#3366AA', approximate: false });
  assert.equal(profile.filamentColorHex, '#3366aa');
  assert.equal(profile.purchasePrice, 13990);
});

test('missing HEX gets a visibly approximate exact basic-name sample without modifying stored data', () => {
  for (const [name, hex] of [['Blanco', '#FFFFFF'], ['  NEGRO  ', '#000000'], ['Rojo', '#FF0000'], ['Verde', '#008000'], ['Azul', '#0000FF'], ['Amarillo', '#FFFF00'], ['Naranja', '#FFA500'], ['Morado', '#800080'], ['Violeta', '#EE82EE'], ['Rosa', '#FFC0CB'], ['Gris', '#808080'], ['Marrón', '#A52A2A'], ['Café', '#A52A2A'], ['Beige', '#F5F5DC']]) {
    const profile = Object.freeze({ filamentColor: name, filamentColorHex: null, brandColor: '#61D95B' });
    assert.deepEqual(filamentSample(profile), { name: name.trim(), hex, approximate: true });
    assert.equal(profile.filamentColorHex, null);
  }
});

test('unknown, mixed, transparent and special names never borrow brand color or invent a sample', () => {
  for (const name of ['', 'Arcoíris translúcido', 'Blanco y negro', 'Azul noche', 'Transparente', 'Dorado metálico', 'Blanco especial', 'constructor']) {
    assert.deepEqual(filamentSample({ filamentColor: name, filamentColorHex: null, brandColor: '#61D95B' }), { name, hex: null, approximate: false });
  }
});
