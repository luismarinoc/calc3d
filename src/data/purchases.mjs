import { validatePurchase } from '../domain/purchases.mjs';

const KEY = 'calc3d.demo.purchases.v1';
const READ_ERROR = 'Las compras de prueba no se pueden leer; no se modificaron sus datos.';
const ID_ERROR = 'No se pudo generar un identificador único; intenta de nuevo.';
const CONFLICT = 'Las compras cambiaron en otra pestaña; recarga antes de guardar.';
const WRITE_ERROR = 'No se pudo guardar en este navegador; la compra no quedó registrada.';
const copy = (value) => structuredClone(value);

function spoolFor(line, purchase, id) {
  return { id, purchaseId: purchase.id, date: purchase.date, supplier: copy(purchase.supplier),
    material: line.material, brand: line.brand, color: line.color, purchasePrice: line.purchasePrice,
    netWeightGrams: line.netWeightGrams, remainingGrams: line.netWeightGrams };
}

function validStored(records) {
  if (!Array.isArray(records)) return false;
  const ids = new Set();
  try {
    for (const record of records) {
      const normalized = validatePurchase(record);
      if (typeof record.id !== 'string' || !record.id.trim() || ids.has(record.id) ||
          typeof record.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.createdAt) ||
          !Number.isFinite(Date.parse(record.createdAt)) ||
          new Date(record.createdAt).toISOString() !== record.createdAt ||
          record.total !== normalized.total || record.spoolCount !== normalized.spoolCount ||
          JSON.stringify(record.supplier) !== JSON.stringify(normalized.supplier) ||
          JSON.stringify(record.lines) !== JSON.stringify(normalized.lines) ||
          record.notes !== normalized.notes || !Array.isArray(record.spools) || record.spools.length !== normalized.spoolCount) return false;
      ids.add(record.id);
      let index = 0;
      for (const line of normalized.lines) for (let n = 0; n < line.quantity; n++) {
        const spool = record.spools[index++];
        if (!spool || typeof spool.id !== 'string' || !spool.id.trim() || ids.has(spool.id) ||
            JSON.stringify(spool) !== JSON.stringify(spoolFor(line, record, spool.id))) return false;
        ids.add(spool.id);
      }
    }
    return true;
  } catch { return false; }
}

/** Separate browser-local demo store. Not a concurrent database or production transaction. */
export function createPurchaseStore(storage, { now = () => new Date(), id = () => crypto.randomUUID() } = {}) {
  let raw;
  let records;
  let error = null;
  try {
    raw = storage.getItem(KEY);
    records = raw === null ? [] : JSON.parse(raw);
    if (!validStored(records)) throw Error('invalid');
  } catch {
    error = READ_ERROR;
    records = [];
  }
  return {
    get error() { return error; },
    listPurchases() { return copy(records); },
    getPurchase(recordId) { const found = records.find((item) => item.id === recordId); return found ? copy(found) : null; },
    listSpools() { return copy(records.flatMap((record) => record.spools)); },
    savePurchase(input) {
      if (error) return { ok: false, error };
      let normalized;
      try { normalized = validatePurchase(input); }
      catch (cause) { return { ok: false, error: cause.message }; }
      try {
        // Best-effort changed-key detection; localStorage has no compare-and-swap.
        if (storage.getItem(KEY) !== raw) return { ok: false, error: CONFLICT };
      } catch { return { ok: false, error: READ_ERROR }; }
      try {
        const used = new Set(records.flatMap((record) => [record.id, ...record.spools.map((spool) => spool.id)]));
        const purchaseId = id();
        if (typeof purchaseId !== 'string' || !purchaseId.trim() || used.has(purchaseId)) return { ok: false, error: ID_ERROR };
        used.add(purchaseId);
        const record = { id: purchaseId, createdAt: now().toISOString(), ...normalized, spools: [] };
        for (const line of normalized.lines) for (let n = 0; n < line.quantity; n++) {
          const spoolId = id();
          if (typeof spoolId !== 'string' || !spoolId.trim() || used.has(spoolId)) return { ok: false, error: ID_ERROR };
          used.add(spoolId);
          record.spools.push(spoolFor(line, record, spoolId));
        }
        const next = [record, ...records];
        const serialized = JSON.stringify(next);
        storage.setItem(KEY, serialized);
        raw = serialized;
        records = next;
        return { ok: true, record: copy(record) };
      } catch { return { ok: false, error: WRITE_ERROR }; }
    },
  };
}
