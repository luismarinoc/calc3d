import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU = /^[A-Za-z0-9_-]{1,80}$/;
const label = x => typeof x === 'string' && x.length > 0 && x.length <= 120 && x.trim() === x && !/[\p{Cc}\p{Cf}]/u.test(x);
function stableId(owner, sku) {
  const h = createHash('sha256').update(`calc3d:catalog:todotoner:v1:${owner}:${sku}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
function delimiter(text, prefix) { let n = 0, tag; do { tag = `$${prefix}${n++}$`; } while (text.includes(tag)); return tag; }
/** Render one rollback-on-error statement; only the existing table owner may execute it. */
export function buildCatalogColorsSQL(manifest, { ownerId, expectedRevision } = {}) {
  if (!UUID.test(ownerId ?? '') || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedRevision >= 9007199254740991 ||
      manifest?.ownerId !== ownerId || !Array.isArray(manifest.matches) || manifest.matches.length < 1 || manifest.matches.length > 71) {
    throw new TypeError('Explicit owner, matching manifest and bounded positive revision required');
  }
  const seenIds = new Set(), seenSkus = new Set();
  const entries = manifest.matches.map(m => {
    const { expected: e, evidence: proof } = m;
    let url;
    try { url = new URL(m.sourceUrl); } catch { throw new TypeError('Invalid source URL'); }
    if (!SKU.test(m.sku) || !UUID.test(m.id ?? '') || m.id.toLowerCase() !== stableId(ownerId.toLowerCase(), m.sku) ||
        seenSkus.has(m.sku) || seenIds.has(m.id.toLowerCase()) ||
        url.protocol !== 'https:' || url.host !== 'www.todotoner.cl' || url.username || url.password || url.pathname === '/' || url.search || url.hash ||
        !label(m.color) || !label(e?.name) || !label(e?.originalName) || !label(e?.material) ||
        typeof e?.brand !== 'string' || e.brand.length > 120 || e.brand.trim() !== e.brand || /[\p{Cc}\p{Cf}]/u.test(e.brand) ||
        !Number.isSafeInteger(e?.netWeightGrams) || e.netWeightGrams <= 0 ||
        proof?.sku?.path !== 'Product.sku' || proof.sku.value !== m.sku ||
        proof?.name?.path !== 'Product.name' || proof.name.value !== e.originalName ||
        !((proof.path === 'Product.additionalProperty[Color]' && proof.value === m.color) ||
          (proof.path === 'Product.name' && proof.value === e.originalName &&
            new RegExp(`(?<![\\p{L}\\p{N}])${m.color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'u').test(e.originalName)))) {
      throw new TypeError('Invalid exact catalog color evidence');
    }
    seenSkus.add(m.sku); seenIds.add(m.id.toLowerCase());
    return { id: m.id.toLowerCase(), name: e.name, material: e.material, brand: e.brand,
      weight: e.netWeightGrams, color: m.color };
  });
  const payload = JSON.stringify(entries);
  const lit = delimiter(payload, 'colors_payload_');
  const body = `declare target uuid := '${ownerId.toLowerCase()}'; expected_revision bigint := ${expectedRevision};
  entries jsonb := ${lit}${payload}${lit}::jsonb; entry jsonb; original jsonb; changed jsonb;
  before_profiles jsonb; after_profiles jsonb; before_business jsonb; after_business jsonb;
  business jsonb := '{}'::jsonb; table_name text; fingerprint text; updated integer := 0;
begin
  if current_user <> (select pg_get_userbyid(relowner) from pg_class where oid = 'public.calc3d_spool_profiles'::regclass)
    or not has_table_privilege(current_user, 'public.calc3d_spool_profiles', 'UPDATE') then
    raise exception 'Catalog colors require existing table owner/UPDATE'; end if;
  lock table public.calc3d_spool_profiles in share row exclusive mode;
  lock table public.calc3d_quotes, public.calc3d_quote_counters, public.calc3d_printer_settings,
    public.calc3d_purchases, public.calc3d_spools in share mode;
  if (select count(*) from auth.users u join public.calc3d_members m on m.email = lower(btrim(u.email))
      join public.calc3d_member_identities i on i.email = m.email and i.user_id = u.id
      where u.id = target and u.email_confirmed_at is not null and m.active and not i.pending
        and (select count(*) from auth.users v where v.email_confirmed_at is not null
          and lower(btrim(v.email)) = m.email) = 1) <> 1 then
    raise exception 'Catalog target must be uniquely confirmed, bound and active'; end if;
  select coalesce(jsonb_object_agg(p.id::text, to_jsonb(p)), '{}'::jsonb) into before_profiles
    from public.calc3d_spool_profiles p;
  foreach table_name in array array['calc3d_quotes','calc3d_quote_counters','calc3d_printer_settings','calc3d_purchases','calc3d_spools'] loop
    execute format('select md5(coalesce(string_agg(to_jsonb(t)::text, '','' order by %s::text), '''')) from public.%I t',
      case when table_name in ('calc3d_quote_counters','calc3d_printer_settings') then 'owner_id' else 'id' end, table_name) into fingerprint;
    business := business || jsonb_build_object(table_name, fingerprint);
  end loop;
  before_business := business; business := '{}'::jsonb;
  for entry in select value from jsonb_array_elements(entries) loop
    select to_jsonb(p) into original from public.calc3d_spool_profiles p
      where p.id = (entry->>'id')::uuid for update;
    if original is null or original->>'owner_id' <> target::text or
       (original->>'revision')::bigint <> expected_revision or original->>'name' <> entry->>'name' or
       original->>'material' <> entry->>'material' or original->>'brand' <> entry->>'brand' or
       (original->>'net_weight_grams')::numeric <> (entry->>'weight')::numeric or
       original->>'filament_color' <> '' or original->'filament_color_hex' <> 'null'::jsonb or
       original->'archived_at' <> 'null'::jsonb then
      raise exception 'Catalog color target mismatch'; end if;
    update public.calc3d_spool_profiles p set filament_color = entry->>'color',
      revision = revision + 1, updated_at = now()
      where p.id = (entry->>'id')::uuid and p.owner_id = target and p.revision = expected_revision
        and p.filament_color = '' and p.filament_color_hex is null and p.archived_at is null
      returning to_jsonb(p) into changed;
    if not found or changed - 'filament_color' - 'revision' - 'updated_at' is distinct from
         original - 'filament_color' - 'revision' - 'updated_at' or
       changed->>'filament_color' is distinct from entry->>'color' or
       (changed->>'revision')::bigint is distinct from expected_revision + 1 or
       (changed->>'updated_at')::timestamptz < (original->>'updated_at')::timestamptz then
      raise exception 'Catalog color preservation failed'; end if;
    updated := updated + 1;
  end loop;
  if updated <> jsonb_array_length(entries) then raise exception 'Catalog color count mismatch'; end if;
  select coalesce(jsonb_object_agg(p.id::text, to_jsonb(p)), '{}'::jsonb) into after_profiles
    from public.calc3d_spool_profiles p;
  for entry in select value from jsonb_array_elements(entries) loop
    original := before_profiles->(entry->>'id'); changed := after_profiles->(entry->>'id');
    if original is null or changed is null or
       changed - 'filament_color' - 'revision' - 'updated_at' is distinct from
         original - 'filament_color' - 'revision' - 'updated_at' or
       original->>'filament_color' is distinct from '' or
       (original->>'revision')::bigint is distinct from expected_revision or
       changed->>'filament_color' is distinct from entry->>'color' or
       (changed->>'revision')::bigint is distinct from (original->>'revision')::bigint + 1 or
       (changed->>'updated_at')::timestamptz < (original->>'updated_at')::timestamptz then
      raise exception 'Catalog color preservation failed'; end if;
    before_profiles := before_profiles - (entry->>'id'); after_profiles := after_profiles - (entry->>'id');
  end loop;
  if after_profiles is distinct from before_profiles then raise exception 'Other catalog profiles changed'; end if;
  foreach table_name in array array['calc3d_quotes','calc3d_quote_counters','calc3d_printer_settings','calc3d_purchases','calc3d_spools'] loop
    execute format('select md5(coalesce(string_agg(to_jsonb(t)::text, '','' order by %s::text), '''')) from public.%I t',
      case when table_name in ('calc3d_quote_counters','calc3d_printer_settings') then 'owner_id' else 'id' end, table_name) into fingerprint;
    business := business || jsonb_build_object(table_name, fingerprint);
  end loop;
  if business is distinct from before_business then raise exception 'Business state changed'; end if;
  raise notice 'Catalog colors: updated %', updated;
end`;
  const outer = delimiter(body, 'colors_do_');
  return `do ${outer}${body}${outer};`;
}
