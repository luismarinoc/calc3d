const MAX_TEXT = 120;
const CONTROL = /[\p{Cc}\p{Cf}]/u;

/** Normalize a presentation before sending it to the storage RPC. */
export function validateSpoolProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('La bobina debe ser un objeto.');
  const text = (value, label, required) => {
    if (typeof value !== 'string' || CONTROL.test(value)) throw new TypeError(`${label} debe ser texto sin caracteres de control.`);
    const normalized = value.trim();
    if ((required && !normalized) || [...normalized].length > MAX_TEXT) {
      throw new TypeError(`${label} debe tener ${required ? 'entre 1 y' : 'hasta'} ${MAX_TEXT} caracteres.`);
    }
    return normalized;
  };
  const name = text(input.name, 'El nombre', true);
  const material = text(input.material, 'El material', true);
  const brand = text(input.brand === undefined ? '' : input.brand, 'La marca', false);
  if (!Number.isSafeInteger(input.purchasePrice) || input.purchasePrice < 0) {
    throw new TypeError('El precio de compra debe ser un entero CLP no negativo seguro.');
  }
  if (typeof input.netWeightGrams !== 'number' || !Number.isFinite(input.netWeightGrams) ||
      input.netWeightGrams <= 0 || input.netWeightGrams > Number.MAX_SAFE_INTEGER) {
    throw new TypeError('El peso neto en gramos debe ser finito, positivo y dentro del rango seguro.');
  }
  return { name, material, brand, purchasePrice: input.purchasePrice, netWeightGrams: input.netWeightGrams };
}
