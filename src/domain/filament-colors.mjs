// Nominal display approximations only, never manufacturer color evidence or persisted defaults.
const basicColors = new Map([
  ['blanco', '#FFFFFF'], ['negro', '#000000'], ['rojo', '#FF0000'],
  ['verde', '#008000'], ['azul', '#0000FF'], ['amarillo', '#FFFF00'],
  ['naranja', '#FFA500'], ['morado', '#800080'], ['violeta', '#EE82EE'],
  ['rosa', '#FFC0CB'], ['gris', '#808080'], ['marron', '#A52A2A'],
  ['cafe', '#A52A2A'], ['beige', '#F5F5DC'],
]);

/** Display-only sample resolution. Never mutates the profile or supplies persisted fields. */
export function filamentSample(item = {}) {
  const name = String(item.filamentColor ?? '').trim();
  const explicit = typeof item.filamentColorHex === 'string' && /^#[0-9a-f]{6}$/i.test(item.filamentColorHex)
    ? item.filamentColorHex.toUpperCase() : null;
  if (explicit) return { name, hex: explicit, approximate: false };
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
  const hex = basicColors.get(key) ?? null;
  return { name, hex, approximate: hex !== null };
}
