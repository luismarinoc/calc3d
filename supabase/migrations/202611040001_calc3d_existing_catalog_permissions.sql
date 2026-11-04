-- Permission-only migration on the deployed profile/reference catalog. Apply after
-- 202610290002; do NOT apply the unapplied 202611030001/2 shared-model migrations.
begin;
drop policy calc3d_member_owner_read on public.calc3d_spool_profiles;
create policy calc3d_catalog_read on public.calc3d_spool_profiles for select to authenticated
  using ((select coalesce((public.calc3d_access_status()->>'allowed')::boolean, false)));
drop policy calc3d_member_owner_read on public.calc3d_supplier_references;
create policy calc3d_catalog_read on public.calc3d_supplier_references for select to authenticated
  using ((select coalesce((public.calc3d_access_status()->>'allowed')::boolean, false)));
drop policy calc3d_member_owner_read on public.calc3d_brands;
create policy calc3d_catalog_read on public.calc3d_brands for select to authenticated
  using ((select coalesce((public.calc3d_access_status()->>'allowed')::boolean, false)));

-- Keep the original validations and owner-scoped purchase implementation intact.
-- No direct execute privilege is granted on either renamed core.
alter function public.calc3d_save_purchase(jsonb) rename to calc3d_save_purchase_catalog_core;
revoke all on function public.calc3d_save_purchase_catalog_core(jsonb) from public, anon, authenticated;
create function public.calc3d_save_purchase(payload jsonb) returns public.calc3d_purchases
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) or
     public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  return public.calc3d_save_purchase_catalog_core(payload);
end $$;
revoke all on function public.calc3d_save_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.calc3d_save_purchase(jsonb) to authenticated;

-- The legacy core owns brand/color normalization, constraints and CAS. Change only
-- its admission and row-owner selection: an administrator edits in place, including
-- a profile created by another account, without moving its brand or owner identity.
create or replace function public.calc3d_save_spool_profile(payload jsonb, profile_id uuid default null,
  expected_revision bigint default 0) returns public.calc3d_spool_profiles
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); uid uuid := actor; r public.calc3d_spool_profiles; k text; label text; weight numeric;
declare selected_brand uuid; display_brand text; filament text; sample text;
begin
  if actor is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) or
     public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if coalesce(jsonb_typeof(payload) <> 'object', true) or expected_revision is null or
     expected_revision < 0 or expected_revision >= 9007199254740991 or
     (profile_id is null and expected_revision <> 0) or
     (profile_id is not null and expected_revision = 0) then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  foreach k in array array['name', 'material', 'brand', 'filamentColor'] loop
    if k in ('brand', 'filamentColor') and not (payload ? k) then continue; end if;
    if coalesce(jsonb_typeof(payload->k) <> 'string', true) then
      raise exception 'Invalid spool profile' using errcode = '23514'; end if;
    label := payload->>k;
    if length(label) > 120 or label <> btrim(label) or
       public.calc3d_brand_name_has_control(label) or
       (k in ('name', 'material') and length(label) = 0) then
      raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  end loop;
  if (payload ? 'brandId') and coalesce(jsonb_typeof(payload->'brandId') not in ('null', 'string'), true) then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  if payload ? 'brandId' and jsonb_typeof(payload->'brandId') = 'string' then
    if (payload->>'brandId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid spool profile' using errcode = '23514'; end if;
    selected_brand := (payload->>'brandId')::uuid;
  end if;
  if payload ? 'filamentColorHex' and
     coalesce(jsonb_typeof(payload->'filamentColorHex') not in ('null', 'string'), true) then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  if payload ? 'filamentColorHex' and jsonb_typeof(payload->'filamentColorHex') = 'string' then
    sample := payload->>'filamentColorHex';
    if sample !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Invalid spool profile' using errcode = '23514'; end if;
    sample := upper(sample);
    if not (payload ? 'filamentColor') or payload->>'filamentColor' = '' then
      raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  end if;
  if not coalesce(public.calc3d_safe_clp(payload->'purchasePrice'), false) or
     coalesce(jsonb_typeof(payload->'netWeightGrams') <> 'number', true) then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  weight := (payload->>'netWeightGrams')::numeric;
  if weight <= 0 or weight > 9007199254740991 then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;

  if profile_id is not null then
    select * into r from public.calc3d_spool_profiles
      where id = profile_id and revision = expected_revision for update;
    if not found then raise exception 'Spool profile revision conflict' using errcode = '40001'; end if;
    uid := r.owner_id;
  end if;
  display_brand := case when payload ? 'brand' then payload->>'brand' else coalesce(r.brand, '') end;
  filament := case when payload ? 'filamentColor' then payload->>'filamentColor' else coalesce(r.filament_color, '') end;
  if not (payload ? 'filamentColorHex') then sample := r.filament_color_hex; end if;
  if filament = '' and (payload ? 'filamentColor') and not (payload ? 'filamentColorHex') then sample := null; end if;
  if filament = '' and sample is not null then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  if payload ? 'brandId' then
    if selected_brand is not null then
      select name into display_brand from public.calc3d_brands where id = selected_brand and owner_id = uid;
      if not found then raise exception 'Invalid spool profile' using errcode = '23514'; end if;
    else
      display_brand := case when payload ? 'brand' then display_brand else '' end;
    end if;
  elsif payload ? 'brand' then
    select a.brand_id into selected_brand from public.calc3d_brand_aliases a
      where a.owner_id = uid and a.alias = public.calc3d_brand_key(display_brand);
  else selected_brand := r.brand_id;
  end if;
  if profile_id is null then
    insert into public.calc3d_spool_profiles (owner_id, name, material, brand, brand_id,
      filament_color, filament_color_hex, purchase_price, net_weight_grams, revision)
    values (uid, payload->>'name', payload->>'material', display_brand, selected_brand,
      filament, sample, (payload->>'purchasePrice')::bigint, weight, 1) returning * into r;
  else
    update public.calc3d_spool_profiles set name = payload->>'name', material = payload->>'material',
      brand = display_brand, brand_id = selected_brand, filament_color = filament,
      filament_color_hex = sample, purchase_price = (payload->>'purchasePrice')::bigint,
      net_weight_grams = weight, revision = revision + 1, updated_at = now()
      where id = profile_id and owner_id = uid and revision = expected_revision returning * into r;
    if not found then raise exception 'Spool profile revision conflict' using errcode = '40001'; end if;
  end if;
  return r;
end $$;

create or replace function public.calc3d_archive_spool_profile(profile_id uuid, expected_revision bigint)
returns public.calc3d_spool_profiles language plpgsql security definer set search_path = '' as $$
declare r public.calc3d_spool_profiles;
begin
  if auth.uid() is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) or
     public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if profile_id is null or expected_revision is null or expected_revision <= 0 or
     expected_revision >= 9007199254740991 then
    raise exception 'Invalid spool profile archive' using errcode = '23514'; end if;
  update public.calc3d_spool_profiles set archived_at = now(), revision = revision + 1, updated_at = now()
    where id = profile_id and revision = expected_revision and archived_at is null returning * into r;
  if not found then raise exception 'Spool profile revision conflict' using errcode = '40001'; end if;
  return r;
end $$;

-- Brand administration is separately guarded; brand identity remains owner-scoped.
alter function public.calc3d_save_brand(jsonb,uuid,bigint) rename to calc3d_save_brand_catalog_core;
alter function public.calc3d_archive_brand(uuid,bigint) rename to calc3d_archive_brand_catalog_core;
revoke all on function public.calc3d_save_brand_catalog_core(jsonb,uuid,bigint),
  public.calc3d_archive_brand_catalog_core(uuid,bigint) from public, anon, authenticated;
create function public.calc3d_save_brand(payload jsonb, brand_id uuid default null,
  expected_revision bigint default 0) returns public.calc3d_brands
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) or
     public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  return public.calc3d_save_brand_catalog_core(payload, brand_id, expected_revision);
end $$;
create function public.calc3d_archive_brand(brand_id uuid, expected_revision bigint)
returns public.calc3d_brands language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) or
     public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  return public.calc3d_archive_brand_catalog_core(brand_id, expected_revision);
end $$;
revoke all on function public.calc3d_save_brand(jsonb,uuid,bigint),
  public.calc3d_archive_brand(uuid,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_save_brand(jsonb,uuid,bigint),
  public.calc3d_archive_brand(uuid,bigint) to authenticated;

-- Preserve the quote core's arithmetic, number counter, private owner and history.
-- For a foreign existing profile only, reject forged price/weight before that core.
create or replace function public.calc3d_save_quote(payload jsonb) returns public.calc3d_quotes
language plpgsql security definer set search_path = '' as $$
declare identity text := payload->>'spoolId'; p public.calc3d_spool_profiles; submitted jsonb;
begin
  if not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if identity ~* '^profile:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into p from public.calc3d_spool_profiles where id = substr(identity, 9)::uuid for share;
    if found and p.owner_id <> auth.uid() then
      submitted := payload->'input'->'spool';
      if p.archived_at is not null or
         jsonb_typeof(submitted->'purchasePrice') is distinct from 'number' or
         jsonb_typeof(submitted->'netWeightGrams') is distinct from 'number' or
         not coalesce(public.calc3d_safe_clp(submitted->'purchasePrice'), false) or
         (submitted->>'netWeightGrams')::numeric <= 0 or
         (submitted->>'netWeightGrams')::numeric > 9007199254740991 or
         (submitted->>'purchasePrice')::numeric <> p.purchase_price or
         (submitted->>'netWeightGrams')::numeric <> p.net_weight_grams then
        raise exception 'Catalog spool is not quotable' using errcode = '23514'; end if;
    end if;
  end if;
  return public.calc3d_save_quote_core(public.calc3d_quotable_payload(payload));
end $$;
commit;
