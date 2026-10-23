import { createHash } from 'node:crypto';
import { validateSpoolProfile } from '../src/domain/spool-profiles.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU = /^[A-Za-z0-9_-]{1,80}$/;
const HELD = new Set(['197PLAESUN', '12PLAELEGOO']);
const EVIDENCE = ['name', 'sku', 'brand', 'material', 'diameter', 'weight', 'availability', 'price'];
function validateItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) ||
      !SKU.test(item.sku) || HELD.has(item.sku) || 'ownerId' in item || 'id' in item ||
      typeof item.originalName !== 'string' || item.originalName !== item.originalName.trim() ||
      !item.originalName || !Number.isSafeInteger(item.profile?.purchasePrice)) throw new TypeError('Invalid catalog item');
  const profile = validateSpoolProfile(item.profile);
  if (profile.name !== item.profile.name || profile.material !== item.profile.material ||
      profile.brand !== (item.profile.brand ?? '') || item.originalName.length > 120 ||
      (item.originalName !== profile.name && item.originalName.replace(/ \| Filamentos$/, '') !== profile.name &&
       `${item.originalName.replace(/ \| Filamentos$/, '')} [${item.sku}]` !== profile.name)) throw new TypeError('Invalid catalog presentation');
  return profile;
}
function unique(items) {
  const seen = new Set();
  for (const item of items) { validateItem(item); if (seen.has(item.sku)) throw new TypeError('Duplicate SKU'); seen.add(item.sku); }
}
/** Freeze a reviewable subset of a provisional collector snapshot; never certify entire crawl coverage. */
export function normalizeCatalogBatch(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.coverage?.complete === true) throw new TypeError('Invalid snapshot');
  const names = new Map();
  const items = snapshot.items.filter(x => !HELD.has(x.sku)).map(x => {
    const weight = x.evidence?.weight?.value;
    const grams = typeof weight === 'string' && /^(\d+(?:[.,]\d+)?)\s*(kg|kilo|g|gramos)$/i.exec(weight.trim());
    const weightGrams = grams && Number(grams[1].replace(',', '.')) * (/^(kg|kilo)$/i.test(grams[2]) ? 1000 : 1);
    if (x.diameterMm !== 1.75 || x.availability !== 'InStock' ||
        typeof x.sourceUrl !== 'string' || !x.sourceUrl.startsWith('https://www.todotoner.cl/') ||
        !EVIDENCE.every(k => x.evidence?.[k]?.path && x.evidence[k].value !== undefined) ||
        x.evidence.sku.value !== x.sku || x.evidence.name.value !== x.profile?.name ||
        x.evidence.brand.value !== x.profile?.brand || x.evidence.price.value !== x.profile?.purchasePrice ||
        !/1[.,]75\s*mm/i.test(String(x.evidence.diameter.value)) ||
        weightGrams !== x.profile?.netWeightGrams || !Array.isArray(x.compatibilityNotes)) throw new TypeError('Insufficient item evidence');
    const base = x.profile.name.replace(/ \| Filamentos$/, '');
    const key = `${base}|${x.profile.brand}|${x.profile.material}|${x.profile.netWeightGrams}`;
    const repeats = snapshot.items.filter(y => `${y.profile?.name.replace(/ \| Filamentos$/, '')}|${y.profile?.brand}|${y.profile?.material}|${y.profile?.netWeightGrams}` === key).length > 1;
    const name = repeats ? `${base} [${x.sku}]` : base;
    const item = { sku: x.sku, originalName: x.profile.name, profile: { ...x.profile, name }, sourceUrl: x.sourceUrl, retrievedAt: x.retrievedAt, diameterMm: x.diameterMm, availability: x.availability, compatibilityNotes: x.compatibilityNotes, evidence: x.evidence };
    validateItem(item);
    if (names.has(name)) throw new TypeError('Duplicate presentation name'); names.set(name, true);
    return item;
  });
  unique(items);
  return { coverage: { complete: false, inspectedProducts: snapshot.coverage?.inspectedProducts }, heldSkus: [...HELD], items };
}

function stableId(owner, sku) {
  const h = createHash('sha256').update(`calc3d:catalog:todotoner:v1:${owner}:${sku}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
function tagAbsent(text, prefix) { let i = 0, tag; do { tag = `$${prefix}${i++}$`; } while (text.includes(tag)); return tag; }
/** Render a single atomic statement for a previously verified batch; execute only as the existing table owner. */
export function buildCatalogImportSQL(items, { ownerId } = {}) {
  if (typeof ownerId !== 'string' || !UUID.test(ownerId) || !Array.isArray(items) || items.length < 1 || items.length > 100) throw new TypeError('Explicit UUID owner and nonempty bounded batch required');
  unique(items);
  const payload = JSON.stringify(items.map(item => ({ id: stableId(ownerId.toLowerCase(), item.sku), sku: item.sku, originalName: item.originalName, ...validateItem(item) })));
  const literal = tagAbsent(payload, 'catalog_payload_');
  const body = `declare target uuid := '${ownerId.toLowerCase()}'; entries jsonb := ${literal}${payload}${literal}::jsonb;
  entry jsonb; before_profiles jsonb; after_profiles jsonb; before_business jsonb; after_business jsonb;
  table_name text; fingerprint text; business jsonb := '{}'::jsonb; inserted integer := 0; skipped integer := 0;
begin
  if current_user <> (select pg_get_userbyid(relowner) from pg_class where oid = 'public.calc3d_spool_profiles'::regclass)
     or not has_table_privilege(current_user, 'public.calc3d_spool_profiles', 'INSERT') then
    raise exception 'Catalog import requires existing table owner/INSERT'; end if;
  lock table public.calc3d_spool_profiles in share row exclusive mode;
  if (select count(*) from auth.users u join public.calc3d_members m on m.email = lower(btrim(u.email))
      where u.id = target and u.email_confirmed_at is not null and m.active) <> 1 then
    raise exception 'Catalog target must be uniquely confirmed and active'; end if;
  select coalesce(jsonb_object_agg(id::text, to_jsonb(p)), '{}'::jsonb) into before_profiles
    from public.calc3d_spool_profiles p;
  foreach table_name in array array['calc3d_quotes','calc3d_quote_counters','calc3d_printer_settings','calc3d_purchases','calc3d_spools'] loop
    execute format('select md5(coalesce(string_agg(to_jsonb(t)::text, '','' order by %s::text), '''')) from public.%I t',
      case when table_name in ('calc3d_quote_counters','calc3d_printer_settings') then 'owner_id' else 'id' end, table_name) into fingerprint;
    business := business || jsonb_build_object(table_name, fingerprint);
  end loop;
  before_business := business; business := '{}'::jsonb;
  for entry in select value from jsonb_array_elements(entries) loop
    if exists (select 1 from public.calc3d_spool_profiles where id = (entry->>'id')::uuid and owner_id <> target) then
      raise exception 'Catalog ID collision with another owner'; end if;
    if exists (select 1 from public.calc3d_spool_profiles where owner_id = target and
        (name = entry->>'name' or name = entry->>'originalName') and brand = entry->>'brand' and
        material = entry->>'material' and net_weight_grams = (entry->>'netWeightGrams')::numeric) then
      skipped := skipped + 1; continue; end if;
    insert into public.calc3d_spool_profiles(id, owner_id, name, material, brand, purchase_price, net_weight_grams, revision)
      values ((entry->>'id')::uuid, target, entry->>'name', entry->>'material', entry->>'brand',
        (entry->>'purchasePrice')::bigint, (entry->>'netWeightGrams')::numeric, 1)
      on conflict (id) do nothing;
    if found then inserted := inserted + 1; else skipped := skipped + 1; end if;
  end loop;
  select coalesce(jsonb_object_agg(p.id::text, to_jsonb(p)), '{}'::jsonb) into after_profiles
    from public.calc3d_spool_profiles p where before_profiles ? p.id::text;
  if after_profiles is distinct from before_profiles then raise exception 'Existing catalog profiles changed'; end if;
  foreach table_name in array array['calc3d_quotes','calc3d_quote_counters','calc3d_printer_settings','calc3d_purchases','calc3d_spools'] loop
    execute format('select md5(coalesce(string_agg(to_jsonb(t)::text, '','' order by %s::text), '''')) from public.%I t',
      case when table_name in ('calc3d_quote_counters','calc3d_printer_settings') then 'owner_id' else 'id' end, table_name) into fingerprint;
    business := business || jsonb_build_object(table_name, fingerprint);
  end loop;
  if business is distinct from before_business then raise exception 'Business state changed'; end if;
  raise notice 'Catalog import: inserted %, skipped %', inserted, skipped;
end`;
  const outer = tagAbsent(body, 'catalog_do_');
  return `do ${outer}${body}${outer};`;
}
