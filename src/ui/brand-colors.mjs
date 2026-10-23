const identity = brand => (brand ?? '').trim().normalize('NFC').toLocaleLowerCase('es');

/** A brand's color depends only on its normalized identity, never on the loaded catalog. */
export function brandColors(brands) {
  const colors = new Map();
  for (const brand of brands) {
    const key = identity(brand);
    if (!key) { colors.set(brand, null); continue; }
    let hash = 2166136261;
    for (const character of key) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
    // Start at the accepted hash bucket, spreading former bucket collisions across
    // a bounded hue range. Close hues can still occur; catalog changes cannot recolor.
    const value = hash >>> 0;
    // eSun's hash hue nearly matches Creality's; reserve a clear blue for eSun only.
    const hue = key === 'esun' ? 250 : (value % 360 + (value / 2 ** 32) * 24) % 360;
    colors.set(brand, `oklch(69% 0.15 ${hue.toFixed(6)})`);
  }
  return colors;
}
