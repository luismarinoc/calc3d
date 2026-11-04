-- Common catalog writes are administrative; historical personal rows and masks remain stored.
begin;
create function public.calc3d_require_catalog_admin() returns void
language plpgsql security definer set search_path = '' as $$
declare access jsonb := public.calc3d_access_status();
begin
  if auth.uid() is null or not coalesce((access->>'allowed')::boolean, false) or
     access->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000';
  end if;
end $$;
revoke all on function public.calc3d_require_catalog_admin() from public, anon, authenticated;

-- Supplier provenance stays mandatory for supplier records; manual entries never invent it.
alter table public.calc3d_shared_products add column origin text not null default 'supplier'
  check (origin in ('supplier', 'manual'));
alter table public.calc3d_shared_products alter column sku drop not null;
alter table public.calc3d_shared_products alter column source_url drop not null;
alter table public.calc3d_shared_products alter column source_sha256 drop not null;
alter table public.calc3d_shared_products alter column normalized_sha256 drop not null;
alter table public.calc3d_shared_products add constraint calc3d_shared_origin_provenance check (
  (origin = 'supplier' and sku is not null and source_url is not null and
   source_sha256 is not null and normalized_sha256 is not null) or
  (origin = 'manual' and status = 'confirmed' and sku is null and source_url is null and
   source_sha256 is null and normalized_sha256 is null));

-- Remove invoker-visible masks; no per-account hidden common rows.
create or replace view public.calc3d_effective_shared_products with (security_invoker = true) as
select b.id, b.sku, b.source_url, b.status, b.revision, b.source_sha256, b.normalized_sha256,
  b.profile, b.pending, '{}'::jsonb as overridden_fields
from public.calc3d_shared_products b;
revoke execute on function public.calc3d_save_shared_override(uuid,jsonb,bigint),
  public.calc3d_hide_shared_product(uuid,bigint) from authenticated;

create function public.calc3d_create_common_product(payload jsonb)
returns public.calc3d_shared_products language plpgsql security definer set search_path = '' as $$
declare result public.calc3d_shared_products;
begin
  perform public.calc3d_require_catalog_admin();
  if not coalesce(public.calc3d_shared_profile_valid(payload), false) or
     payload ? 'filamentColorHex' or payload ? 'filamentColor' then
    raise exception 'Invalid common product' using errcode = '23514'; end if;
  insert into public.calc3d_shared_products(id,origin,status,profile)
    values (pg_catalog.gen_random_uuid(),'manual','confirmed',payload) returning * into result;
  return result;
end $$;

create function public.calc3d_update_common_product(product_id uuid, payload jsonb, expected_revision bigint)
returns public.calc3d_shared_products language plpgsql security definer set search_path = '' as $$
declare result public.calc3d_shared_products; previous public.calc3d_shared_products;
begin
  perform public.calc3d_require_catalog_admin();
  if product_id is null or expected_revision is null or expected_revision < 1 or
     expected_revision >= 9007199254740991 or pg_catalog.jsonb_typeof(payload) <> 'object' or
     payload = '{}'::jsonb or
     exists (select 1 from pg_catalog.jsonb_object_keys(payload) as keys(field_name)
       where keys.field_name not in ('name','material','brand','purchasePrice','netWeightGrams')) then
    raise exception 'Invalid common product' using errcode = '23514'; end if;
  select * into previous from public.calc3d_shared_products where id = product_id and status = 'confirmed' for update;
  if not found or previous.revision <> expected_revision then
    raise exception 'Common product revision conflict' using errcode = '40001'; end if;
  if not coalesce(public.calc3d_shared_profile_valid(previous.profile || payload), false) then
    raise exception 'Invalid common product' using errcode = '23514'; end if;
  update public.calc3d_shared_products set profile = previous.profile || payload, revision = revision + 1
    where id = product_id returning * into result;
  return result;
end $$;
revoke all on function public.calc3d_create_common_product(jsonb),
  public.calc3d_update_common_product(uuid,jsonb,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_create_common_product(jsonb),
  public.calc3d_update_common_product(uuid,jsonb,bigint) to authenticated;

-- Keep existing validation and owner-scoped CAS cores; only change their admission boundary.
alter function public.calc3d_save_spool_profile(jsonb,uuid,bigint) rename to calc3d_save_spool_profile_admin_core;
alter function public.calc3d_archive_spool_profile(uuid,bigint) rename to calc3d_archive_spool_profile_admin_core;
alter function public.calc3d_save_purchase(jsonb) rename to calc3d_save_purchase_admin_core;
revoke all on function public.calc3d_save_spool_profile_admin_core(jsonb,uuid,bigint),
  public.calc3d_archive_spool_profile_admin_core(uuid,bigint),
  public.calc3d_save_purchase_admin_core(jsonb) from public, anon, authenticated;
create function public.calc3d_save_spool_profile(payload jsonb, profile_id uuid default null,
  expected_revision bigint default 0) returns public.calc3d_spool_profiles
language plpgsql security definer set search_path = '' as $$
declare result public.calc3d_spool_profiles;
begin
  perform public.calc3d_require_catalog_admin();
  return public.calc3d_save_spool_profile_admin_core(payload, profile_id, expected_revision);
end $$;
create function public.calc3d_archive_spool_profile(profile_id uuid, expected_revision bigint)
returns public.calc3d_spool_profiles language plpgsql security definer set search_path = '' as $$
begin
  perform public.calc3d_require_catalog_admin();
  return public.calc3d_archive_spool_profile_admin_core(profile_id, expected_revision);
end $$;
create function public.calc3d_save_purchase(payload jsonb)
returns public.calc3d_purchases language plpgsql security definer set search_path = '' as $$
begin
  perform public.calc3d_require_catalog_admin();
  return public.calc3d_save_purchase_admin_core(payload);
end $$;
revoke all on function public.calc3d_save_spool_profile(jsonb,uuid,bigint),
  public.calc3d_archive_spool_profile(uuid,bigint), public.calc3d_save_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.calc3d_save_spool_profile(jsonb,uuid,bigint),
  public.calc3d_archive_spool_profile(uuid,bigint), public.calc3d_save_purchase(jsonb) to authenticated;

-- Quote snapshots still pass through the original quote core and pending-reference guard.
create or replace function public.calc3d_save_quote(payload jsonb) returns public.calc3d_quotes
language plpgsql security definer set search_path = '' as $$
declare identity text := payload->>'spoolId'; b public.calc3d_shared_products; submitted jsonb;
begin
  if not (public.calc3d_access_status()->>'allowed')::boolean then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if identity like 'base:%' then
    if identity !~* '^base:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Shared spool is not quotable' using errcode = '23514'; end if;
    select * into b from public.calc3d_shared_products where id = pg_catalog.substr(identity, 6)::uuid
      and status = 'confirmed' for share;
    if not found then raise exception 'Shared spool is not quotable' using errcode = '23514'; end if;
    submitted := payload->'input'->'spool';
    if pg_catalog.jsonb_typeof(submitted->'purchasePrice') <> 'number' or
       pg_catalog.jsonb_typeof(submitted->'netWeightGrams') <> 'number' or
       not coalesce(public.calc3d_safe_clp(submitted->'purchasePrice'), false) or
       (submitted->>'netWeightGrams')::numeric <= 0 or
       (submitted->>'netWeightGrams')::numeric > 9007199254740991 or
       (submitted->>'purchasePrice')::numeric <> (b.profile->>'purchasePrice')::numeric or
       (submitted->>'netWeightGrams')::numeric <> (b.profile->>'netWeightGrams')::numeric then
      raise exception 'Shared spool is not quotable' using errcode = '23514'; end if;
  end if;
  return public.calc3d_save_quote_core(public.calc3d_quotable_payload(payload));
end $$;
commit;
