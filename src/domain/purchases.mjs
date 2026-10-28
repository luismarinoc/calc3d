// Demo purchases represent acquisitions only; stock is not consumed until production is registered.
export const MAX_SPOOLS_PER_PURCHASE = 1000;

function text(value, field, required = false) {
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new TypeError(`${field} debe ser texto${required ? ' no vacío' : ''}.`);
  }
  return value;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export { validDate as isBusinessDate };

/** Validate and snapshot a business purchase, without creating identifiers or writing data. */
export function validatePurchase(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('La compra debe ser un objeto.');
  if (!validDate(input.date)) throw new TypeError('Fecha de compra inválida (YYYY-MM-DD).');
  const supplier = input.supplier;
  if (!supplier || typeof supplier !== 'object' || Array.isArray(supplier)) throw new TypeError('supplier debe ser un objeto.');
  const contact = {
    name: text(supplier.name, 'supplier.name', true),
    address: text(supplier.address ?? '', 'supplier.address'),
    phone: text(supplier.phone ?? '', 'supplier.phone'),
  };
  const notes = text(input.notes ?? '', 'notes');
  if (!Array.isArray(input.lines) || !input.lines.length) throw new TypeError('La compra requiere al menos una línea.');
  let total = 0;
  let spoolCount = 0;
  const lines = input.lines.map((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new TypeError(`lines[${index}] debe ser un objeto.`);
    const prefix = `lines[${index}]`;
    const descriptors = {
      material: text(line.material, `${prefix}.material`, true),
      brand: text(line.brand, `${prefix}.brand`, true),
      color: text(line.color, `${prefix}.color`, true),
    };
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new TypeError(`${prefix}.quantity debe ser un entero positivo seguro.`);
    if (spoolCount + line.quantity > MAX_SPOOLS_PER_PURCHASE) throw new RangeError(`Máximo ${MAX_SPOOLS_PER_PURCHASE} bobinas por compra.`);
    spoolCount += line.quantity;
    if (typeof line.netWeightGrams !== 'number' || !Number.isFinite(line.netWeightGrams) || line.netWeightGrams <= 0) throw new TypeError(`${prefix}.netWeightGrams debe ser un número finito positivo.`);
    if (!Number.isSafeInteger(line.purchasePrice) || line.purchasePrice < 0) throw new TypeError(`${prefix}.purchasePrice debe ser un entero CLP no negativo seguro.`);
    const lineTotal = line.quantity * line.purchasePrice;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) throw new RangeError('Total de compra fuera del rango seguro de CLP.');
    total += lineTotal;
    return { ...descriptors, quantity: line.quantity, netWeightGrams: line.netWeightGrams, purchasePrice: line.purchasePrice };
  });
  return { date: input.date, supplier: contact, notes, lines, total, spoolCount };
}
