// Only observed material families and documented modifiers are classified.
// Unknown free-text labels retain their normalized spelling, never a guessed family.
const MODIFIERS = {
  ABS: /^(?:\+(?:$|\s|\()|\s*\((?:ACRILONITRILO|ACRYLONITRILE)|[ -](?:ESD|CF|FR|HT|HYPER|CON|REFORZADO|ALTA|\+))/,
  ASA: /^(?:\+(?:$|\s|\()|\s*\(ACRILONITRILO|[ -](?:CON|ESPUMADO))/,
  HIPS: /^\s*\(HIGH IMPACT POLYSTYRENE\)/,
  PA: /^-(?:CF)(?:$|\s|\()/,
  PA6: /^(?:\s+NYLON\b|[ -](?:CF|GF)(?:$|[\s(]))/,
  PA12: /^(?:\s+NYLON\b|[ -](?:CF|GF)(?:$|[\s(]))/,
  PEBA: /^(?:-?90A(?:-LW)?)(?:$|\s)/,
  PETG: /^(?:\+\s*HS(?:$|\s|\()|\s*\((?:POLIETIL|TEREFTALATO)|[ -](?:ESD|MEJORADO|ALTA|HS|BASIC))/,
  PLA: /^(?:\+(?:$|\s+(?:\(|ALTA\b|CON\b|DE\b|RAPID\b)|\s*\((?:ÁCIDO\b|PLA\b|VERSIÓN\b))|\s*\(\s*Á?CIDO POLIL|\s+\+\s+MEZCLA|[ -](?:AERO|ALTA|BASE|BASIC|CON|FLEXIBLE|FOTOLUMINISCENTE|GALAXY|LITE|MATE|MATTE|METÁLICO|MEZCLA|MODIFICADO|RAPID|REFORZADO|SOFT))/,
  TPU: /^\s*\(POLIURETANO TERMOPLÁSTICO\)/,
};
const EXACT = new Set(['ABS', 'ASA', 'HIPS', 'PA', 'PA6', 'PA12', 'PC', 'PCL', 'PEBA', 'PET', 'PETG', 'PLA', 'PVA', 'TPE', 'TPU']);
export function canonicalMaterial(value) {
  if (typeof value !== 'string') return value;
  const label = value.trim().toUpperCase();
  if (EXACT.has(label)) return label;
  if (label === 'NYLON' || label === 'POLIAMIDA (NYLON PA)') return 'PA';
  if (/^NYLON PA6(?:$|\s+CON\b)/.test(label)) return 'PA6';
  for (const [family, modifier] of Object.entries(MODIFIERS)) {
    if (label.startsWith(family) && modifier.test(label.slice(family.length))) return family;
  }
  return label;
}
