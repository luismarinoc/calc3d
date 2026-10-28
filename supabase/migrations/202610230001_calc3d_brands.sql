-- Add independent owner-scoped brand identity. Legacy snapshots remain immutable.
begin;
create function public.calc3d_brand_key(label text) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(label), '[[:space:]]+', ' ', 'g'))
$$;
revoke all on function public.calc3d_brand_key(text) from public, anon, authenticated;

-- Match the domain's Unicode Cc/Cf exclusion. PostgreSQL's [[:cntrl:]] does not
-- include Cf; use code-point ranges under C collation, not locale-dependent ranges.
-- U+0000 cannot be stored in PostgreSQL text; Cc starts at U+0001 here.
create function public.calc3d_brand_name_has_control(label text) returns boolean
language sql immutable set search_path = '' as $$
  select label collate "C" ~ ('[' ||
    chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159) ||
    chr(173) || chr(1536) || '-' || chr(1541) || chr(1564) || chr(1757) || chr(1807) ||
    chr(2192) || '-' || chr(2193) || chr(2274) || chr(6158) ||
    chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) ||
    chr(8288) || '-' || chr(8292) || chr(8294) || '-' || chr(8303) ||
    chr(65279) || chr(65529) || '-' || chr(65531) || chr(69821) || chr(69837) ||
    chr(78896) || '-' || chr(78911) || chr(113824) || '-' || chr(113827) ||
    chr(119155) || '-' || chr(119162) || chr(917505) || chr(917536) || '-' || chr(917631) || ']')
$$;
revoke all on function public.calc3d_brand_name_has_control(text) from public, anon, authenticated;

create table public.calc3d_brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(name) > 0 and (color is null or not public.calc3d_brand_name_has_control(name))),
  normalized_name text not null,
  color text check (color ~ '^#[0-9A-F]{6}$'),
  aliases text[] not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, normalized_name),
  unique (owner_id, id),
  check (normalized_name = public.calc3d_brand_key(name) and normalized_name = any(aliases))
);
create index calc3d_brands_owner on public.calc3d_brands (owner_id);
-- The alias ledger is authoritative for uniqueness across current and historical names.
create table public.calc3d_brand_aliases (
  owner_id uuid not null,
  alias text not null,
  brand_id uuid not null,
  primary key (owner_id, alias),
  foreign key (owner_id, brand_id) references public.calc3d_brands(owner_id, id)
);
create index calc3d_brand_aliases_brand on public.calc3d_brand_aliases (owner_id, brand_id);
alter table public.calc3d_brands enable row level security;
alter table public.calc3d_brand_aliases enable row level security;
create policy calc3d_member_owner_read on public.calc3d_brands for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
revoke all on public.calc3d_brands, public.calc3d_brand_aliases from public, anon, authenticated;
grant select on public.calc3d_brands to authenticated;

-- Reject incompatible legacy text transactionally rather than mutate purchases/profiles
-- or create unreadable brands. The migration owner must resolve it before applying.
do $$ begin
  if exists (
    select 1 from public.calc3d_spool_profiles where brand <> '' and public.calc3d_brand_name_has_control(brand)
    union all
    select 1 from public.calc3d_spools where brand <> '' and public.calc3d_brand_name_has_control(brand)
  ) then
    raise exception 'Legacy brand name contains unsupported control or format characters' using errcode = '23514';
  end if;
end $$;
-- Migrate names, not the legacy business rows. Pick one deterministic label per owner/key.
insert into public.calc3d_brands (owner_id, name, normalized_name, aliases, revision)
select owner_id, min(label), normalized_name, array[normalized_name], 1
from (
  select owner_id, brand as label, public.calc3d_brand_key(brand) as normalized_name from public.calc3d_spool_profiles
  union all
  select owner_id, brand, public.calc3d_brand_key(brand) from public.calc3d_spools
) legacy
where normalized_name <> ''
group by owner_id, normalized_name;
insert into public.calc3d_brand_aliases (owner_id, alias, brand_id)
select owner_id, normalized_name, id from public.calc3d_brands;

create function public.calc3d_save_brand(payload jsonb, brand_id uuid default null,
  expected_revision bigint default 0) returns public.calc3d_brands
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_brands; label text; key text; shade text;
begin
  if uid is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if coalesce(jsonb_typeof(payload) <> 'object', true) or
     coalesce(jsonb_typeof(payload->'name') <> 'string', true) or
     coalesce(jsonb_typeof(payload->'color') <> 'string', true) or
     expected_revision is null or expected_revision < 0 or expected_revision >= 9007199254740991 or
     (brand_id is null and expected_revision <> 0) or (brand_id is not null and expected_revision = 0) then
    raise exception 'Invalid brand' using errcode = '23514'; end if;
  label := payload->>'name'; shade := payload->>'color';
  if length(label) not between 1 and 120 or label <> btrim(label) or
     public.calc3d_brand_name_has_control(label) or shade !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid brand' using errcode = '23514'; end if;
  label := regexp_replace(label, '[[:space:]]+', ' ', 'g');
  key := public.calc3d_brand_key(label);
  if key = '' then raise exception 'Invalid brand' using errcode = '23514'; end if;
  if brand_id is null then
    insert into public.calc3d_brands (owner_id, name, normalized_name, color, aliases, revision)
      values (uid, label, key, upper(shade), array[key], 1) returning * into r;
  else
    update public.calc3d_brands set name = label, normalized_name = key, color = upper(shade),
      aliases = case when key = any(aliases) then aliases else aliases || key end,
      revision = revision + 1, updated_at = now()
      where id = brand_id and owner_id = uid and revision = expected_revision returning * into r;
    if not found then raise exception 'Brand revision conflict' using errcode = '40001'; end if;
  end if;
  -- A key owned by another brand (including a former name) cannot be recycled.
  insert into public.calc3d_brand_aliases (owner_id, alias, brand_id) values (uid, key, r.id)
    on conflict (owner_id, alias) do update set brand_id = excluded.brand_id
      where public.calc3d_brand_aliases.brand_id = excluded.brand_id;
  if not found then raise exception 'Brand name already in use' using errcode = '23505'; end if;
  return r;
exception when unique_violation then
  raise exception 'Brand name already in use' using errcode = '23505';
end $$;
revoke all on function public.calc3d_save_brand(jsonb,uuid,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_save_brand(jsonb,uuid,bigint) to authenticated;
commit;
