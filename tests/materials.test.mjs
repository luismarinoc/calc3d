import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalMaterial } from '../src/domain/materials.mjs';

// Representative labels from the owner inventory, with the supplier wording retained elsewhere.
const families = {
  ABS: ['ABS', 'abs+', 'ABS-ESD (Acrylonitrile Butadiene Styrene con aditivos antiestáticos)', 'ABS con fibra de carbono (ABS-CF)', 'ABS-FR (ABS con retardante de llama)', 'ABS-HT (High Temperature)'],
  ASA: ['ASA', 'ASA+', 'ASA con fibra de carbono (ASA-CF)'],
  HIPS: ['HIPS (High Impact Polystyrene)'],
  PA: ['PA', 'Nylon', 'NYLON', 'Poliamida (Nylon PA)', 'PA-CF'],
  PA6: ['Nylon PA6 con fibra de carbono (PA6-CF)', 'PA6 Nylon + Fibra de Vidrio (GF)'],
  PA12: ['PA12 Nylon + Fibra de Carbono (PA12-CF)'],
  PC: ['PC'], PCL: ['PCL'],
  PEBA: ['PEBA', 'PEBA-90A', 'PEBA90A-LW'],
  PET: ['PET'], PETG: ['Petg', 'PETG', 'PETG (Polietileno Tereftalato Glicolado)', 'PETG+HS (High Speed)'],
  PLA: ['Pla', 'PLA', 'PLA (ácido poliláctico)', 'PLA+', 'PLA Mate (PLA Matte)', 'PLA Lite', 'PLA Alta Velocidad', 'PLA con fibra de carbono (PLA-CF)', 'PLA con partículas de madera (PLA Wood)', 'PLA Flexible (Soft PLA)', 'PLA base + componente elastomérico', 'PLA + mezcla elastomérica (Soft PLA)'],
  PVA: ['PVA'], TPE: ['TPE'], TPU: ['TPU (Poliuretano termoplástico)'],
};
test('canonical materials strip only observed family modifiers and chemical explanations', () => {
  for (const [family, labels] of Object.entries(families)) {
    for (const label of labels) assert.equal(canonicalMaterial(label), family, label);
  }
});
test('distinct polymers and unknown labels do not receive guessed identities', () => {
  for (const label of ['PETGfoo', 'PETG+unknown', 'PLAunknown', 'PLA+unknown', 'PA-CFfoo', 'PA66', 'PA6-unknown', 'PA12-unknown', 'Nylon PA6?', 'Nylon 12?', 'Wood', 'Flexible', 'Carbon Fiber']) {
    assert.equal(canonicalMaterial(label), label.toUpperCase(), label);
  }
  for (const family of ['PET', 'PETG', 'ABS', 'ASA', 'TPU', 'TPE', 'PA', 'PA6', 'PA12']) {
    assert.equal(canonicalMaterial(family), family);
  }
  assert.equal(canonicalMaterial('  petg  '), 'PETG');
  assert.equal(canonicalMaterial(''), '');
  assert.equal(canonicalMaterial(null), null);
});
