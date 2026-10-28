const CONTROL = /[\p{Cc}\p{Cf}]/u;

export function normalizeBrandName(name) {
  return name.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function validateBrand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('La marca debe ser un objeto.');
  if (typeof input.name !== 'string' || CONTROL.test(input.name) ||
      !input.name.trim() || [...input.name.trim()].length > 120) {
    throw new TypeError('El nombre de marca debe tener entre 1 y 120 caracteres sin controles.');
  }
  const name = input.name.trim().replace(/\s+/gu, ' ');
  if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) {
    throw new TypeError('El color de marca debe ser hexadecimal de 6 dígitos (#RRGGBB).');
  }
  return { name, color: input.color.toUpperCase() };
}
