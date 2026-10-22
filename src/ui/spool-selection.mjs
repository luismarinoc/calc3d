/** A stored quote's material is a snapshot, never a live profile lookup. */
export function historicalSpool(record) {
  const spool = record?.input?.spool ?? record?.form;
  const purchasePrice = Number(spool?.purchasePrice);
  const netWeightGrams = Number(spool?.netWeightGrams);
  const id = record?.form?.spoolId || record?.spoolId;
  if (!id || !Number.isSafeInteger(purchasePrice) || purchasePrice < 0 ||
      !Number.isFinite(netWeightGrams) || netWeightGrams <= 0) return null;
  return { id, purchasePrice, netWeightGrams };
}

export function selectedSpool(catalog, id, historical = null) {
  if (historical && historical.id === id) return historical;
  return catalog.find(spool => spool.id === id) ?? null;
}
