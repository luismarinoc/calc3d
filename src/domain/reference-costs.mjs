// Independent decimal-CLP estimate. Legacy print and quotation arithmetic remains in costs.mjs.
const money = (value) => {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) {
    throw new RangeError('Resultado fuera del rango seguro de CLP.');
  }
  return Math.round(value * 100) / 100;
};
const nonnegative = (value, name, fallback) => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} debe ser un número finito no negativo.`);
  }
  return value;
};
const positive = (value, name) => {
  const number = nonnegative(value, name);
  if (number === 0) throw new TypeError(`${name} debe ser un número finito mayor que cero.`);
  return number;
};
function adjustment(selected, name, base) {
  if (selected === undefined) return 0;
  if (!selected || typeof selected !== 'object' || !['amount', 'percent'].includes(selected.type)) {
    throw new TypeError(`${name}.type debe ser amount o percent.`);
  }
  const quantity = nonnegative(selected.value, `${name}.value`);
  if (name === 'discount') {
    if (selected.type === 'percent' && quantity > 100) throw new RangeError('El descuento porcentual no puede superar 100%.');
    if (selected.type === 'amount' && money(quantity) > money(base)) throw new RangeError('El descuento no puede superar el precio base.');
  }
  return money(selected.type === 'amount' ? quantity : base * quantity / 100);
}

/** Retain raw component precision through allowance and multiplier; round only monetary outputs to cents. */
export function calculateReferenceQuote(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('La cotización debe ser un objeto.');
  if (!['sale', 'internal', 'gift'].includes(input.purpose)) throw new TypeError('Propósito inválido: use sale, internal o gift.');
  if (!input.spool || typeof input.spool !== 'object' || Array.isArray(input.spool)) throw new TypeError('spool debe ser un objeto.');
  const purchasePrice = nonnegative(input.spool.purchasePrice, 'spool.purchasePrice');
  const weight = positive(input.spool.netWeightGrams, 'spool.netWeightGrams');
  const grams = nonnegative(input.grams, 'grams');
  if (!Number.isSafeInteger(input.hours) || input.hours < 0) throw new TypeError('hours debe ser un entero no negativo.');
  if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 59) throw new TypeError('minutes debe ser un entero entre 0 y 59.');
  const duration = input.hours + input.minutes / 60;
  const watts = nonnegative(input.watts, 'watts');
  const tariff = nonnegative(input.electricityPricePerKwh, 'electricityPricePerKwh');
  const replacementCost = nonnegative(input.replacementCost, 'replacementCost');
  const lifetime = positive(input.replacementLifetimeHours, 'replacementLifetimeHours');
  const errorPercent = nonnegative(input.errorPercent, 'errorPercent');
  const maintenance = nonnegative(input.maintenancePerHour, 'maintenancePerHour', 0) * duration;
  const labor = nonnegative(input.laborMinutes, 'laborMinutes', 0) / 60 * nonnegative(input.laborRatePerHour, 'laborRatePerHour', 0);
  const extras = nonnegative(input.extraProductionCost, 'extraProductionCost', 0);
  const material = purchasePrice / weight * grams;
  const electricity = watts / 1000 * duration * tariff;
  const wear = replacementCost / lifetime * duration;
  const allowance = (material + electricity + wear) * errorPercent / 100;
  const raw = { material, electricity, wear, allowance, maintenance, labor, extras };
  const total = Object.values(raw).reduce((sum, part) => sum + part, 0);
  const breakdown = Object.fromEntries(Object.entries(raw).map(([name, amount]) => [name, money(amount)]));
  const totalCost = money(total);
  if (input.purpose !== 'sale') {
    for (const name of ['discount', 'surcharge']) {
      const selected = input[name];
      if (selected === undefined) continue;
      if (!selected || typeof selected !== 'object' || !['amount', 'percent'].includes(selected.type)) {
        throw new TypeError(`${name}.type debe ser amount o percent.`);
      }
      if (nonnegative(selected.value, `${name}.value`) !== 0) {
        throw new RangeError(input.purpose === 'gift' ? 'El regalo no admite descuentos ni recargos.' : 'El trabajo interno no admite descuentos ni recargos.');
      }
    }
    return { breakdown, totalCost, internalCost: input.purpose === 'internal' ? totalCost : 0,
      ...(input.purpose === 'gift' ? { giftCost: totalCost } : {}), basePrice: 0, discountAmount: 0,
      surchargeAmount: 0, finalPrice: 0, commercialProfit: 0 };
  }
  const multiplier = positive(input.multiplier, 'multiplier');
  const basePrice = money(total * multiplier);
  const discountAmount = adjustment(input.discount, 'discount', basePrice);
  const surchargeAmount = adjustment(input.surcharge, 'surcharge', basePrice);
  const finalPrice = money(basePrice - discountAmount + surchargeAmount);
  if (finalPrice < totalCost) throw new RangeError(`El precio final no puede ser menor al costo total (faltan ${money(totalCost - finalPrice)} CLP).`);
  return { breakdown, totalCost, internalCost: 0, basePrice, discountAmount, surchargeAmount,
    finalPrice, commercialProfit: money(finalPrice - totalCost) };
}
