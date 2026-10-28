const fields = [
  ['name', 'Cliente o empresa', 120],
  ['phone', 'Teléfono', 30],
  ['email', 'Correo', 254],
];

// Validate only at explicit save; calculation and live preview do not depend on client details.
export function normalizeClient(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return { error: 'Los datos del cliente deben ser campos de texto.' };
  const client = {};
  for (const [key, label, limit] of fields) {
    const value = source[key] ?? '';
    if (typeof value !== 'string') return { error: `${label} debe ser texto.` };
    client[key] = value.trim();
    if (key === 'name' && client[key].length > limit) return { error: `${label} debe tener ${limit} caracteres o menos.` };
    if (key === 'phone' && client[key] && (client[key].length > limit || !/^[+()\d\s.\-]{3,30}$/.test(client[key]))) return { error: 'Ingresa un teléfono válido (hasta 30 caracteres).' };
    if (key === 'email' && client[key] && (client[key].length > limit || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client[key]))) return { error: 'Ingresa un correo válido (hasta 254 caracteres).' };
  }
  return { client };
}
