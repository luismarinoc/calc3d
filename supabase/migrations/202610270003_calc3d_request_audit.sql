-- Add request transitions to the existing private audit stream, without rewriting
-- request RPCs or historical rows. AFTER triggers participate in their caller's transaction.
begin;
create function calc3d_audit_private.capture_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); address text; action_name text;
begin
  if TG_OP = 'INSERT' then
    if NEW.status = 'pending' then action_name := 'access_request.created'; end if;
  elsif OLD.status = 'pending' and NEW.status in ('approved','rejected') then
    action_name := 'access_request.' || NEW.status;
  end if;
  if action_name is null then return NEW; end if;
  -- An Auth UID is not sufficient attribution unless its current, uniquely
  -- confirmed email resolves on the server. Never trust request row actor fields.
  select pg_catalog.lower(pg_catalog.btrim(u.email)) into address from auth.users u
    where u.id = uid and u.email_confirmed_at is not null and
      (select count(*) from auth.users v where v.email_confirmed_at is not null
        and pg_catalog.lower(pg_catalog.btrim(v.email)) = pg_catalog.lower(pg_catalog.btrim(u.email))) = 1;
  if address is null then uid := null; end if;
  insert into calc3d_audit_private.events
    (actor_id,actor_email,action,target_type,target_id,outcome)
    values (uid,address,action_name,'access_request',NEW.id::text,'committed');
  return NEW;
end $$;
revoke all on function calc3d_audit_private.capture_request() from public, anon, authenticated;
create trigger calc3d_audit_request after insert or update on public.calc3d_access_requests
  for each row execute function calc3d_audit_private.capture_request();
commit;
