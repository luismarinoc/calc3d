// Pure quotation estimate: no persistence, inventory deduction or tax rules.
const safeCLP = (value) => {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Resultado fuera del rango seguro de CLP.');
  }
  return Math.round(value);
};

function nonnegative(value, name, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} debe ser un número finito no negativo.`);
  }
  return value;
}

function adjustment(value, name, base) {
  if (value === undefined) return 0;
  if (value === null || typeof value !== 'object' || !['amount', 'percent'].includes(value.type)) {
    throw new TypeError(`${name}.type debe ser amount o percent.`);
  }
  const quantity = nonnegative(value.value, `${name}.value`);
  if (name === 'discount') {
    if (value.type === 'percent' && quantity > 100) {
      throw new RangeError('El descuento porcentual no puede superar 100%.');
    }
    if (value.type === 'amount' && quantity > base) {
      throw new RangeError('El descuento no puede superar el precio base.');
    }
  }
  return safeCLP(value.type === 'amount' ? quantity : base * (quantity / 100));
}

/** Estimate whole CLP. Each cost component and adjustment is rounded half-up before summing. */
export function calculateQuote(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('La cotización debe ser un objeto.');
  }
  if (!['sale', 'internal'].includes(input.purpose)) {
    throw new TypeError('Propósito inválido: use sale o internal.');
  }
  if (input.spool === null || typeof input.spool !== 'object' || Array.isArray(input.spool)) {
    throw new TypeError('spool debe ser un objeto.');
  }
  const purchasePrice = nonnegative(input.spool.purchasePrice, 'spool.purchasePrice');
  const weight = input.spool.netWeightGrams;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    throw new TypeError('spool.netWeightGrams debe ser un número finito mayor que cero.');
  }
  const grams = nonnegative(input.grams, 'grams');
  if (!Number.isSafeInteger(input.hours) || input.hours < 0) {
    throw new TypeError('hours debe ser un entero no negativo.');
  }
  if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 59) {
    throw new TypeError('minutes debe ser un entero entre 0 y 59.');
  }
  const duration = input.hours + input.minutes / 60;
  const watts = nonnegative(input.watts, 'watts');
  const tariff = nonnegative(input.electricityPricePerKwh, 'electricityPricePerKwh');
  const depreciation = nonnegative(input.depreciationPerHour, 'depreciationPerHour', 0);
  const maintenance = nonnegative(input.maintenancePerHour, 'maintenancePerHour', 0);
  const laborMinutes = nonnegative(input.laborMinutes, 'laborMinutes', 0);
  const laborRate = nonnegative(input.laborRatePerHour, 'laborRatePerHour', 0);
  const extras = nonnegative(input.extraProductionCost, 'extraProductionCost', 0);
  const markup = nonnegative(input.markupPercent, 'markupPercent', 0);

  const breakdown = {
    material: safeCLP((purchasePrice / weight) * grams),
    electricity: safeCLP((watts / 1000) * duration * tariff),
    depreciation: safeCLP(depreciation * duration),
    maintenance: safeCLP(maintenance * duration),
    labor: safeCLP((laborMinutes / 60) * laborRate),
    extras: safeCLP(extras),
  };
  const totalCost = safeCLP(Object.values(breakdown).reduce((sum, cost) => sum + cost, 0));
  if (input.purpose === 'internal') {
    // Validate adjustment shape first, then disallow any positive sale adjustment.
    for (const name of ['discount', 'surcharge']) {
      const selected = input[name];
      if (selected !== undefined) {
        if (selected === null || typeof selected !== 'object' || !['amount', 'percent'].includes(selected.type)) {
          throw new TypeError(`${name}.type debe ser amount o percent.`);
        }
        const value = nonnegative(selected.value, `${name}.value`);
        if (value !== 0) throw new RangeError('El trabajo interno no admite descuentos ni recargos.');
      }
    }
    return { breakdown, totalCost, internalCost: totalCost, basePrice: 0,
      discountAmount: 0, surchargeAmount: 0, finalPrice: 0, commercialProfit: 0 };
  }
  const basePrice = safeCLP(totalCost * (1 + markup / 100)); // markup, not margin
  const discountAmount = adjustment(input.discount, 'discount', basePrice);
  const surchargeAmount = adjustment(input.surcharge, 'surcharge', basePrice);
  const unboundedPrice = basePrice - discountAmount + surchargeAmount;
  if (unboundedPrice < totalCost) {
    throw new RangeError(`El precio final no puede ser menor al costo total (faltan ${totalCost - unboundedPrice} CLP).`);
  }
  const finalPrice = safeCLP(unboundedPrice);
  return { breakdown, totalCost, internalCost: 0, basePrice, discountAmount,
    surchargeAmount, finalPrice, commercialProfit: finalPrice - totalCost };
}
