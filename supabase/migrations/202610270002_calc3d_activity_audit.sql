-- Calc3D-only, additive audit. No shared Auth triggers and no scheduler installation.
begin;
create schema calc3d_audit_private;
revoke all on schema calc3d_audit_private from public, anon, authenticated;

create table calc3d_audit_private.events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id text,
  outcome text not null check (outcome in ('allowed', 'denied', 'committed')),
  session_key text,
  ip_address text,
  country text,
  check (ip_address is null and country is null)
);
create index calc3d_audit_events_page on calc3d_audit_private.events (occurred_at desc, id desc);
create index calc3d_audit_access_recent on calc3d_audit_private.events (actor_id, occurred_at desc)
  where action = 'access.decision';
alter table calc3d_audit_private.events enable row level security;
revoke all on calc3d_audit_private.events from public, anon, authenticated;

-- This helper is callable only from owned triggers; never grant schema usage or EXECUTE.
create function calc3d_audit_private.capture() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); address text; subject text; operation text;
declare target text; old_archive timestamptz; new_archive timestamptz;
begin
  -- Do not attribute service/owner maintenance to an application user unless a
  -- verified, unique confirmed Auth row matches the claimed UID.
  select pg_catalog.lower(pg_catalog.btrim(u.email)) into address from auth.users u
    where u.id = uid and u.email_confirmed_at is not null and
      (select count(*) from auth.users v where v.email_confirmed_at is not null
        and pg_catalog.lower(pg_catalog.btrim(v.email)) = pg_catalog.lower(pg_catalog.btrim(u.email))) = 1;
  if address is null then uid := null; end if;
  subject := TG_ARGV[0];
  if subject = 'membership' then
    select i.user_id::text into target from public.calc3d_member_identities i
      where i.email = (case when TG_OP = 'DELETE' then OLD.email else NEW.email end);
    operation := case when TG_OP = 'INSERT' then 'invited'
      when NEW.active and not OLD.active then 'activated'
      when not NEW.active and OLD.active then 'deactivated' else null end;
  elsif subject = 'identity' then
    target := case when TG_OP = 'DELETE' then OLD.user_id::text else NEW.user_id::text end;
    operation := case when TG_OP = 'UPDATE' and OLD.pending and not NEW.pending and NEW.user_id is not null
      then 'claimed' else null end;
  else
    if subject = 'printers' then
      target := case when TG_OP = 'DELETE' then OLD.owner_id::text else NEW.owner_id::text end;
    else
      target := case when TG_OP = 'DELETE' then OLD.id::text else NEW.id::text end;
    end if;
    if subject in ('brand', 'profile') then
      old_archive := case when TG_OP = 'UPDATE' then OLD.archived_at else null end;
      new_archive := case when TG_OP <> 'DELETE' then NEW.archived_at else null end;
      operation := case when TG_OP = 'UPDATE' and old_archive is null and new_archive is not null
        then 'archived' when TG_OP = 'INSERT' then 'created' when TG_OP = 'UPDATE' then 'updated' else null end;
    else
      operation := case when TG_OP = 'INSERT' or TG_OP = 'UPDATE' then 'saved' else null end;
    end if;
  end if;
  if operation is not null then
    insert into calc3d_audit_private.events (actor_id, actor_email, action, target_type, target_id, outcome)
      values (uid, address, subject || '.' || operation, subject, target, 'committed');
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end $$;
revoke all on function calc3d_audit_private.capture() from public, anon, authenticated;

create trigger calc3d_audit_quote after insert on public.calc3d_quotes
  for each row execute function calc3d_audit_private.capture('quote');
create trigger calc3d_audit_purchase after insert on public.calc3d_purchases
  for each row execute function calc3d_audit_private.capture('purchase');
create trigger calc3d_audit_printers after insert or update on public.calc3d_printer_settings
  for each row execute function calc3d_audit_private.capture('printers');
create trigger calc3d_audit_profile after insert or update on public.calc3d_spool_profiles
  for each row execute function calc3d_audit_private.capture('profile');
create trigger calc3d_audit_brand after insert or update on public.calc3d_brands
  for each row execute function calc3d_audit_private.capture('brand');
create trigger calc3d_audit_membership after insert or update on public.calc3d_members
  for each row execute function calc3d_audit_private.capture('membership');
create trigger calc3d_audit_identity after update on public.calc3d_member_identities
  for each row execute function calc3d_audit_private.capture('identity');

-- Evaluates admission in this very call. A signed JWT session_id, when supplied by
-- the gateway, scopes dedupe to that session; otherwise a five-minute actor window
-- suppresses repeat bootstrap, but a changed decision is always recorded.
create function public.calc3d_record_access() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); address text; result jsonb; verdict text;
declare claim text; claims jsonb; v_session_key text; previous record;
begin
  select pg_catalog.lower(pg_catalog.btrim(u.email)) into address from auth.users u
    where u.id = uid and u.email_confirmed_at is not null and
      (select count(*) from auth.users v where v.email_confirmed_at is not null
        and pg_catalog.lower(pg_catalog.btrim(v.email)) = pg_catalog.lower(pg_catalog.btrim(u.email))) = 1;
  if address is null then raise exception 'Confirmed Calc3D identity required' using errcode = '28000'; end if;
  -- Serialize only audit bootstrap for this actor; not Auth or application tables.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text), 3814691);
  result := public.calc3d_access_status();
  verdict := case when (result->>'allowed')::boolean then 'allowed' else 'denied' end;
  -- PostgREST exposes verified JWT claims as JSON. Older gateway versions may
  -- expose individual claims; invalid/missing JSON never blocks admission.
  begin
    claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
  exception when invalid_text_representation then claims := null;
  end;
  claim := case when pg_catalog.jsonb_typeof(claims) = 'object'
    then claims->>'session_id' else pg_catalog.current_setting('request.jwt.claim.session_id', true) end;
  if claim ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    v_session_key := pg_catalog.md5(uid::text || ':' || claim);
  end if;
  -- A signed session compares against its own latest decision, not another
  -- session's interleaved event. Without a session, use the actor's latest event.
  select e.outcome, e.occurred_at into previous
    from calc3d_audit_private.events e where e.action = 'access.decision' and e.actor_id = uid
      and (v_session_key is null or e.session_key = v_session_key)
    order by e.occurred_at desc, e.id desc limit 1;
  if not found or previous.outcome <> verdict or
     (v_session_key is null and previous.occurred_at <= pg_catalog.clock_timestamp() - interval '5 minutes') then
    insert into calc3d_audit_private.events (actor_id, actor_email, action, target_type, target_id, outcome, session_key)
      values (uid, address, 'access.decision', 'application', uid::text, verdict, v_session_key);
  end if;
  return result;
end $$;
revoke all on function public.calc3d_record_access() from public, anon, authenticated;
grant execute on function public.calc3d_record_access() to authenticated;

create function public.calc3d_list_audit_events(before_time timestamptz default null,
  before_id uuid default null, limit_count integer default 50)
returns table (id uuid, occurred_at timestamptz, actor_id uuid, actor_email text,
  action text, target_type text, target_id text, outcome text, ip_address text, country text)
language plpgsql security definer set search_path = '' as $$
begin
  if public.calc3d_access_status()->>'role' is distinct from 'admin' then
    raise exception 'Calc3D admin required' using errcode = '28000'; end if;
  if limit_count is null or limit_count not between 1 and 100 or
     (before_time is null) <> (before_id is null) then
    raise exception 'Invalid audit cursor or limit' using errcode = '23514'; end if;
  return query select e.id, e.occurred_at, e.actor_id, e.actor_email, e.action,
    e.target_type, e.target_id, e.outcome, e.ip_address, e.country
    from calc3d_audit_private.events e
    where e.occurred_at >= pg_catalog.now() - interval '180 days'
      and (before_time is null or (e.occurred_at, e.id) < (before_time, before_id))
    order by e.occurred_at desc, e.id desc limit limit_count;
end $$;
revoke all on function public.calc3d_list_audit_events(timestamptz,uuid,integer) from public, anon, authenticated;
grant execute on function public.calc3d_list_audit_events(timestamptz,uuid,integer) to authenticated;

-- No caller-provided cutoff. Only an authorized daily job can make physical
-- deletion timely; this function itself does not schedule or install one.
create function public.calc3d_prune_audit() returns bigint
language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  delete from calc3d_audit_private.events
    where occurred_at < pg_catalog.now() - interval '180 days';
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.calc3d_prune_audit() from public, anon, authenticated;
grant execute on function public.calc3d_prune_audit() to service_role;
commit;
