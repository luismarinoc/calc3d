import { normalizeClient } from '../domain/quote-client.mjs';
import { demoPrinter, validPrinterId, validatePrinterSettings } from '../domain/printer-settings.mjs';
import { validatePurchase } from '../domain/purchases.mjs';
import { validateSpoolProfile } from '../domain/spool-profiles.mjs';
import { normalizeBrandName, validateBrand } from '../domain/brands.mjs';
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
const validProfileId = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const invalidProfile = () => { throw new Error('Respuesta remota inválida del perfil de bobina.'); };
const CONTROL_PROFILE = /[\p{Cc}\p{Cf}]/u;
// The DB constraint is authoritative; omit malformed remote metadata rather than rendering a destination.
const OFFICIAL_PRODUCT = /^https:\/\/www\.todotoner\.cl\/impresoras\/impresoras-3d\/filamentos\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/?$/;
const safeSourceUrl = value => typeof value === 'string' && value.length <= 2048 &&
  value === value.trim() && !CONTROL_PROFILE.test(value) && OFFICIAL_PRODUCT.test(value);
const archiveTime = row => {
  const time = row.archived_at === undefined ? null : row.archived_at;
  if (time !== null && (typeof time !== 'string' || !Number.isFinite(Date.parse(time)))) {
    throw new Error('Respuesta remota inválida del archivo.');
  }
  return time;
};
const validArchiveTarget = (id, expectedRevision, label) => {
  if (!validProfileId(id)) throw new TypeError(`Identificador de ${label} inválido.`);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError(`La revisión de ${label} debe ser un entero positivo válido.`);
  }
};
const profile = row => {
  if (!row || !validProfileId(row.id) || !Number.isSafeInteger(row.revision) || row.revision <= 0 ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
      typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at)) ||
      typeof row.net_weight_grams !== 'number' &&
        (typeof row.net_weight_grams !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.net_weight_grams)) ||
      !Number.isSafeInteger(row.purchase_price)) invalidProfile();
  const weight = Number(row.net_weight_grams);
  let data;
  try {
    data = validateSpoolProfile({ name: row.name, material: row.material, brand: row.brand,
      purchasePrice: row.purchase_price, netWeightGrams: weight });
  } catch { invalidProfile(); }
  if (data.name !== row.name || data.material !== row.material || data.brand !== row.brand) invalidProfile();
  // Missing columns in older response mocks are treated as the legacy empty presentation.
  const brandId = row.brand_id === undefined ? null : row.brand_id;
  const filamentColor = row.filament_color === undefined ? '' : row.filament_color;
  const filamentColorHex = row.filament_color_hex === undefined ? null : row.filament_color_hex;
  if ((brandId !== null && !validProfileId(brandId)) || typeof filamentColor !== 'string' ||
      CONTROL_PROFILE.test(filamentColor) || filamentColor !== filamentColor.trim() ||
      [...filamentColor].length > 120 || (filamentColorHex !== null &&
      (typeof filamentColorHex !== 'string' || !/^#[0-9A-F]{6}$/.test(filamentColorHex))) ||
      (!filamentColor && filamentColorHex)) invalidProfile();
  return { id: row.id, ...data, brandId, filamentColor, filamentColorHex,
    ...(safeSourceUrl(row.source_url) ? { sourceUrl: row.source_url } : {}),
    revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: archiveTime(row) };
};

const invalidBrand = () => { throw new Error('Respuesta remota inválida de la marca.'); };
const brand = row => {
  if (!row || !validProfileId(row.id) || !Number.isSafeInteger(row.revision) || row.revision <= 0 ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
      typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at)) ||
      typeof row.normalized_name !== 'string' || !Array.isArray(row.aliases) ||
      row.aliases.length < 1 || !row.aliases.every(key => typeof key === 'string' && key && key === normalizeBrandName(key)) ||
      new Set(row.aliases).size !== row.aliases.length ||
      !row.aliases.includes(row.normalized_name) ||
      (row.color !== null && (typeof row.color !== 'string' || !/^#[0-9A-F]{6}$/.test(row.color)))) invalidBrand();
  if (typeof row.name !== 'string' || !normalizeBrandName(row.name) ||
      normalizeBrandName(row.name) !== row.normalized_name) invalidBrand();
  // Pre-existing purchase text can exceed the editable-name limit or contain controls.
  // The RPC validates all new saves; legacy null-color rows retain their original spelling.
  if (row.color !== null) {
    let name;
    try { name = validateBrand({ name: row.name, color: row.color }).name; }
    catch { invalidBrand(); }
    if (name !== row.name) invalidBrand();
  }
  return { id: row.id, name: row.name, normalizedName: row.normalized_name, color: row.color,
    aliases: [...row.aliases], revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    archivedAt: archiveTime(row) };
};

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
  const brands = {
    async list() {
      return copy((await read('calc3d_brands',
        'id,name,normalized_name,color,aliases,revision,created_at,updated_at,archived_at')).map(brand));
    },
    async createBrand(input) {
      const payload = validateBrand(input);
      const row = await saveBrand(payload, null, 0);
      if (row.revision !== 1 || row.normalizedName !== normalizeBrandName(payload.name) || row.color !== payload.color) invalidBrand();
      return { ok: true, brand: copy(row) };
    },
    async archiveBrand(id, expectedRevision) {
      validArchiveTarget(id, expectedRevision, 'marca');
      let row;
      try { row = brand(await write('calc3d_archive_brand', { brand_id: id, expected_revision: expectedRevision })); }
      catch (error) {
        if (error?.code === '40001') throw new Error('La marca cambió; recarga antes de guardar.');
        throw error;
      }
      if (row.id.toLowerCase() !== id.toLowerCase() || row.revision !== expectedRevision + 1 || !row.archivedAt) invalidBrand();
      return { ok: true, brand: copy(row) };
    },
    async updateBrand(id, input, expectedRevision) {
      if (!validProfileId(id)) throw new TypeError('Identificador de marca inválido.');
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
        throw new TypeError('La revisión de marca debe ser un entero positivo válido.');
      }
      const payload = validateBrand(input);
      const row = await saveBrand(payload, id, expectedRevision);
      if (row.id.toLowerCase() !== id.toLowerCase() || row.revision !== expectedRevision + 1 ||
          row.normalizedName !== normalizeBrandName(payload.name) || row.color !== payload.color) invalidBrand();
      return { ok: true, brand: copy(row) };
    },
  };
  async function saveBrand(payload, id, expectedRevision) {
    let row;
    try { row = await write('calc3d_save_brand', { payload, brand_id: id, expected_revision: expectedRevision }); }
    catch (error) {
      if (error?.code === '40001') throw new Error('La marca cambió; recarga antes de guardar.');
      throw error;
    }
    return brand(row);
  }
  const spoolProfiles = {
    async list() {
      return copy((await read('calc3d_spool_profiles',
        'id,name,material,brand,brand_id,filament_color,filament_color_hex,source_url,purchase_price,net_weight_grams,revision,created_at,updated_at,archived_at')).map(profile));
    },
    async createProfile(input) {
      const payload = validateSpoolProfile(input);
      const row = await saveProfile(payload, null, 0);
      if (row.revision !== 1) invalidProfile();
      return { ok: true, profile: copy(row) };
    },
    async archiveProfile(id, expectedRevision) {
      validArchiveTarget(id, expectedRevision, 'bobina');
      let row;
      try { row = profile(await write('calc3d_archive_spool_profile', { profile_id: id, expected_revision: expectedRevision })); }
      catch (error) {
        if (error?.code === '40001') throw new Error('El perfil de bobina cambió; recarga antes de guardar.');
        throw error;
      }
      if (row.id.toLowerCase() !== id.toLowerCase() || row.revision !== expectedRevision + 1 || !row.archivedAt) invalidProfile();
      return { ok: true, profile: copy(row) };
    },
    async updateProfile(id, input, expectedRevision) {
      if (!validProfileId(id)) throw new TypeError('Identificador de bobina inválido.');
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
        throw new TypeError('La revisión de bobina debe ser un entero positivo válido.');
      }
      const payload = validateSpoolProfile(input);
      const row = await saveProfile(payload, id, expectedRevision);
      if (row.id.toLowerCase() !== id.toLowerCase() || row.revision !== expectedRevision + 1) invalidProfile();
      return { ok: true, profile: copy(row) };
    },
  };
  async function saveProfile(payload, id, expectedRevision) {
    let row;
    try {
      row = await write('calc3d_save_spool_profile', { payload, profile_id: id, expected_revision: expectedRevision });
    } catch (error) {
      if (error?.code === '40001') throw new Error('El perfil de bobina cambió; recarga antes de guardar.');
      throw error;
    }
    return profile(row);
  }
  return {
    spoolProfiles,
    brands,
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
