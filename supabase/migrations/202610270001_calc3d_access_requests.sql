-- Calc3D requests are keyed to confirmed Auth UIDs, never a reusable email address.
-- Applied identity and invitation functions remain unchanged.
begin;
create table public.calc3d_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint calc3d_request_email check (email = lower(btrim(email)) and length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
create index calc3d_access_requests_pending on public.calc3d_access_requests(created_at, id)
  where status = 'pending';
alter table public.calc3d_access_requests enable row level security;
revoke all on public.calc3d_access_requests from public, anon, authenticated;

create function public.calc3d_request_access() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); address text; matching integer; membership public.calc3d_members;
declare binding public.calc3d_member_identities; requested public.calc3d_access_requests;
begin
  -- Unconfirmed, deleted and ambiguous identities cannot generate a request.
  select lower(btrim(u.email)),
    (select count(*) from auth.users v where lower(btrim(v.email)) = lower(btrim(u.email))
      and v.email_confirmed_at is not null)
    into address, matching from auth.users u
    where u.id = actor and u.email_confirmed_at is not null;
  if address is null then
    raise exception 'Confirmed Calc3D identity required' using errcode = '28000'; end if;
  if matching <> 1 then
    raise exception 'Ambiguous Calc3D member identity' using errcode = '23514'; end if;
  if length(address) > 254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid Calc3D identity email' using errcode = '23514'; end if;
  -- A UID already accepted by an inactive membership remains revoked; no self-reactivation.
  select m.* into membership from public.calc3d_members m
    join public.calc3d_member_identities i on i.email = m.email
    where i.user_id = actor and m.email = address and not i.pending;
  if found then
    if membership.active then
      return pg_catalog.jsonb_build_object('state','authorized','request',null);
    end if;
    return pg_catalog.jsonb_build_object('state','revoked','request',null);
  end if;
  -- A preexisting historical or accepted binding cannot be silently replaced by a request.
  select * into binding from public.calc3d_member_identities where email = address;
  if found and (binding.user_id is not null or not binding.pending) then
    raise exception 'Accepted Calc3D identity cannot be reassigned' using errcode = '23514'; end if;
  insert into public.calc3d_access_requests(user_id,email) values (actor,address)
    on conflict (user_id) do nothing;
  select * into requested from public.calc3d_access_requests where user_id = actor;
  return pg_catalog.jsonb_build_object('state',requested.status,'request',to_jsonb(requested));
end $$;

create function public.calc3d_list_access_requests() returns setof public.calc3d_access_requests
language plpgsql security definer set search_path = '' as $$
begin
  if public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  return query select r.* from public.calc3d_access_requests r order by r.created_at desc, r.id desc;
end $$;

create function public.calc3d_review_access_request(request_id uuid, decision text, expected_revision bigint)
returns public.calc3d_access_requests
language plpgsql security definer set search_path = '' as $$
declare requested public.calc3d_access_requests; binding public.calc3d_member_identities;
declare member public.calc3d_members; actual_email text; matching integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(3814690);
  if public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if decision is null or decision not in ('approved','rejected') then
    raise exception 'Invalid access request decision' using errcode = '23514'; end if;
  select * into requested from public.calc3d_access_requests where id = request_id for update;
  if not found then raise exception 'Access request not found' using errcode = '23514'; end if;
  if requested.status <> 'pending' or expected_revision is distinct from requested.revision then
    raise exception 'Access request revision conflict' using errcode = '40001'; end if;
  if decision = 'approved' then
    -- Resolve UID, address and uniqueness in one Auth snapshot after Calc3D locks.
    select lower(btrim(u.email)),
      (select count(*) from auth.users v where v.email_confirmed_at is not null
        and lower(btrim(v.email)) = lower(btrim(u.email)))
      into actual_email, matching from auth.users u
      where u.id = requested.user_id and u.email_confirmed_at is not null;
    if actual_email is distinct from requested.email or matching is distinct from 1 then
      raise exception 'Access request identity changed' using errcode = '23514'; end if;
    select * into member from public.calc3d_members where email = requested.email for update;
    if found then
      select * into binding from public.calc3d_member_identities where email = requested.email for update;
      if not found or member.role <> 'member' or not member.active or binding.user_id is not null
        or not binding.pending then
        raise exception 'Access request membership conflict' using errcode = '23514'; end if;
      update public.calc3d_member_identities set user_id = requested.user_id, pending = false
        where email = requested.email and user_id is null and pending
        returning * into binding;
      if not found or binding.user_id is distinct from requested.user_id or binding.pending then
        raise exception 'Access request membership conflict' using errcode = '23514'; end if;
    else
      -- A stale identity binding is not a fresh invitation.
      if exists (select 1 from public.calc3d_member_identities where email = requested.email) or
        exists (select 1 from public.calc3d_member_identities where user_id = requested.user_id) then
        raise exception 'Access request membership conflict' using errcode = '23514'; end if;
      insert into public.calc3d_members(email,role,active) values (requested.email,'member',true);
      insert into public.calc3d_member_identities(email,user_id,pending)
        values (requested.email,requested.user_id,false);
    end if;
  end if;
  update public.calc3d_access_requests set status = decision, revision = revision + 1,
    updated_at = now(), reviewed_at = now() where id = request_id returning * into requested;
  return requested;
end $$;
revoke all on function public.calc3d_request_access(), public.calc3d_list_access_requests(),
  public.calc3d_review_access_request(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.calc3d_request_access(), public.calc3d_list_access_requests(),
  public.calc3d_review_access_request(uuid,text,bigint) to authenticated;
commit;
