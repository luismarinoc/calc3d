-- Archive configuration identities without deleting references, aliases or historical business rows.
begin;
alter table public.calc3d_brands add column archived_at timestamptz;
alter table public.calc3d_spool_profiles add column archived_at timestamptz;

create function public.calc3d_archive_brand(brand_id uuid, expected_revision bigint)
returns public.calc3d_brands language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_brands;
begin
  if uid is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if brand_id is null or expected_revision is null or expected_revision <= 0 or
     expected_revision >= 9007199254740991 then
    raise exception 'Invalid brand archive' using errcode = '23514'; end if;
  update public.calc3d_brands set archived_at = now(), revision = revision + 1, updated_at = now()
    where id = brand_id and owner_id = uid and revision = expected_revision and archived_at is null
    returning * into r;
  if not found then raise exception 'Brand revision conflict' using errcode = '40001'; end if;
  return r;
end $$;
revoke all on function public.calc3d_archive_brand(uuid,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_archive_brand(uuid,bigint) to authenticated;

create function public.calc3d_archive_spool_profile(profile_id uuid, expected_revision bigint)
returns public.calc3d_spool_profiles language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_spool_profiles;
begin
  if uid is null or not coalesce((public.calc3d_access_status()->>'allowed')::boolean, false) then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  if profile_id is null or expected_revision is null or expected_revision <= 0 or
     expected_revision >= 9007199254740991 then
    raise exception 'Invalid spool profile archive' using errcode = '23514'; end if;
  update public.calc3d_spool_profiles set archived_at = now(), revision = revision + 1, updated_at = now()
    where id = profile_id and owner_id = uid and revision = expected_revision and archived_at is null
    returning * into r;
  if not found then raise exception 'Spool profile revision conflict' using errcode = '40001'; end if;
  return r;
end $$;
revoke all on function public.calc3d_archive_spool_profile(uuid,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_archive_spool_profile(uuid,bigint) to authenticated;
commit;
