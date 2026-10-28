import { isBusinessDate } from './purchases.mjs';
import { calculateQuote } from './costs.mjs';

const requiredText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} debe ser texto no vacío.`);
  return value;
};
const optionalText = (value, field) => {
  if (typeof value !== 'string') throw new TypeError(`${field} debe ser texto.`);
  return value;
};
const costFields = ['watts', 'electricityPricePerKwh', 'depreciationPerHour', 'maintenancePerHour', 'laborMinutes', 'laborRatePerHour', 'extraProductionCost'];

/** Validate a whole actual production job and return a detached CLP cost-only snapshot. */
export function validatePrint(input, spool) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('La impresión debe ser un objeto.');
  if (['basePrice', 'finalPrice', 'revenue', 'commercialProfit', 'markupPercent', 'discount', 'surcharge'].some((field) => field in input)) {
    throw new TypeError('Una impresión no registra cobros ni precios de venta.');
  }
  const submissionId = requiredText(input.submissionId, 'submissionId');
  if (!isBusinessDate(input.date)) throw new TypeError('Fecha de impresión inválida (YYYY-MM-DD).');
  const title = requiredText(input.title, 'title');
  if (!['sale', 'internal'].includes(input.purpose)) throw new TypeError('Propósito inválido: use sale o internal.');
  if (!['completed', 'failed'].includes(input.outcome)) throw new TypeError('Resultado inválido: use completed o failed.');
  if (!Number.isSafeInteger(input.pieceCount) || input.pieceCount <= 0) throw new TypeError('pieceCount debe ser un entero positivo seguro.');
  const spoolId = requiredText(input.spoolId, 'spoolId');
  if (!spool || typeof spool !== 'object' || Array.isArray(spool) || spool.id !== spoolId ||
      typeof spool.purchaseId !== 'string' || !spool.purchaseId.trim() ||
      !Number.isSafeInteger(spool.purchasePrice) || spool.purchasePrice < 0 ||
      typeof spool.netWeightGrams !== 'number' || !Number.isFinite(spool.netWeightGrams) || spool.netWeightGrams <= 0) {
    throw new TypeError('Bobina adquirida inválida.');
  }
  if (typeof input.actualGrams !== 'number' || !Number.isFinite(input.actualGrams) || input.actualGrams < 0) {
    throw new TypeError('actualGrams debe ser un número finito no negativo.');
  }
  if (!input.costInputs || typeof input.costInputs !== 'object' || Array.isArray(input.costInputs) ||
      Object.keys(input.costInputs).some((field) => !costFields.includes(field)) ||
      ['markupPercent', 'discount', 'surcharge', 'basePrice', 'finalPrice', 'revenue'].some((field) => field in input.costInputs)) {
    throw new TypeError('costInputs debe contener solo costos de producción.');
  }
  const costInputs = Object.fromEntries(costFields.map((field) => [field, input.costInputs[field] === undefined ? (field === 'watts' || field === 'electricityPricePerKwh' ? undefined : 0) : input.costInputs[field]]));
  // Let the existing cost engine enforce numeric and duration policies, without pricing a sale.
  const estimate = calculateQuote({ purpose: 'internal', spool: { purchasePrice: spool.purchasePrice, netWeightGrams: spool.netWeightGrams },
    grams: input.actualGrams, hours: input.hours, minutes: input.minutes, ...costInputs });
  return { submissionId, date: input.date, title, purpose: input.purpose, outcome: input.outcome,
    pieceCount: input.pieceCount, spoolId, purchaseId: spool.purchaseId, actualGrams: input.actualGrams,
    hours: input.hours, minutes: input.minutes, costInputs,
    notes: optionalText(input.notes ?? '', 'notes'),
    cost: { breakdown: estimate.breakdown, totalCost: estimate.totalCost } };
}
