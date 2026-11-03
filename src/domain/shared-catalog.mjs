import { validateSpoolProfile } from './spool-profiles.mjs';

const FIELDS = ['name', 'material', 'brand', 'purchasePrice', 'netWeightGrams'];
const SKU = /^[A-Za-z0-9_-]{1,80}$/;
const URL_PREFIX = 'https://www.todotoner.cl/';
const own = (object, key) => Object.hasOwn(object, key);
const validUrl = row => typeof row?.sourceUrl === 'string' && row.sourceUrl.startsWith(URL_PREFIX) &&
  !/[?#]/.test(row.sourceUrl);
const validIdentity = row => validUrl(row) && typeof row.sku === 'string' && SKU.test(row.sku);

/** Compose public base rows with a single account's overrides and personal rows; never mutate inputs. */
export function composeSharedCatalog({ base = [], personal = [], overrides = [] } = {}) {
  if (![base, personal, overrides].every(Array.isArray)) throw new TypeError('Invalid catalog lists');
  const byId = new Map(base.map(row => [row.id, row]));
  if (byId.size !== base.length) throw new TypeError('Duplicate base identity');
  const masks = new Map();
  for (const { baseId, fields } of overrides) {
    const row = byId.get(baseId);
    if (!row || row.status !== 'confirmed' || masks.has(baseId) ||
        !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new TypeError('Invalid base override');
    const keys = Object.keys(fields);
    if (!keys.length || keys.some(key => !FIELDS.includes(key))) throw new TypeError('Invalid override field mask');
    const values = Object.fromEntries(keys.map(key => [key, fields[key]]));
    validateSpoolProfile({ ...row.profile, ...values });
    masks.set(baseId, { values, keys });
  }
  const verified = personal.filter(validUrl);
  const result = personal.map(row => ({ ...row }));
  for (const row of base) {
    if (!validIdentity(row) || !['confirmed', 'pending'].includes(row.status)) throw new TypeError('Invalid base identity');
    if (verified.some(ownRow => ownRow.sourceUrl === row.sourceUrl ||
      (typeof ownRow.sku === 'string' && SKU.test(ownRow.sku) && ownRow.sku === row.sku))) continue;
    const provenance = own(row, 'provenance') ? {
      provenance: { sourceSha256: row.provenance.sourceSha256, normalizedSha256: row.provenance.normalizedSha256 }
    } : {};
    if (row.status === 'pending') {
      if (own(row, 'profile') || own(row, 'purchasePrice') || own(row, 'netWeightGrams') ||
          !Array.isArray(row.reasons) || !row.reasons.length ||
          !row.reasons.every(reason => typeof reason === 'string' && reason.trim() === reason &&
            reason.length > 0 && reason.length <= 2000 && !/[\p{Cc}\p{Cf}]/u.test(reason)) ||
          row.referencePriceClp !== null && (!Number.isSafeInteger(row.referencePriceClp) ||
            row.referencePriceClp < 0 || row.referencePriceClp >= Number.MAX_SAFE_INTEGER)) throw new TypeError('Pending cannot be quoted');
      const display = validateSpoolProfile({ name: row.name, material: row.material, brand: row.brand,
        filamentColor: row.filamentColor, purchasePrice: 0, netWeightGrams: 1 });
      result.push({ id: row.id, sku: row.sku, sourceUrl: row.sourceUrl, status: 'pending', ...provenance,
        name: display.name, material: display.material, brand: display.brand,
        filamentColor: display.filamentColor, referencePriceClp: row.referencePriceClp,
        reasons: [...row.reasons] });
      continue;
    }
    const profile = validateSpoolProfile(row.profile);
    const mask = masks.get(row.id);
    const effective = mask ? validateSpoolProfile({ ...profile, ...mask.values }) : profile;
    result.push({ id: row.id, sku: row.sku, sourceUrl: row.sourceUrl, status: 'confirmed', ...provenance,
      profile: { name: effective.name, material: effective.material, brand: effective.brand,
        purchasePrice: effective.purchasePrice, netWeightGrams: effective.netWeightGrams,
        ...(own(effective, 'filamentColor') ? { filamentColor: effective.filamentColor } : {}),
        ...(own(effective, 'filamentColorHex') ? { filamentColorHex: effective.filamentColorHex } : {}) },
      ...(mask ? { overriddenFields: [...mask.keys] } : {}) });
  }
  return result;
}
