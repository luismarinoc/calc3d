-- Additive public supplier baseline; seed loading is a separate offline operator action.
begin;
create function public.calc3d_shared_profile_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; value text; n numeric;
begin
  if pg_catalog.jsonb_typeof(p) <> 'object' or
     exists (select 1 from pg_catalog.jsonb_object_keys(p) as keys(field_name)
       where keys.field_name not in ('name','material','brand','purchasePrice','netWeightGrams','filamentColor','filamentColorHex')) then return false; end if;
  foreach k in array array['name','material','brand','filamentColor'] loop
    if k = 'filamentColor' and not p ? k then continue; end if;
    if pg_catalog.jsonb_typeof(p->k) <> 'string' then return false; end if;
    value := p->>k;
    if pg_catalog.length(value) > 120 or value <> pg_catalog.btrim(value) or
       public.calc3d_brand_name_has_control(value) or
       (k in ('name','material') and value = '') then return false; end if;
  end loop;
  if not coalesce(public.calc3d_safe_clp(p->'purchasePrice'), false) or
     pg_catalog.jsonb_typeof(p->'netWeightGrams') <> 'number' then return false; end if;
  n := (p->>'netWeightGrams')::numeric;
  if n <= 0 or n > 9007199254740991 then return false; end if;
  if p ? 'filamentColorHex' and pg_catalog.jsonb_typeof(p->'filamentColorHex') <> 'null' and
     (pg_catalog.jsonb_typeof(p->'filamentColorHex') <> 'string' or
      p->>'filamentColorHex' !~ '^#[0-9A-F]{6}$' or
      coalesce(p->>'filamentColor','') = '') then return false; end if;
  return true;
end $$;
revoke all on function public.calc3d_shared_profile_valid(jsonb) from public, anon, authenticated;

create table public.calc3d_shared_products (
  id uuid primary key,
  sku text not null unique check (sku ~ '^[A-Za-z0-9_-]{1,80}$'),
  source_url text not null unique check (source_url ~ '^https://www[.]todotoner[.]cl/[^?#]+$'),
  status text not null check (status in ('confirmed','pending')),
  profile jsonb,
  pending jsonb,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_sha256 text not null check (normalized_sha256 ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  check ((status = 'confirmed' and pending is null and public.calc3d_shared_profile_valid(profile)) or
         (status = 'pending' and profile is null and pending is not null and
          pg_catalog.jsonb_typeof(pending) = 'object' and not (pending ? 'netWeightGrams') and
          not (pending ? 'purchasePrice') and not (pending ? 'profile')))
);
alter table public.calc3d_shared_products enable row level security;
create policy calc3d_admitted_shared_read on public.calc3d_shared_products for select to authenticated
  using ((select (public.calc3d_access_status()->>'allowed')::boolean));
revoke all on public.calc3d_shared_products from public, anon, authenticated;
grant select on public.calc3d_shared_products to authenticated;

create table public.calc3d_shared_overrides (
  owner_id uuid not null references auth.users(id),
  base_id uuid not null references public.calc3d_shared_products(id),
  fields jsonb not null default '{}'::jsonb,
  hidden boolean not null default false,
  revision bigint not null check (revision between 1 and 9007199254740991),
  primary key (owner_id, base_id),
  check (pg_catalog.jsonb_typeof(fields) = 'object' and not (fields ?| array['brandId','filamentColor','filamentColorHex']))
);
create index calc3d_shared_overrides_base on public.calc3d_shared_overrides(base_id);
alter table public.calc3d_shared_overrides enable row level security;
create policy calc3d_admitted_owner_read on public.calc3d_shared_overrides for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
revoke all on public.calc3d_shared_overrides from public, anon, authenticated;
grant select on public.calc3d_shared_overrides to authenticated;

-- Invoker RLS applies to BOTH sides of the view, including the owner-private mask.
create view public.calc3d_effective_shared_products with (security_invoker = true) as
select b.id, b.sku, b.source_url, b.status, b.revision, b.source_sha256, b.normalized_sha256,
  case when b.status = 'confirmed' then b.profile || coalesce(o.fields, '{}'::jsonb) end as profile,
  b.pending, coalesce(o.fields, '{}'::jsonb) as overridden_fields
from public.calc3d_shared_products b
left join public.calc3d_shared_overrides o on o.base_id = b.id and o.owner_id = (select auth.uid())
where not coalesce(o.hidden, false);
revoke all on public.calc3d_effective_shared_products from public, anon, authenticated;
grant select on public.calc3d_effective_shared_products to authenticated;

-- Full replacement of the sparse mask: presence is durable even if the value equals baseline.
create function public.calc3d_save_shared_override(product_id uuid, fields jsonb, expected_revision bigint)
returns public.calc3d_shared_overrides language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.calc3d_shared_products; r public.calc3d_shared_overrides;
begin
  if uid is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if product_id is null or expected_revision is null or expected_revision < 0 or expected_revision >= 9007199254740991 or
     pg_catalog.jsonb_typeof(fields) <> 'object' or fields = '{}'::jsonb or
     exists (select 1 from pg_catalog.jsonb_object_keys(fields) k
       where k not in ('name','material','brand','purchasePrice','netWeightGrams')) then
    raise exception 'Invalid shared override' using errcode = '23514'; end if;
  select * into b from public.calc3d_shared_products where id = product_id and status = 'confirmed' for share;
  if not found or not public.calc3d_shared_profile_valid(b.profile || fields) then
    raise exception 'Invalid shared override' using errcode = '23514'; end if;
  if expected_revision = 0 then
    insert into public.calc3d_shared_overrides(owner_id,base_id,fields,revision)
    values (uid,product_id,fields,1) on conflict do nothing returning * into r;
  else
    update public.calc3d_shared_overrides set fields = $2, revision = revision + 1
      where owner_id = uid and base_id = product_id and revision = expected_revision and not hidden returning * into r;
  end if;
  if r.owner_id is null then raise exception 'Shared override revision conflict' using errcode = '40001'; end if;
  return r;
end $$;
revoke all on function public.calc3d_save_shared_override(uuid,jsonb,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_save_shared_override(uuid,jsonb,bigint) to authenticated;

create function public.calc3d_hide_shared_product(product_id uuid, expected_revision bigint)
returns public.calc3d_shared_overrides language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_shared_overrides;
begin
  if uid is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if product_id is null or expected_revision is null or expected_revision < 0 or expected_revision >= 9007199254740991 or
    not exists (select 1 from public.calc3d_shared_products where id = product_id and status = 'confirmed') then
    raise exception 'Invalid shared hide' using errcode = '23514'; end if;
  if expected_revision = 0 then
    insert into public.calc3d_shared_overrides(owner_id,base_id,hidden,revision)
    values (uid,product_id,true,1) on conflict do nothing returning * into r;
  else
    update public.calc3d_shared_overrides set hidden = true, revision = revision + 1
      where owner_id = uid and base_id = product_id and revision = expected_revision and not hidden returning * into r;
  end if;
  if r.owner_id is null then raise exception 'Shared override revision conflict' using errcode = '40001'; end if;
  return r;
end $$;
revoke all on function public.calc3d_hide_shared_product(uuid,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_hide_shared_product(uuid,bigint) to authenticated;

-- Preserve the existing pending-reference guard and arithmetic core for every legacy ID.
create or replace function public.calc3d_save_quote(payload jsonb) returns public.calc3d_quotes
language plpgsql security definer set search_path = '' as $$
declare identity text := payload->>'spoolId'; b public.calc3d_shared_products;
declare mask public.calc3d_shared_overrides; effective jsonb; submitted jsonb;
begin
  if not (public.calc3d_access_status()->>'allowed')::boolean then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if identity like 'base:%' then
    if identity !~* '^base:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Shared spool is not quotable' using errcode = '23514'; end if;
    select * into b from public.calc3d_shared_products where id = pg_catalog.substr(identity, 6)::uuid
      and status = 'confirmed' for share;
    if not found then raise exception 'Shared spool is not quotable' using errcode = '23514'; end if;
    select * into mask from public.calc3d_shared_overrides where owner_id = auth.uid() and base_id = b.id for share;
    if coalesce(mask.hidden, false) then
      raise exception 'Shared spool is not quotable' using errcode = '23514'; end if;
    effective := b.profile || coalesce(mask.fields, '{}'::jsonb);
    submitted := payload->'input'->'spool';
    if pg_catalog.jsonb_typeof(submitted->'purchasePrice') <> 'number' or
       pg_catalog.jsonb_typeof(submitted->'netWeightGrams') <> 'number' or
       not coalesce(public.calc3d_safe_clp(submitted->'purchasePrice'), false) or
       (submitted->>'netWeightGrams')::numeric <= 0 or
       (submitted->>'netWeightGrams')::numeric > 9007199254740991 or
       (submitted->>'purchasePrice')::numeric <> (effective->>'purchasePrice')::numeric or
       (submitted->>'netWeightGrams')::numeric <> (effective->>'netWeightGrams')::numeric then
      raise exception 'Shared spool is not quotable' using errcode = '23514'; end if;
  end if;
  return public.calc3d_save_quote_core(public.calc3d_quotable_payload(payload));
end $$;
commit;
