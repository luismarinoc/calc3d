import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateSpoolProfile } from '../src/domain/spool-profiles.mjs';

const skuPattern = /^[A-Za-z0-9_-]{1,80}$/;
const supplier = /^https:\/\/www\.todotoner\.cl\/[^?#]+$/;
const digest = /^[0-9a-f]{64}$/;
const idFor = sku => {
  const hash = createHash('sha256').update(`calc3d:shared:todotoner:v1:${sku}`).digest('hex');
  return `base:${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

/** Accept only reviewed supplier-source identities; intentionally discard all owner and native-import fields. */
export function curateSharedSeed(source) {
  if (!source || !digest.test(source.sourceSha256) || !Array.isArray(source.records)) throw new TypeError('Invalid reviewed catalog');
  const seenSku = new Set();
  const seenUrl = new Set();
  const records = [];
  for (const row of source.records) {
    if (!['confirmed', 'pending'].includes(row.status)) continue;
    const { sku, sourceUrl, provenance } = row;
    if (!skuPattern.test(sku) || !supplier.test(sourceUrl) ||
        provenance?.providerSku !== sku || provenance?.offerUrl !== sourceUrl && row.status === 'confirmed' ||
        provenance?.normalizedSha256 !== source.sourceSha256 || !digest.test(provenance?.sourceSha256) ||
        seenSku.has(sku) || seenUrl.has(sourceUrl)) throw new TypeError('Invalid supplier source evidence');
    seenSku.add(sku);
    seenUrl.add(sourceUrl);
    const record = { id: idFor(sku), sku, sourceUrl, status: row.status,
      provenance: { sourceSha256: provenance.sourceSha256, normalizedSha256: source.sourceSha256 } };
    if (row.status === 'confirmed') {
      const profile = validateSpoolProfile(row.profile);
      if (profile.name !== row.profile.name || profile.material !== row.profile.material ||
          profile.brand !== row.profile.brand || !Object.hasOwn(row.profile, 'brand') ||
          Object.hasOwn(row.profile, 'filamentColor') && profile.filamentColor !== row.profile.filamentColor ||
          Object.hasOwn(row.profile, 'filamentColorHex') && profile.filamentColorHex !== row.profile.filamentColorHex) {
        throw new TypeError('Invalid confirmed profile');
      }
      record.profile = { name: profile.name, material: profile.material, brand: profile.brand,
        purchasePrice: profile.purchasePrice, netWeightGrams: profile.netWeightGrams,
        ...(Object.hasOwn(profile, 'filamentColor') ? { filamentColor: profile.filamentColor } : {}),
        ...(Object.hasOwn(profile, 'filamentColorHex') ? { filamentColorHex: profile.filamentColorHex } : {}) };
    } else {
      if (row.profile || !Array.isArray(row.reasons) || !row.reasons.length ||
          !row.reasons.every(reason => typeof reason === 'string' && reason.trim() === reason &&
            reason.length > 0 && reason.length <= 2000 && !/[\p{Cc}\p{Cf}]/u.test(reason)) ||
          (row.available?.price !== null && (provenance.offerUrl !== sourceUrl ||
            !Number.isSafeInteger(row.available?.price) || row.available.price < 0 ||
            row.available.price >= Number.MAX_SAFE_INTEGER))) throw new TypeError('Invalid pending reference');
      const pending = validateSpoolProfile({ name: row.available?.name, material: row.available?.material,
        brand: row.available?.brand, filamentColor: row.available?.color,
        purchasePrice: 0, netWeightGrams: 1 });
      if (pending.name !== row.available.name || pending.material !== row.available.material ||
          pending.brand !== row.available.brand || pending.filamentColor !== row.available.color) {
        throw new TypeError('Invalid pending presentation');
      }
      record.name = pending.name;
      record.material = pending.material;
      record.brand = pending.brand;
      record.filamentColor = pending.filamentColor;
      record.referencePriceClp = row.available.price;
      record.reasons = [...row.reasons];
    }
    records.push(record);
  }
  return { version: 1, sourceSha256: source.sourceSha256, records };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new TypeError('Usage: node ops/shared-catalog-seed.mjs <reviewed-public-catalog.json>');
  const seed = curateSharedSeed(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../data/shared-supplier-catalog.json', import.meta.url), `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Curated ${seed.records.filter(row => row.status === 'confirmed').length} confirmed, ${seed.records.filter(row => row.status === 'pending').length} pending`);
}
