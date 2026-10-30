-- Owner-private, read-only supplier evidence; never a cost profile or a quoteable spool.
-- Apply as migration owner after brands, profile brand/color, and profile source URLs.
begin;
-- Preserve the original nested product rule and permit only these verified supplier aliases.
create function public.calc3d_official_filament_url(link text) returns boolean
language sql immutable set search_path = '' as $$
  select link is not null and length(link) <= 2048 and link = pg_catalog.btrim(link) and
    link !~ '[[:cntrl:]]' and (
      link ~ '^https://www[.]todotoner[.]cl/impresoras/impresoras-3d/filamentos/[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*/?$'
      or link in (
        'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-mate-creality-verde-Palta-1kg',
        'https://www.todotoner.cl/filamento/pla-plus/filamentos-pla-arcoiris-1kg-ender-filamentos',
        'https://www.todotoner.cl/filamento-pla-mate-lila-1kg-con-bobina-plastica-esun-filamentos',
        'https://www.todotoner.cl/filamento-pla-hyper-alta-velocidad-amarillo-1kg-todotonercl-filamentos-1',
        'https://www.todotoner.cl/filamento-pla-hyper-alta-velocidad-azul-1kg-todotonercl-filamentos-1',
        'https://www.todotoner.cl/filamento-pla-lite-azul-1kg-bambu-lab-filamentos',
        'https://www.todotoner.cl/filamento-petg-gris-texturizado-anycubic-filamentos',
        'https://www.todotoner.cl/filamento-petg-cafe-oscuro-anycubic-filamentos'
      ))
$$;
revoke all on function public.calc3d_official_filament_url(text) from public, anon, authenticated;
alter table public.calc3d_spool_profiles drop constraint calc3d_profile_source_url_official_product;
alter table public.calc3d_spool_profiles add constraint calc3d_profile_source_url_official_product
  check (source_url is null or public.calc3d_official_filament_url(source_url));

create table public.calc3d_supplier_references (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(name) between 1 and 120 and name = btrim(name) and not public.calc3d_brand_name_has_control(name)),
  material text not null check (length(material) between 1 and 120 and material = btrim(material) and not public.calc3d_brand_name_has_control(material)),
  brand text not null default '' check (length(brand) <= 120 and brand = btrim(brand) and not public.calc3d_brand_name_has_control(brand)),
  brand_id uuid,
  filament_color text not null default '' check (length(filament_color) <= 120 and filament_color = btrim(filament_color) and not public.calc3d_brand_name_has_control(filament_color)),
  reference_price_clp bigint check (reference_price_clp between 0 and 9007199254740991),
  source_url text not null constraint calc3d_reference_official_product
    check (public.calc3d_official_filament_url(source_url)),
  supplier_sku text check (length(supplier_sku) between 1 and 120 and supplier_sku = btrim(supplier_sku) and not public.calc3d_brand_name_has_control(supplier_sku)),
  pending_reasons text[] not null check (cardinality(pending_reasons) > 0 and array_position(pending_reasons, null) is null),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object' and provenance <> '{}'::jsonb),
  created_at timestamptz not null default now(),
  constraint calc3d_reference_brand_owner foreign key (owner_id, brand_id) references public.calc3d_brands(owner_id, id),
  unique (owner_id, source_url),
  check (array_position(pending_reasons, '') is null and
    length(array_to_string(pending_reasons, '')) <= 2000 and
    not public.calc3d_brand_name_has_control(array_to_string(pending_reasons, '')))
);
create index calc3d_supplier_references_owner on public.calc3d_supplier_references(owner_id);
alter table public.calc3d_supplier_references enable row level security;
create policy calc3d_member_owner_read on public.calc3d_supplier_references for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
revoke all on public.calc3d_supplier_references from public, anon, authenticated;
grant select on public.calc3d_supplier_references to authenticated;

-- Keep pending-reference policy separate so existing quote errors retain their
-- original admission-wrapper diagnostics and the core validator stays unchanged.
create function public.calc3d_quotable_payload(payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare reference_id text := payload->>'spoolId';
begin
  if reference_id ~* '^(profile:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and
     exists (select 1 from public.calc3d_supplier_references p
       where p.id = replace(reference_id, 'profile:', '')::uuid and p.owner_id = auth.uid()) and
     not exists (select 1 from public.calc3d_spool_profiles p
       where p.id = replace(reference_id, 'profile:', '')::uuid and p.owner_id = auth.uid()) then
    raise exception 'Pending supplier reference is not quotable' using errcode = '23514'; end if;
  return payload;
end $$;
revoke all on function public.calc3d_quotable_payload(jsonb) from public, anon, authenticated;

create or replace function public.calc3d_save_quote(payload jsonb) returns public.calc3d_quotes
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.calc3d_access_status()->>'allowed')::boolean then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  return public.calc3d_save_quote_core(public.calc3d_quotable_payload(payload));
end $$;
commit;
