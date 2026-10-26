-- Calc3D-only identity binding. Membership rows and public composite RPC responses stay unchanged.
begin;
create table public.calc3d_member_identities (
  email text primary key references public.calc3d_members(email) on delete cascade,
  user_id uuid unique,
  pending boolean not null default false,
  constraint calc3d_pending_unbound check (not pending or user_id is null)
);
revoke all on public.calc3d_member_identities from public, anon, authenticated;
alter table public.calc3d_member_identities enable row level security;
-- Historical memberships without a confirmed unique Auth identity remain unbound,
-- never pending. No Auth FK, table/row lock, write, grant, or owner change.
do $$ begin
  if exists (select 1 from public.calc3d_members m join auth.users u
      on lower(btrim(u.email)) = m.email and u.email_confirmed_at is not null
      group by m.email having count(*) > 1) then
    raise exception 'Ambiguous Calc3D member identity' using errcode = '23514'; end if;
end $$;
insert into public.calc3d_member_identities (email, user_id)
select m.email, (select u.id from auth.users u where lower(btrim(u.email)) = m.email
  and u.email_confirmed_at is not null)
from public.calc3d_members m;
-- A conflicting Auth update between statements must not leave a partial backfill.
do $$ begin
  if exists (select 1 from public.calc3d_members m join auth.users u
      on lower(btrim(u.email)) = m.email and u.email_confirmed_at is not null
      group by m.email having count(*) > 1) then
    raise exception 'Ambiguous Calc3D member identity' using errcode = '23514'; end if;
end $$;

create or replace function public.calc3d_access_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare address text; membership public.calc3d_members;
begin
  select lower(btrim(u.email)) into address from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null;
  if address is not null then
    select m.* into membership from public.calc3d_members m
      join public.calc3d_member_identities i on i.email = m.email
      where i.user_id = auth.uid() and m.email = address and m.active and not i.pending;
  end if;
  return pg_catalog.jsonb_build_object('allowed', membership.email is not null,
    'role', membership.role, 'email', address);
end $$;

-- Explicit claim; serialize only the Calc3D invitation row, then resolve the
-- confirmed Auth identity/uniqueness in one statement snapshot. Never lock Auth.
create function public.calc3d_claim_invitation() returns public.calc3d_members
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); address text; result public.calc3d_members;
begin
  select lower(btrim(u.email)) into address from auth.users u
    where u.id = uid and u.email_confirmed_at is not null;
  if address is null then
    raise exception 'Confirmed Calc3D identity required' using errcode = '28000'; end if;
  perform 1 from public.calc3d_member_identities where email = address for update;
  -- Re-resolve after the Calc3D row lock; this single query observes one Auth snapshot.
  select lower(btrim(u.email)) into address from auth.users u
    where u.id = uid and u.email_confirmed_at is not null
      and (select count(*) from auth.users v where lower(btrim(v.email)) = lower(btrim(u.email))
           and v.email_confirmed_at is not null) = 1;
  if address is null then
    if exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null) then
      raise exception 'Ambiguous Calc3D member identity' using errcode = '23514'; end if;
    raise exception 'Confirmed Calc3D identity required' using errcode = '28000'; end if;
  select m.* into result from public.calc3d_members m
    join public.calc3d_member_identities i on i.email = m.email where m.email = address
      and m.active and i.pending and i.user_id is null;
  if not found then
    raise exception 'Invitation is not pending' using errcode = '23514'; end if;
  update public.calc3d_member_identities set user_id = uid, pending = false where email = address;
  return result;
end $$;
revoke all on function public.calc3d_claim_invitation() from public, anon, authenticated;
grant execute on function public.calc3d_claim_invitation() to authenticated;

create or replace function public.calc3d_invite_user(invited_email text) returns public.calc3d_members
language plpgsql security definer set search_path = '' as $$
declare address text := lower(btrim(invited_email)); result public.calc3d_members;
declare binding public.calc3d_member_identities;
begin
  perform pg_catalog.pg_advisory_xact_lock(3814690);
  if public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if address is null or length(address) > 254 or
     address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invitation email' using errcode = '23514'; end if;
  select * into result from public.calc3d_members where email = address for update;
  if found then
    select * into binding from public.calc3d_member_identities where email = address for update;
    if binding.user_id is null and not binding.pending then
      raise exception 'Historical Calc3D identity requires reconciliation' using errcode = '23514'; end if;
    if binding.user_id is not null and not exists (
      select 1 from auth.users u where u.id = binding.user_id and u.email_confirmed_at is not null
        and lower(btrim(u.email)) = address) then
      raise exception 'Accepted Calc3D identity cannot be reassigned' using errcode = '23514'; end if;
    update public.calc3d_members set active = true where email = address returning * into result;
  else
    insert into public.calc3d_members(email,role,active)
      values (address,'member',true) returning * into result;
    insert into public.calc3d_member_identities(email,pending) values (address,true);
  end if;
  return result;
end $$;

create or replace function public.calc3d_set_user_active(member_email text, enabled boolean)
returns public.calc3d_members
language plpgsql security definer set search_path = '' as $$
declare address text := lower(btrim(member_email)); result public.calc3d_members;
begin
  perform pg_catalog.pg_advisory_xact_lock(3814690);
  if public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if enabled is null or address is null or length(address) > 254 or
     address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid membership update' using errcode = '23514'; end if;
  select * into result from public.calc3d_members where email = address for update;
  if not found then raise exception 'Member not found' using errcode = '23514'; end if;
  if not enabled and result.role = 'admin' and
     ((select i.user_id from public.calc3d_member_identities i where i.email = address) = auth.uid() or
      (select count(*) from public.calc3d_members m
         join public.calc3d_member_identities i on i.email = m.email
         join auth.users u on u.id = i.user_id
       where m.role = 'admin' and m.active and not i.pending
         and u.email_confirmed_at is not null and lower(btrim(u.email)) = m.email) <= 1) then
    raise exception 'Cannot deactivate self or last admin' using errcode = '23514'; end if;
  update public.calc3d_members set active = enabled where email = address returning * into result;
  return result;
end $$;
commit;
