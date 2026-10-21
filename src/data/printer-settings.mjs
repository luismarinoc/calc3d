import { demoPrinter, validPrinterId, validatePrinterSettings } from '../domain/printer-settings.mjs';

const KEY = 'calc3d.printer.settings.v1';
const READ_ERROR = 'La configuración de impresoras no se puede leer; no se modificaron sus datos.';
const CONFLICT = 'La configuración de impresoras cambió en otra pestaña; recarga antes de guardar.';
const WRITE_ERROR = 'No se pudo guardar la configuración de impresoras en este navegador.';
const ID_ERROR = 'No se pudo generar un identificador único; intenta de nuevo.';
const UNKNOWN = 'Impresora desconocida.';
const copy = (value) => structuredClone(value);

function validStored(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      !Array.isArray(state.printers) || !state.printers.length || !validPrinterId(state.activeId)) return false;
  const ids = new Set();
  try {
    for (const printer of state.printers) {
      const normalized = validatePrinterSettings(printer);
      if (!validPrinterId(printer.id) || ids.has(printer.id) ||
          Object.keys(normalized).some((field) => printer[field] !== normalized[field])) return false;
      ids.add(printer.id);
    }
  } catch { return false; }
  return ids.has(state.activeId);
}

/** Browser-local prototype, not authenticated user storage or an atomic cross-tab transaction. */
export function createPrinterSettingsStore(storage, { id = () => crypto.randomUUID() } = {}) {
  let raw;
  let state;
  let error = null;
  try {
    raw = storage.getItem(KEY);
    state = raw === null ? { activeId: demoPrinter.id, printers: [copy(demoPrinter)] } : JSON.parse(raw);
    if (!validStored(state)) throw Error('invalid');
  } catch {
    error = READ_ERROR;
    state = null;
  }

  function persist(next) {
    try {
      // Best-effort changed-key detection only; localStorage provides no compare-and-swap.
      if (storage.getItem(KEY) !== raw) return { ok: false, error: CONFLICT };
    } catch { return { ok: false, error: READ_ERROR }; }
    try {
      const serialized = JSON.stringify(next);
      storage.setItem(KEY, serialized);
      raw = serialized;
      state = next;
      return { ok: true };
    } catch { return { ok: false, error: WRITE_ERROR }; }
  }

  return {
    get error() { return error; },
    snapshot() { return state === null ? null : copy(state); },
    createPrinter(input) {
      if (error) return { ok: false, error };
      let normalized;
      try { normalized = validatePrinterSettings(input); }
      catch (cause) { return { ok: false, error: cause.message }; }
      // Check for a changed key before consuming an ID, as in the existing purchase adapter.
      try { if (storage.getItem(KEY) !== raw) return { ok: false, error: CONFLICT }; }
      catch { return { ok: false, error: READ_ERROR }; }
      let printer;
      try {
        const token = id();
        const printerId = `printer-${token}`;
        if (typeof token !== 'string' || !validPrinterId(printerId) ||
            state.printers.some((item) => item.id === printerId)) return { ok: false, error: ID_ERROR };
        printer = { id: printerId, ...normalized };
      } catch { return { ok: false, error: ID_ERROR }; }
      const result = persist({ activeId: state.activeId, printers: [...state.printers, printer] });
      return result.ok ? { ok: true, printer: copy(printer) } : result;
    },
    updatePrinter(printerId, input) {
      if (error) return { ok: false, error };
      if (!state.printers.some((item) => item.id === printerId)) return { ok: false, error: UNKNOWN };
      let normalized;
      try { normalized = validatePrinterSettings(input); }
      catch (cause) { return { ok: false, error: cause.message }; }
      const printer = { id: printerId, ...normalized };
      const result = persist({ activeId: state.activeId,
        printers: state.printers.map((item) => item.id === printerId ? printer : item) });
      return result.ok ? { ok: true, printer: copy(printer) } : result;
    },
    activatePrinter(printerId) {
      if (error) return { ok: false, error };
      if (!state.printers.some((item) => item.id === printerId)) return { ok: false, error: UNKNOWN };
      return persist({ activeId: printerId, printers: state.printers });
    },
  };
}
