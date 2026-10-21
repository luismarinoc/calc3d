import { calculateQuote } from '../domain/costs.mjs';
import { calculateReferenceQuote } from '../domain/reference-costs.mjs';

// Invented demonstration material, not stock or a purchase.
export const demoSpools = [
  { id: 'demo-petg', label: 'PETG grafito · bobina ficticia A', purchasePrice: 21900, netWeightGrams: 1000 },
  { id: 'demo-pla', label: 'PLA arena · bobina ficticia B', purchasePrice: 18400, netWeightGrams: 1000 },
];

const fields = {
  purchasePrice: ['Precio de compra', 0], netWeightGrams: ['Peso neto', 0.000001],
  grams: ['Gramos consumidos', 0], hours: ['Horas', 0], minutes: ['Minutos', 0],
  watts: ['Potencia estimada', 0], electricityPricePerKwh: ['Tarifa eléctrica', 0],
  depreciationPerHour: ['Depreciación', 0], maintenancePerHour: ['Mantención', 0],
  laborMinutes: ['Tiempo de trabajo', 0], laborRatePerHour: ['Tarifa de trabajo', 0],
  extraProductionCost: ['Otros costos de producción', 0], markupPercent: ['Ganancia sobre costo', 0],
  discountValue: ['Descuento', 0], surchargeValue: ['Recargo', 0],
};

// Optional catalog accepts validated purchased spools alongside demos; omitted calls retain legacy behavior.
export function evaluate(form, catalog = demoSpools) {
  const invalid = (error, field = null) => ({ input: null, result: null, error, field });
  const title = String(form.title ?? '').trim();
  if (!title) return invalid('Ingresa un nombre para el trabajo.', 'title');
  if (!catalog.some((spool) => spool.id === form.spoolId)) return invalid('Selecciona una bobina de prueba.', 'spoolId');
  if (!['sale', 'internal'].includes(form.purpose)) return invalid('Selecciona Venta o Uso interno.', 'purpose');
  const reference = form.calculationMode === 'reference';
  if (form.calculationMode !== undefined && !['legacy', 'reference'].includes(form.calculationMode)) return invalid('Selecciona un método de cálculo válido.', 'calculationMode');
  const numbers = {};
  for (const [key, [label, min]] of Object.entries(fields)) {
    if ((form.purpose === 'internal' || reference) && key === 'markupPercent') continue;
    if (form.purpose === 'internal' && !reference && ['discountValue', 'surchargeValue'].includes(key)) continue;
    const raw = form[key];
    if (raw === undefined && !['purchasePrice', 'netWeightGrams', 'grams', 'hours', 'minutes', 'watts', 'electricityPricePerKwh'].includes(key)) {
      numbers[key] = 0;
      continue;
    }
    if (raw === undefined || String(raw).trim() === '') return invalid(`Ingresa un valor para ${label}.`, key);
    const number = Number(raw);
    if (!Number.isFinite(number) || number < min) return invalid(`${label} debe ser un número ${min > 0 ? 'mayor que cero' : 'no negativo'}.`, key);
    numbers[key] = number;
  }
  if (reference) {
    if (form.purpose === 'internal' && (numbers.discountValue !== 0 || numbers.surchargeValue !== 0)) {
      return invalid('El trabajo interno no admite descuentos ni recargos.');
    }
    for (const [key, label, min] of [
      ['replacementCost', 'Costo de reposición', 0], ['replacementLifetimeHours', 'Vida útil de reposición', Number.MIN_VALUE],
      ['errorPercent', 'Imprevistos', 0],
    ]) {
      if (form[key] === undefined || String(form[key]).trim() === '') return invalid(`Ingresa un valor para ${label}.`, key);
      numbers[key] = Number(form[key]);
      if (!Number.isFinite(numbers[key]) || numbers[key] < min) return invalid(`${label} debe ser un número ${min > 0 ? 'mayor que cero' : 'no negativo'}.`, key);
    }
    if (form.purpose === 'sale') {
      const selected = String(form.multiplierPreset ?? '');
      if (!['2', '2.5', '3', '3.5', '4', '5', 'custom'].includes(selected)) return invalid('Selecciona un multiplicador válido.', 'multiplierPreset');
      const raw = selected === 'custom' ? form.customMultiplier : selected;
      if (raw === undefined || String(raw).trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return invalid('El multiplicador debe ser un número mayor que cero.', selected === 'custom' ? 'customMultiplier' : 'multiplierPreset');
      numbers.multiplier = Number(raw);
    }
  }
  if (!Number.isSafeInteger(numbers.hours)) return invalid('Las horas deben ser un entero no negativo.', 'hours');
  if (!Number.isInteger(numbers.minutes) || numbers.minutes > 59) return invalid('Los minutos deben estar entre 0 y 59.', 'minutes');
  if (form.purpose === 'sale' && !['amount', 'percent'].includes(form.discountType)) return invalid('Selecciona monto o porcentaje para el descuento.', 'discountType');
  if (form.purpose === 'sale' && !['amount', 'percent'].includes(form.surchargeType)) return invalid('Selecciona monto o porcentaje para el recargo.', 'surchargeType');
  const input = {
    purpose: form.purpose,
    spool: { purchasePrice: numbers.purchasePrice, netWeightGrams: numbers.netWeightGrams },
    grams: numbers.grams, hours: numbers.hours, minutes: numbers.minutes,
    watts: numbers.watts, electricityPricePerKwh: numbers.electricityPricePerKwh,
    depreciationPerHour: numbers.depreciationPerHour, maintenancePerHour: numbers.maintenancePerHour,
    laborMinutes: numbers.laborMinutes, laborRatePerHour: numbers.laborRatePerHour,
    extraProductionCost: numbers.extraProductionCost,
    ...(reference ? {
      replacementCost: numbers.replacementCost, replacementLifetimeHours: numbers.replacementLifetimeHours,
      errorPercent: numbers.errorPercent, ...(form.purpose === 'sale' ? { multiplier: numbers.multiplier } : {}),
    } : { markupPercent: form.purpose === 'sale' ? numbers.markupPercent : 0 }),
  };
  if (form.purpose === 'sale') {
    input.discount = { type: form.discountType, value: numbers.discountValue };
    input.surcharge = { type: form.surchargeType, value: numbers.surchargeValue };
  }
  try {
    return { title, spoolId: form.spoolId, form: { ...form }, input, result: reference ? calculateReferenceQuote(input) : calculateQuote(input), error: null, field: null };
  } catch (error) {
    return invalid(error.message);
  }
}
