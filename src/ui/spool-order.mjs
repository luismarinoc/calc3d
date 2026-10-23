const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Return a separate list for display; catalog and repository ordering remain authoritative. */
export function orderSpoolsForDisplay(items) {
  return [...items].sort((a, b) =>
    collator.compare(a.material, b.material) ||
    collator.compare(a.name ?? a.label ?? '', b.name ?? b.label ?? '') ||
    collator.compare(a.id, b.id));
}
