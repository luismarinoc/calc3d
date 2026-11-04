import { validateSpoolProfile } from './spool-profiles.mjs';

const BASE_ID = /^base:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKU = /^[A-Za-z0-9_-]{1,80}$/;
const URL_PREFIX = 'https://www.todotoner.cl/';
const own = (object, key) => Object.hasOwn(object, key);
const validUrl = row => typeof row?.sourceUrl === 'string' && row.sourceUrl.startsWith(URL_PREFIX) &&
  !/[?#]/.test(row.sourceUrl);
const validIdentity = row => validUrl(row) && typeof row.sku === 'string' && SKU.test(row.sku);

/** Compose common supplier/manual rows with an account's private identities; legacy masks never apply. */
export function composeSharedCatalog({ base = [], personal = [], overrides = [] } = {}) {
  if (![base, personal, overrides].every(Array.isArray)) throw new TypeError('Invalid catalog lists');
  const byId = new Map(base.map(row => [row.id, row]));
  if (byId.size !== base.length) throw new TypeError('Duplicate base identity');
  // Legacy owner masks remain stored but cannot alter the common projection.
  const supplier = base.filter(row => row.origin !== 'manual');
  const verified = personal.filter(validUrl);
  const matches = row => supplier.find(baseRow => baseRow.sourceUrl === row.sourceUrl ||
    (typeof row.sku === 'string' && SKU.test(row.sku) && row.sku === baseRow.sku));
  const result = personal.map(row => {
    const match = validUrl(row) ? matches(row) : null;
    return match?.status === 'confirmed' ? { ...row, ...validateSpoolProfile(match.profile), id: row.id,
      ...(Number.isSafeInteger(match.revision) ? { commonTarget: { id: match.id.slice(5), baseRevision: match.revision } } : {}) } : { ...row };
  });
  for (const row of base) {
    if (!BASE_ID.test(row.id) || (row.origin === 'manual' ? row.status !== 'confirmed' || row.sourceUrl != null || row.sku != null || own(row, 'provenance') : !validIdentity(row)) ||
        !['confirmed', 'pending'].includes(row.status)) throw new TypeError('Invalid base identity');
    if (row.origin !== 'manual' && verified.some(ownRow => ownRow.sourceUrl === row.sourceUrl ||
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
    result.push({ id: row.id, ...(row.origin === 'manual' ? { origin: 'manual' } : { sku: row.sku, sourceUrl: row.sourceUrl }),
      status: 'confirmed', ...provenance, ...(own(row, 'revision') ? { revision: row.revision } : {}),
      profile: { name: profile.name, material: profile.material, brand: profile.brand,
        purchasePrice: profile.purchasePrice, netWeightGrams: profile.netWeightGrams,
        ...(own(profile, 'filamentColor') ? { filamentColor: profile.filamentColor } : {}),
        ...(own(profile, 'filamentColorHex') ? { filamentColorHex: profile.filamentColorHex } : {}) },
    });
  }
  return result;
}
