const identity = brand => (brand ?? '').trim().normalize('NFC').toLocaleLowerCase('es');

/** Assign one reproducible hue per visible brand; probe occupied hues rather than trusting hash buckets. */
export function brandColors(brands) {
  const keys = [...new Set(brands.map(identity))].filter(Boolean).sort();
  const hues = new Map();
  const occupied = new Set();
  for (const key of keys) {
    let hash = 2166136261;
    for (const character of key) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
    let hue = (hash >>> 0) % 360;
    while (occupied.has(hue)) hue = (hue + 137) % 360;
    occupied.add(hue);
    hues.set(key, `oklch(69% 0.15 ${hue})`);
  }
  return new Map(brands.map(brand => [brand, hues.get(identity(brand)) ?? null]));
}
