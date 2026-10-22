-- Separate editable presentation prices from immutable purchased spools and quote snapshots.
-- Apply after 202610210001 and 202610210002 as the migration owner, never implicitly.
begin;
create table public.calc3d_spool_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(name) between 1 and 120 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  material text not null check (length(material) between 1 and 120 and material = btrim(material) and material !~ '[[:cntrl:]]'),
  brand text not null default '' check (length(brand) <= 120 and brand = btrim(brand) and brand !~ '[[:cntrl:]]'),
  purchase_price bigint not null check (purchase_price between 0 and 9007199254740991),
  net_weight_grams numeric not null check (net_weight_grams > 0 and net_weight_grams <= 9007199254740991),
  revision bigint not null check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calc3d_spool_profiles_owner on public.calc3d_spool_profiles (owner_id);
alter table public.calc3d_spool_profiles enable row level security;
create policy calc3d_member_owner_read on public.calc3d_spool_profiles for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
revoke all on public.calc3d_spool_profiles from public, anon, authenticated;
grant select on public.calc3d_spool_profiles to authenticated;

create function public.calc3d_save_spool_profile(payload jsonb, profile_id uuid default null,
  expected_revision bigint default 0) returns public.calc3d_spool_profiles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_spool_profiles; k text; label text; weight numeric;
begin
  if uid is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if coalesce(jsonb_typeof(payload) <> 'object', true) or expected_revision is null or
     expected_revision < 0 or expected_revision >= 9007199254740991 or
     (profile_id is null and expected_revision <> 0) or
     (profile_id is not null and expected_revision = 0) then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  foreach k in array array['name', 'material', 'brand'] loop
    if k = 'brand' and not (payload ? k) then continue; end if;
    if coalesce(jsonb_typeof(payload->k) <> 'string', true) then
      raise exception 'Invalid spool profile' using errcode = '23514'; end if;
    label := payload->>k;
    if length(label) > 120 or label <> btrim(label) or label ~ '[[:cntrl:]]' or
       (k <> 'brand' and length(label) = 0) then
      raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  end loop;
  if not coalesce(public.calc3d_safe_clp(payload->'purchasePrice'), false) or
     coalesce(jsonb_typeof(payload->'netWeightGrams') <> 'number', true) then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  weight := (payload->>'netWeightGrams')::numeric;
  if weight <= 0 or weight > 9007199254740991 then
    raise exception 'Invalid spool profile' using errcode = '23514'; end if;
  if profile_id is null then
    insert into public.calc3d_spool_profiles (owner_id, name, material, brand, purchase_price, net_weight_grams, revision)
      values (uid, payload->>'name', payload->>'material', coalesce(payload->>'brand', ''),
        (payload->>'purchasePrice')::bigint, weight, 1) returning * into r;
  else
    update public.calc3d_spool_profiles set name = payload->>'name', material = payload->>'material',
      brand = coalesce(payload->>'brand', ''), purchase_price = (payload->>'purchasePrice')::bigint,
      net_weight_grams = weight, revision = revision + 1, updated_at = now()
      where id = profile_id and owner_id = uid and revision = expected_revision returning * into r;
    if not found then raise exception 'Spool profile revision conflict' using errcode = '40001'; end if;
  end if;
  return r;
end $$;
revoke all on function public.calc3d_save_spool_profile(jsonb, uuid, bigint) from public, anon, authenticated;
grant execute on function public.calc3d_save_spool_profile(jsonb, uuid, bigint) to authenticated;
commit;
