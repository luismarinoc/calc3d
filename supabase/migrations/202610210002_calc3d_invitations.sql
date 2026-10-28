-- Apply after 202610210001 as the migration owner. Invitations authorize emails; they do not create Auth users.
begin;
create table public.calc3d_members (
  email text primary key,
  role text not null check (role in ('admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint calc3d_member_email check (email = lower(btrim(email)) and length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
alter table public.calc3d_members enable row level security;
revoke all on public.calc3d_members from public, anon, authenticated;
grant select on public.calc3d_members to authenticated;

-- Fail the migration if the expected, already-confirmed Auth account is absent.
do $$ begin
  if not exists (select 1 from auth.users where id = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6'
      and email_confirmed_at is not null and email is not null) then
    raise exception 'Calc3D bootstrap requires the existing confirmed Auth account';
  end if;
end $$;
insert into public.calc3d_members (email, role, active)
select lower(btrim(email)), 'admin', true from auth.users
where id = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';

-- Resolve identity from the actual confirmed Auth row, never from client-provided email/metadata.
create function public.calc3d_access_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare address text; membership public.calc3d_members;
begin
  select lower(btrim(u.email)) into address from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null;
  if address is not null then
    select * into membership from public.calc3d_members m where m.email = address and m.active;
  end if;
  return pg_catalog.jsonb_build_object('allowed', membership.email is not null,
    'role', membership.role, 'email', address);
end $$;
revoke all on function public.calc3d_access_status() from public, anon, authenticated;
grant execute on function public.calc3d_access_status() to authenticated;

create policy calc3d_admin_read on public.calc3d_members for select to authenticated
  using (public.calc3d_access_status()->>'role' = 'admin');
-- The existing owner policies are permissive: replace them rather than add a second OR policy.
drop policy calc3d_owner_read on public.calc3d_quote_counters;
drop policy calc3d_owner_read on public.calc3d_quotes;
drop policy calc3d_owner_read on public.calc3d_printer_settings;
drop policy calc3d_owner_read on public.calc3d_purchases;
drop policy calc3d_owner_read on public.calc3d_spools;
create policy calc3d_member_owner_read on public.calc3d_quote_counters for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
create policy calc3d_member_owner_read on public.calc3d_quotes for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
create policy calc3d_member_owner_read on public.calc3d_printer_settings for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
create policy calc3d_member_owner_read on public.calc3d_purchases for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));
create policy calc3d_member_owner_read on public.calc3d_spools for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.calc3d_access_status()->>'allowed')::boolean));

-- Keep the deployed validators and write logic intact; hide the renamed definer cores.
alter function public.calc3d_save_quote(jsonb) rename to calc3d_save_quote_core;
alter function public.calc3d_save_printers(jsonb, bigint) rename to calc3d_save_printers_core;
alter function public.calc3d_save_purchase(jsonb) rename to calc3d_save_purchase_core;
revoke all on function public.calc3d_save_quote_core(jsonb),
  public.calc3d_save_printers_core(jsonb, bigint), public.calc3d_save_purchase_core(jsonb)
  from public, anon, authenticated;
create function public.calc3d_save_quote(payload jsonb) returns public.calc3d_quotes
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.calc3d_access_status()->>'allowed')::boolean then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  return public.calc3d_save_quote_core(payload);
end $$;
create function public.calc3d_save_printers(payload jsonb, expected_revision bigint)
returns public.calc3d_printer_settings
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.calc3d_access_status()->>'allowed')::boolean then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  return public.calc3d_save_printers_core(payload, expected_revision);
end $$;
create function public.calc3d_save_purchase(payload jsonb) returns public.calc3d_purchases
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.calc3d_access_status()->>'allowed')::boolean then
    raise exception 'Calc3D access denied' using errcode = '28000'; end if;
  return public.calc3d_save_purchase_core(payload);
end $$;
revoke all on function public.calc3d_save_quote(jsonb), public.calc3d_save_printers(jsonb, bigint),
  public.calc3d_save_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.calc3d_save_quote(jsonb), public.calc3d_save_printers(jsonb, bigint),
  public.calc3d_save_purchase(jsonb) to authenticated;

create function public.calc3d_invite_user(invited_email text) returns public.calc3d_members
language plpgsql security definer set search_path = '' as $$
declare address text := lower(btrim(invited_email)); result public.calc3d_members;
begin
  if public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if address is null or length(address) > 254 or
     address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invitation email' using errcode = '23514'; end if;
  insert into public.calc3d_members (email, role, active) values (address, 'member', true)
    on conflict (email) do update set active = true returning * into result;
  return result;
end $$;
create function public.calc3d_set_user_active(member_email text, enabled boolean)
returns public.calc3d_members
language plpgsql security definer set search_path = '' as $$
declare address text := lower(btrim(member_email)); result public.calc3d_members;
begin
  -- Serialize administrative changes to prevent concurrent last-admin deactivation.
  perform pg_catalog.pg_advisory_xact_lock(3814690);
  if public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if enabled is null or address is null or length(address) > 254 or
     address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid membership update' using errcode = '23514'; end if;
  select * into result from public.calc3d_members where email = address for update;
  if not found then raise exception 'Member not found' using errcode = '23514'; end if;
  if not enabled and result.role = 'admin' and
     (address = lower(btrim((select u.email from auth.users u where u.id = auth.uid()))) or
      (select count(*) from public.calc3d_members where role = 'admin' and active) <= 1) then
    raise exception 'Cannot deactivate self or last admin' using errcode = '23514'; end if;
  update public.calc3d_members set active = enabled where email = address returning * into result;
  return result;
end $$;
revoke all on function public.calc3d_invite_user(text), public.calc3d_set_user_active(text, boolean)
  from public, anon, authenticated;
grant execute on function public.calc3d_invite_user(text), public.calc3d_set_user_active(text, boolean)
  to authenticated;
commit;
