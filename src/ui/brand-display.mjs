import { normalizeBrandName } from '../domain/brands.mjs';

/** Display-only projection. Neither catalog identity nor stored historical acquisition text is rewritten. */
export function presentSpools(items, brands = []) {
  const byId = new Map(brands.map(brand => [brand.id, brand]));
  const byAlias = new Map(brands.flatMap(brand => brand.aliases.map(alias => [alias, brand])));
  return items.map(item => {
    const match = item.brandId ? byId.get(item.brandId) : byAlias.get(normalizeBrandName(item.brand ?? ''));
    const brand = match?.name ?? item.brand ?? '';
    const filamentColor = item.filamentColor ?? '';
    const projected = { ...item, brand, brandColor: match?.color ?? null,
      filamentColor, filamentColorHex: item.filamentColorHex ?? null };
    if (item.purchaseId) {
      projected.label = `${item.material} · ${brand} · ${item.color} · ${item.date} · compra de prueba · bobina ${item.spoolId}`;
    } else {
      projected.label = [item.name, item.material, brand, filamentColor].filter(Boolean).join(' · ');
    }
    return projected;
  });
}
