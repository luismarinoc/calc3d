-- Stable owner-scoped profile identity and independent readable filament presentation.
begin;
alter table public.calc3d_spool_profiles
  add column brand_id uuid,
  add column filament_color text not null default ''
    check (length(filament_color) <= 120 and filament_color = btrim(filament_color) and
      not public.calc3d_brand_name_has_control(filament_color)),
  add column filament_color_hex text
    check (filament_color_hex is null or
      (filament_color <> '' and filament_color_hex ~ '^#[0-9A-F]{6}$'));
alter table public.calc3d_spool_profiles add constraint calc3d_profile_brand_owner
  foreign key (owner_id, brand_id) references public.calc3d_brands(owner_id, id);
create index calc3d_spool_profiles_brand on public.calc3d_spool_profiles(owner_id, brand_id) where brand_id is not null;
-- Use the persistent alias ledger, including former names; do not mutate any other profile field.
update public.calc3d_spool_profiles p set brand_id = a.brand_id
  from public.calc3d_brand_aliases a
  where p.owner_id = a.owner_id and a.alias = public.calc3d_brand_key(p.brand) and p.brand <> '';

create or replace function public.calc3d_save_spool_profile(payload jsonb, profile_id uuid default null,
  expected_revision bigint default 0) returns public.calc3d_spool_profiles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_spool_profiles; k text; label text; weight numeric;
declare selected_brand uuid; display_brand text; filament text; sample text;
begin
  if uid is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
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
      where id = profile_id and owner_id = uid and revision = expected_revision for update;
    if not found then raise exception 'Spool profile revision conflict' using errcode = '40001'; end if;
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
      -- Explicit null clears the link; supplied legacy text remains readable but is not re-associated.
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
commit;
