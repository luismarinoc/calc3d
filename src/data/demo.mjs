const KEY = 'calc3d.demo.quotes.v1';
const READ_ERROR = 'El historial de prueba no se puede leer; no se modificaron sus datos.';

// Only this adapter writes demo records. A failed read never initializes over unknown data.
export function createDemoHistory(storage, { now = () => new Date(), id = () => crypto.randomUUID() } = {}) {
  let records;
  let error = null;
  try {
    const raw = storage.getItem(KEY);
    const decoded = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(decoded) || !decoded.every((item) => item && typeof item.id === 'string' && typeof item.savedAt === 'string' && typeof item.title === 'string' && !Number.isNaN(Date.parse(item.savedAt)) && typeof item.spoolId === 'string' && item.form && typeof item.form === 'object' && item.input && ['sale', 'internal'].includes(item.input.purpose) && item.result && Number.isFinite(item.result.totalCost) && Number.isFinite(item.result.finalPrice))) throw Error('invalid');
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
    save(evaluated) {
      if (!evaluated?.result || evaluated.error || !evaluated.title || !evaluated.spoolId || !evaluated.input) return { ok: false, error: 'No se puede guardar un cálculo inválido.' };
      if (error) return { ok: false, error };
      try {
        const record = copy({ id: id(), savedAt: now().toISOString(), title: evaluated.title, spoolId: evaluated.spoolId, form: evaluated.form, input: evaluated.input, result: evaluated.result });
        if (records.some((item) => item.id === record.id)) return { ok: false, error: 'No se pudo generar un identificador único; intenta de nuevo.' };
        const next = [record, ...records];
        storage.setItem(KEY, JSON.stringify(next));
        records = next;
        return { ok: true, record: copy(record) };
      } catch {
        return { ok: false, error: 'No se pudo guardar en este navegador; el cálculo no quedó registrado.' };
      }
    },
  };
}
