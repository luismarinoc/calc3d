import { validatePrint } from '../domain/prints.mjs';
import { createPurchaseStore } from './purchases.mjs';

const KEY = 'calc3d.demo.prints.v1';
const READ_ERROR = 'Las impresiones de prueba no se pueden leer; no se modificaron sus datos.';
const SOURCE_ERROR = 'No se pueden leer las bobinas adquiridas; no se modificaron los datos.';
const ID_ERROR = 'No se pudo generar un identificador único; intenta de nuevo.';
const CONFLICT = 'Las impresiones cambiaron en otra pestaña; recarga antes de guardar.';
const WRITE_ERROR = 'No se pudo guardar en este navegador; la impresión no quedó registrada.';
const copy = structuredClone;

// Exact decimal arithmetic on the shortest decimal representations of finite JS numbers.
// Number output is for display; all stock comparisons use scaled BigInt coefficients.
function decimal(number) {
  const [mantissa, exp = '0'] = number.toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = whole + fraction;
  const places = fraction.length - Number(exp);
  return places < 0 ? { value: BigInt(digits) * 10n ** BigInt(-places), scale: 0 } :
    { value: BigInt(digits), scale: places };
}
function subtract(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { value: a.value * 10n ** BigInt(scale - a.scale) - b.value * 10n ** BigInt(scale - b.scale), scale };
}
function grams(balance) { return Number(`${balance.value}e-${balance.scale}`); }
function timestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function source(storage, purchaseStore) {
  try {
    if (purchaseStore?.error || typeof purchaseStore?.listSpools !== 'function') throw Error('purchase unavailable');
    const supplied = purchaseStore.listSpools();
    // Reopen the purchase key on every operation: the supplied store may have a stale tab snapshot.
    const current = createPurchaseStore(storage);
    if (current.error || !Array.isArray(supplied) || JSON.stringify(supplied) !== JSON.stringify(current.listSpools())) throw Error('purchase changed');
    const spools = current.listSpools();
    const ids = new Set();
    for (const spool of spools) {
      if (!spool || typeof spool.id !== 'string' || !spool.id.trim() || ids.has(spool.id) ||
          typeof spool.purchaseId !== 'string' || !spool.purchaseId.trim()) throw Error('bad spool');
      ids.add(spool.id);
    }
    return { spools };
  } catch { return { error: SOURCE_ERROR }; }
}
function balances(records, spools) {
  const remaining = new Map(spools.map((spool) => [spool.id, decimal(spool.netWeightGrams)]));
  const ids = new Set(); const submissions = new Set();
  for (const record of records) {
    const spool = spools.find((item) => item.id === record?.spoolId);
    if (!spool || !timestamp(record.createdAt) || typeof record.id !== 'string' || !record.id.trim() ||
        ids.has(record.id) || submissions.has(record.submissionId)) throw Error('invalid print');
    const normalized = validatePrint(record, spool);
    if (JSON.stringify(record) !== JSON.stringify({ id: record.id, createdAt: record.createdAt, ...normalized })) throw Error('invalid snapshot');
    ids.add(record.id); submissions.add(record.submissionId);
    const balance = subtract(remaining.get(spool.id), decimal(record.actualGrams));
    if (balance.value < 0n) throw Error('negative stock');
    remaining.set(spool.id, balance);
  }
  return remaining;
}

/** Explicit browser-local demo log; no atomic compare-and-swap or server transaction. */
export function createPrintStore(storage, { purchaseStore, now = () => new Date(), id = () => crypto.randomUUID() } = {}) {
  let raw, records, error = null;
  try {
    raw = storage.getItem(KEY);
    records = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(records)) throw Error('invalid');
  } catch { error = READ_ERROR; records = []; }
  function state() {
    if (error) return { error };
    const acquired = source(storage, purchaseStore);
    if (acquired.error) return acquired;
    try { return { ...acquired, remaining: balances(records, acquired.spools) }; }
    catch { return { error: READ_ERROR }; }
  }
  // Corrupt stored prints remain read-only for the life of this instance.
  const initial = state();
  if (initial.error === READ_ERROR) error = READ_ERROR;
  return {
    get error() { return error ?? state().error ?? null; },
    listPrints() { const current = state(); return current.error ? { ok: false, error: current.error } : { ok: true, records: copy(records) }; },
    getPrint(recordId) { const current = state(); return current.error ? { ok: false, error: current.error } :
      { ok: true, record: copy(records.find((record) => record.id === recordId) ?? null) }; },
    listInventory() { const current = state(); return current.error ? { ok: false, error: current.error } :
      { ok: true, inventory: copy(current.spools.map((spool) => ({ ...spool, remainingGrams: grams(current.remaining.get(spool.id)) }))) }; },
    savePrint(input) {
      const current = state();
      if (current.error) return { ok: false, error: current.error };
      let normalized;
      try {
        const spool = current.spools.find((item) => item.id === input?.spoolId);
        if (!spool && input?.spoolId) throw new TypeError('Bobina adquirida no encontrada.');
        normalized = validatePrint(input, spool);
        if (records.some((record) => record.submissionId === normalized.submissionId)) throw new TypeError('Esta confirmación ya fue registrada.');
        if (subtract(current.remaining.get(spool.id), decimal(normalized.actualGrams)).value < 0n) throw new RangeError('Stock insuficiente en la bobina seleccionada.');
      } catch (cause) { return { ok: false, error: cause.message }; }
      try { if (storage.getItem(KEY) !== raw) return { ok: false, error: CONFLICT }; }
      catch { return { ok: false, error: READ_ERROR }; }
      let record;
      try {
        const recordId = id();
        if (typeof recordId !== 'string' || !recordId.trim() || records.some((item) => item.id === recordId)) return { ok: false, error: ID_ERROR };
        const createdAt = now().toISOString();
        if (!timestamp(createdAt)) throw Error('invalid clock');
        record = { id: recordId, createdAt, ...normalized };
        const next = [record, ...records];
        storage.setItem(KEY, JSON.stringify(next));
        raw = JSON.stringify(next);
        records = next;
        return { ok: true, record: copy(record) };
      } catch { return { ok: false, error: WRITE_ERROR }; }
    },
  };
}
