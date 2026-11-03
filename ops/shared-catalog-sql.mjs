import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateSpoolProfile } from '../src/domain/spool-profiles.mjs';

const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const fail = () => { throw new TypeError('Invalid shared seed'); };
const encode = value => `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('hex')}', 'hex'), 'UTF8')::jsonb`;
const string = value => `'${value.replaceAll("'", "''")}'`;
const expectedId = sku => {
  const h = createHash('sha256').update(`calc3d:shared:todotoner:v1:${sku}`).digest('hex');
  return `base:${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Compile reviewed, owner-free supplier records to offline, deterministic SQL; never connect to a database. */
export function compileSharedCatalogSql(seed) {
  if (!keys(seed, ['version', 'sourceSha256', 'records']) || seed.version !== 1 ||
      !digest(seed.sourceSha256) || !Array.isArray(seed.records)) fail();
  const ids = new Set(), urls = new Set(), skus = new Set();
  const lines = ['-- Offline reviewed supplier seed; apply only as migration owner after the shared schema.', 'begin;'];
  for (const row of seed.records) {
    if (!keys(row, row.status === 'confirmed' ? ['id', 'sku', 'sourceUrl', 'status', 'provenance', 'profile'] :
      ['id', 'sku', 'sourceUrl', 'status', 'provenance', 'name', 'material', 'brand', 'filamentColor', 'referencePriceClp', 'reasons']) ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(row.sku) || row.id !== expectedId(row.sku) ||
      !/^https:\/\/www\.todotoner\.cl\/[^?#]+$/.test(row.sourceUrl) ||
      !keys(row.provenance, ['sourceSha256', 'normalizedSha256']) ||
      !digest(row.provenance.sourceSha256) || row.provenance.normalizedSha256 !== seed.sourceSha256 ||
      ids.has(row.id) || urls.has(row.sourceUrl) || skus.has(row.sku)) fail();
    ids.add(row.id); urls.add(row.sourceUrl); skus.add(row.sku);
    let profile = 'null', pending = 'null';
    try {
      if (row.status === 'confirmed') {
        const expected = ['name', 'material', 'brand', 'purchasePrice', 'netWeightGrams'];
        if (Object.hasOwn(row.profile, 'filamentColor')) expected.push('filamentColor');
        if (Object.hasOwn(row.profile, 'filamentColorHex')) expected.push('filamentColorHex');
        if (!keys(row.profile, expected)) fail();
        const validated = validateSpoolProfile(row.profile);
        if (Object.keys(row.profile).some(key => validated[key] !== row.profile[key])) fail();
        profile = encode(row.profile);
      } else {
        if (!Array.isArray(row.reasons) || !row.reasons.length ||
            row.reasons.some(reason => typeof reason !== 'string' || !reason || reason.length > 2000 ||
              reason.trim() !== reason || /[\p{Cc}\p{Cf}]/u.test(reason)) ||
            row.referencePriceClp !== null && (!Number.isSafeInteger(row.referencePriceClp) || row.referencePriceClp < 0 ||
              row.referencePriceClp >= Number.MAX_SAFE_INTEGER)) fail();
        const display = validateSpoolProfile({ name: row.name, material: row.material, brand: row.brand,
          filamentColor: row.filamentColor, purchasePrice: 0, netWeightGrams: 1 });
        if (display.name !== row.name || display.material !== row.material || display.brand !== row.brand ||
            display.filamentColor !== row.filamentColor) fail();
        pending = encode({ name: row.name, material: row.material, brand: row.brand,
          filamentColor: row.filamentColor, referencePriceClp: row.referencePriceClp, reasons: row.reasons });
      }
    } catch { fail(); }
    lines.push(`insert into public.calc3d_shared_products (id,sku,source_url,status,profile,pending,source_sha256,normalized_sha256)`);
    lines.push(`values (${string(row.id.slice(5))}::uuid,${string(row.sku)},${string(row.sourceUrl)},${string(row.status)},${profile},${pending},${string(row.provenance.sourceSha256)},${string(row.provenance.normalizedSha256)})`);
    lines.push(`on conflict (id) do update set sku=excluded.sku, source_url=excluded.source_url, status=excluded.status,`);
    lines.push(`  profile=excluded.profile, pending=excluded.pending, source_sha256=excluded.source_sha256, normalized_sha256=excluded.normalized_sha256,`);
    lines.push(`  revision=public.calc3d_shared_products.revision+1`);
    lines.push(`where (public.calc3d_shared_products.sku,public.calc3d_shared_products.source_url,public.calc3d_shared_products.status,`);
    lines.push(`  public.calc3d_shared_products.profile,public.calc3d_shared_products.pending,public.calc3d_shared_products.source_sha256,`);
    lines.push(`  public.calc3d_shared_products.normalized_sha256) is distinct from`);
    lines.push(`  (excluded.sku,excluded.source_url,excluded.status,excluded.profile,excluded.pending,excluded.source_sha256,excluded.normalized_sha256);`);
  }
  return `${lines.join('\n')}\ncommit;\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new TypeError('Usage: node ops/shared-catalog-sql.mjs <checked-in-shared-supplier-catalog.json>');
  process.stdout.write(compileSharedCatalogSql(JSON.parse(readFileSync(process.argv[2], 'utf8'))));
}
