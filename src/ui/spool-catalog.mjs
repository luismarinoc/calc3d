import { presentSpools } from './brand-display.mjs';

/** Build a detached owned calculator catalog from validated profile and purchase lists. */
export function buildSpoolCatalog(purchasedSpools, profiles = [], brands = []) {
  return presentSpools([
    ...profiles.map(profile => ({
      id: `profile:${profile.id}`,
      label: [profile.name, profile.material, profile.brand].filter(Boolean).join(' · '),
      name: profile.name, material: profile.material, brand: profile.brand, brandId: profile.brandId ?? null,
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
  ], brands);
}
