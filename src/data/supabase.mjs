import { normalizeClient } from '../domain/quote-client.mjs';
import { demoPrinter, validPrinterId, validatePrinterSettings } from '../domain/printer-settings.mjs';
import { validatePurchase } from '../domain/purchases.mjs';
import { normalizeRow, createAccessService } from '../auth/access.mjs';

const copy = value => structuredClone(value);
const missing = () => { throw new Error('No se pudo guardar: el servidor no devolvió un registro.'); };
const rows = result => {
  if (result.error) throw result.error;
  if (!Array.isArray(result.data)) throw new Error('Respuesta remota inválida. Recarga e intenta nuevamente.');
  return result.data;
};
const saved = result => {
  if (result.error) throw result.error;
  return normalizeRow(result.data) ?? missing();
};
const quote = row => ({ id: row.id, savedAt: row.saved_at, number: row.number,
  client: row.client, title: row.title, spoolId: row.spool_id, form: row.form,
  input: row.input, result: row.result });
const purchase = row => ({ id: row.id, createdAt: row.created_at, date: row.purchase_date,
  supplier: row.supplier, notes: row.notes, lines: row.lines, total: row.total,
  spoolCount: row.spool_count });
const spool = row => ({ id: row.id, purchaseId: row.purchase_id, date: row.purchase_date,
  supplier: row.supplier, material: row.material, brand: row.brand, color: row.color,
  purchasePrice: row.purchase_price, netWeightGrams: Number(row.net_weight_grams),
  remainingGrams: Number(row.remaining_grams) });
const defaultState = () => ({ activeId: demoPrinter.id, printers: [copy(demoPrinter)] });

/** Each repository belongs to one authenticated identity. Every operation rechecks admission
 * before touching protected data; the database RLS/RPC remains the authorization authority. */
export function createRemoteRepositories(client, session, accessService = createAccessService(client)) {
  const owner = session?.user?.id;
  if (!owner) throw new Error('Se requiere una sesión autenticada.');
  async function guard() {
    const result = await accessService.requireAccess();
    if (result.session?.user?.id !== owner) throw new Error('La cuenta cambió; vuelve a iniciar sesión.');
    if (!result.access?.allowed) throw new Error('Acceso denegado o desactivado. Vuelve a iniciar sesión.');
  }
  const read = async (table, columns, order) => {
    await guard();
    let query = client.from(table).select(columns);
    if (order) query = query.order(order, { ascending: false });
    const data = rows(await query);
    await guard();
    return data;
  };
  const write = async (name, args) => {
    await guard();
    const row = saved(await client.rpc(name, args));
    await guard();
    return row;
  };
  let printerState = null;
  let revision = null;
  const printers = {
    async load() {
      const data = await read('calc3d_printer_settings', 'revision,state');
      if (data.length > 1) throw new Error('Configuración remota inválida.');
      const row = data[0];
      const state = row ? row.state : defaultState();
      if (!state || !Array.isArray(state.printers) || !state.printers.length ||
          !validPrinterId(state.activeId) || !state.printers.some(p => p.id === state.activeId) ||
          new Set(state.printers.map(p => p.id)).size !== state.printers.length) throw new Error('Configuración remota inválida.');
      for (const p of state.printers) { if (!validPrinterId(p.id)) throw new Error('Configuración remota inválida.'); validatePrinterSettings(p); }
      revision = row?.revision ?? 0;
      printerState = copy(state);
      return copy(state);
    },
    async snapshot() { await guard(); return printerState ? copy(printerState) : null; },
    async persist(next) {
      await guard();
      if (!printerState) throw new Error('Recarga la configuración antes de guardar.');
      const data = await read('calc3d_printer_settings', 'revision,state');
      if (data.length > 1 || (data[0]?.revision ?? 0) !== revision) throw new Error('La configuración de impresoras cambió; recarga antes de guardar.');
      const row = await write('calc3d_save_printers', { payload: next, expected_revision: revision });
      if (!Number.isSafeInteger(row.revision) || row.revision !== revision + 1 || !row.state) missing();
      revision = row.revision;
      printerState = copy(row.state);
      return copy(printerState);
    },
    async createPrinter(input) {
      const normalized = validatePrinterSettings(input);
      await guard();
      if (!printerState) throw new Error('Recarga la configuración antes de guardar.');
      const printer = { id: `printer-${crypto.randomUUID()}`, ...normalized };
      await printers.persist({ ...printerState, printers: [...printerState.printers, printer] });
      return { ok: true, printer: copy(printer) };
    },
    async updatePrinter(id, input) {
      const normalized = validatePrinterSettings(input);
      await guard();
      if (!printerState?.printers.some(p => p.id === id)) throw new Error('Impresora desconocida.');
      const printer = { id, ...normalized };
      await printers.persist({ ...printerState, printers: printerState.printers.map(p => p.id === id ? printer : p) });
      return { ok: true, printer: copy(printer) };
    },
    async activatePrinter(id) {
      await guard();
      if (!printerState?.printers.some(p => p.id === id)) throw new Error('Impresora desconocida.');
      await printers.persist({ ...printerState, activeId: id });
      return { ok: true };
    },
  };
  return {
    quotes: {
      async list() { return copy((await read('calc3d_quotes', 'id,saved_at,number,client,title,spool_id,form,input,result', 'saved_at')).map(quote)); },
      async get(id) { return (await this.list()).find(item => item.id === id) ?? null; },
      async save(evaluated, clientFields = {}) {
        if (!evaluated?.result || evaluated.error || !evaluated.title || !evaluated.spoolId || !evaluated.input || !evaluated.form) throw new Error('No se puede guardar un cálculo inválido.');
        const normalized = normalizeClient(clientFields);
        if (normalized.error) throw new Error(normalized.error);
        const row = await write('calc3d_save_quote', { payload: { title: evaluated.title, spoolId: evaluated.spoolId,
          form: evaluated.form, input: evaluated.input, result: evaluated.result, client: normalized.client } });
        if (!row.id || !row.number || !row.saved_at) missing();
        return { ok: true, record: copy(quote(row)) };
      },
    },
    printers,
    purchases: {
      async listPurchases() { return copy((await read('calc3d_purchases', 'id,created_at,purchase_date,supplier,notes,lines,total,spool_count', 'created_at')).map(purchase)); },
      async listSpools() { return copy((await read('calc3d_spools', 'id,purchase_id,purchase_date,supplier,material,brand,color,purchase_price,net_weight_grams,remaining_grams', 'id')).map(spool)); },
      async savePurchase(input) {
        await guard();
        const normalized = validatePurchase(input);
        const row = await write('calc3d_save_purchase', { payload: normalized });
        if (!row.id || !row.created_at || !row.purchase_date) missing();
        return { ok: true, record: copy(purchase(row)) };
      },
    },
  };
}
