import { demoSpools } from './quote.mjs';

/** Build a detached calculator catalog from validated purchaseStore.listSpools() output. */
export function buildSpoolCatalog(purchasedSpools) {
  return [
    ...demoSpools.map((spool) => ({ ...spool })),
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
  ];
}
