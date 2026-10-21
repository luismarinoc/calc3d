import { normalizeClient } from '../domain/quote-client.mjs';

const KEY = 'calc3d.demo.quotes.v1';
const CONFLICT_ERROR = 'El historial cambió en otra pestaña; recarga la página antes de guardar.';
const numberValue = (number) => {
  if (typeof number !== 'string' || !/^COT-0*[1-9]\d*$/.test(number)) return null;
  const value = Number(number.slice(4));
  return Number.isSafeInteger(value) && value > 0 && number === `COT-${String(value).padStart(6, '0')}` ? value : null;
};
const READ_ERROR = 'El historial de prueba no se puede leer; no se modificaron sus datos.';
const validGift = (item) => item.input.purpose !== 'gift' || (item.form?.purpose === 'gift'
  && Number.isFinite(item.result.giftCost) && item.result.giftCost === item.result.totalCost
  && item.result.basePrice === 0 && item.result.finalPrice === 0 && item.result.commercialProfit === 0);

// Only this adapter writes demo records. A failed read never initializes over unknown data.
export function createDemoHistory(storage, { now = () => new Date(), id = () => crypto.randomUUID() } = {}) {
  let records;
  let loadedRaw;
  let error = null;
  try {
    loadedRaw = storage.getItem(KEY);
    const decoded = loadedRaw === null ? [] : JSON.parse(loadedRaw);
    if (!Array.isArray(decoded) || !decoded.every((item) => item && typeof item.id === 'string' && typeof item.savedAt === 'string' && typeof item.title === 'string' && !Number.isNaN(Date.parse(item.savedAt)) && typeof item.spoolId === 'string' && item.form && typeof item.form === 'object' && item.input && ['sale', 'internal', 'gift'].includes(item.input.purpose) && item.result && Number.isFinite(item.result.totalCost) && Number.isFinite(item.result.finalPrice) && validGift(item))) throw Error('invalid');
    const numbered = decoded.filter((item) => Object.hasOwn(item, 'number'));
    if (numbered.some((item) => numberValue(item.number) === null)
      || new Set(numbered.map((item) => item.number)).size !== numbered.length
      || decoded.some((item) => {
        if (!Object.hasOwn(item, 'client')) return false;
        const { client, error: clientError } = normalizeClient(item.client);
        return clientError || ['name', 'phone', 'email'].some((field) => item.client[field] !== client[field]);
      })) throw Error('invalid');
    records = decoded;
  } catch {
    error = READ_ERROR;
    records = [];
  }
  const copy = (item) => structuredClone(item);
  return {
    get error() { return error; },
    list() { return copy(records); },
    get(recordId) { const record = records.find((item) => item.id === recordId); return record ? copy(record) : null; },
    save(evaluated, clientFields = {}) {
      if (!evaluated?.result || evaluated.error || !evaluated.title || !evaluated.spoolId || !evaluated.input || !validGift(evaluated)) return { ok: false, error: 'No se puede guardar un cálculo inválido.' };
      if (error) return { ok: false, error };
      const { client, error: clientError } = normalizeClient(clientFields);
      if (clientError) return { ok: false, error: clientError };
      try {
        if (storage.getItem(KEY) !== loadedRaw) return { ok: false, error: CONFLICT_ERROR };
        const highest = records.reduce((max, item) => Math.max(max, numberValue(item.number) || 0), 0);
        if (highest >= Number.MAX_SAFE_INTEGER) return { ok: false, error: 'No se puede asignar otro número de cotización en este navegador.' };
        const record = copy({ id: id(), savedAt: now().toISOString(), number: `COT-${String(highest + 1).padStart(6, '0')}`, client, title: evaluated.title, spoolId: evaluated.spoolId, form: evaluated.form, input: evaluated.input, result: evaluated.result });
        if (records.some((item) => item.id === record.id)) return { ok: false, error: 'No se pudo generar un identificador único; intenta de nuevo.' };
        const next = [record, ...records];
        const raw = JSON.stringify(next);
        storage.setItem(KEY, raw);
        loadedRaw = raw;
        records = next;
        return { ok: true, record: copy(record) };
      } catch {
        return { ok: false, error: 'No se pudo guardar en este navegador; el cálculo no quedó registrado.' };
      }
    },
  };
}
