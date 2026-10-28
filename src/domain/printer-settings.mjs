// Installed-printer identities belong to settings, not the model-template catalog.
export const demoPrinter = Object.freeze({
  id: 'demo-printer-p2s', name: 'Bambu Lab P2S (de ejemplo)', modelId: 'p2s',
  watts: 130, electricityPricePerKwh: 215, replacementCost: 220000,
  replacementLifetimeHours: 4320,
});

const MAX_TEXT = 120;
const validId = (value) => typeof value === 'string' && value.length <= MAX_TEXT &&
  /^(?:demo-printer-p2s|printer-[a-zA-Z0-9_-]+)$/.test(value);
export { validId as validPrinterId };

/** Validate before requesting an instance ID or touching persistent state. */
export function validatePrinterSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('La impresora debe ser un objeto.');
  const text = (value, label) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_TEXT || /[\x00-\x1f\x7f]/.test(value)) {
      throw new TypeError(`${label} debe ser texto no vacío de hasta ${MAX_TEXT} caracteres sin caracteres de control.`);
    }
    return value.trim();
  };
  const number = (value, label, positive = false, integer = false) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < (positive ? Number.MIN_VALUE : 0) ||
        value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) {
      throw new TypeError(`${label} debe ser un número ${integer ? 'entero seguro ' : 'finito '} ${positive ? 'positivo' : 'no negativo'} dentro del rango seguro.`);
    }
    return value;
  };
  return {
    name: text(input.name, 'name'), modelId: text(input.modelId, 'modelId'),
    watts: number(input.watts, 'watts'),
    electricityPricePerKwh: number(input.electricityPricePerKwh, 'electricityPricePerKwh'),
    replacementCost: number(input.replacementCost, 'replacementCost', false, true),
    replacementLifetimeHours: number(input.replacementLifetimeHours, 'replacementLifetimeHours', true),
  };
}
