import { presentSpools } from './brand-display.mjs';

/** Keep purchase aliases in the purchaser's brand namespace; catalog profiles
 * resolve by their stored owner/brand identity without changing private snapshots. */
export function buildSpoolCatalog(purchasedSpools, profiles = [], brands = [], baseProfiles = [], purchaserId = null) {
  const brandScope = ownerId => ownerId ? brands.filter(brand => brand.ownerId === ownerId) : brands;
  return [
    ...[...profiles, ...baseProfiles.filter(row => row.source === 'base' && row.id?.startsWith('base:') && row.status !== 'pending')]
      .filter(profile => !profile.archivedAt).map(profile => ({
      id: profile.source === 'base' ? profile.id : `profile:${profile.id}`,
      label: [profile.name, profile.material, profile.brand].filter(Boolean).join(' · '),
      name: profile.name, material: profile.material, brand: profile.brand, brandId: profile.brandId ?? null,
      ...(profile.ownerId ? { ownerId: profile.ownerId } : {}),
      filamentColor: profile.filamentColor ?? '', filamentColorHex: profile.filamentColorHex ?? null,
      purchasePrice: profile.purchasePrice, netWeightGrams: profile.netWeightGrams,
    })),
    ...purchasedSpools.map((spool) => ({
      id: `purchase:${spool.id}`,
      spoolId: spool.id,
      purchaseId: spool.purchaseId,
      date: spool.date,
      material: spool.material,
      brand: spool.brand,
      color: spool.color,
      label: `${spool.material} · ${spool.brand} · ${spool.color} · ${spool.date} · compra de prueba · bobina ${spool.id}`,
      purchasePrice: spool.purchasePrice,
      netWeightGrams: spool.netWeightGrams,
      initialAcquiredGrams: spool.netWeightGrams,
    })),
  ].map(item => presentSpools([item], brandScope(item.ownerId ?? purchaserId))[0]);
}
