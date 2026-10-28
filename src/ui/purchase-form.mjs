import { validatePurchase } from '../domain/purchases.mjs';

function numeric(value, label, integer = false) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label}: ingresa un número.`);
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) {
    throw new TypeError(`${label}: ingresa ${integer ? 'un entero seguro' : 'un número finito'}.`);
  }
  return number;
}

/** Pure draft -> domain preview. No IDs, persistence, or independently implemented business rules. */
export function mapPurchaseForm(draft) {
  return validatePurchase({
    date: draft.date,
    supplier: { name: draft.name, address: draft.address, phone: draft.phone },
    notes: draft.notes,
    lines: draft.lines.map((line, index) => ({
      material: line.material, brand: line.brand, color: line.color,
      quantity: numeric(line.quantity, `Línea ${index + 1}, cantidad`, true),
      netWeightGrams: numeric(line.netWeightGrams, `Línea ${index + 1}, peso neto`),
      purchasePrice: numeric(line.purchasePrice, `Línea ${index + 1}, precio por bobina`, true),
    })),
  });
}
