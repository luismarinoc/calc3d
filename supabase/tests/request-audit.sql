\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. All behavioral assertions call public RPCs as authenticated.
create function pg_temp.check(ok boolean, description text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'request audit: %',description; end if; end $$;
create function pg_temp.reject(statement text, expected text, description text) returns void
language plpgsql as $$ declare actual text;
begin
  begin execute statement; raise exception 'unexpected success' using errcode='P0001';
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual <> expected then raise exception 'request audit: % expected %, got %',description,expected,actual; end if;
  end;
end $$;
-- The migration must not fabricate historical request events or modify existing business state.
select pg_temp.check((select count(*) from calc3d_audit_private.events where target_type='access_request')=0,
  'migration backfilled an existing request');
set role authenticated;
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $$ declare r jsonb; e record; start_time timestamptz := clock_timestamp();
begin
  r := public.calc3d_request_access();
  perform pg_temp.check(r->>'state'='pending' and r->'request'->>'status'='pending' and
    (r->'request'->>'revision')::bigint=0 and r->'request'->>'user_id'='44444444-4444-4444-8444-444444444444',
    'request DTO or status');
  perform pg_temp.check(public.calc3d_request_access()=r,'repeat request DTO');
  perform pg_temp.check(public.calc3d_access_status()->>'allowed'='false','request granted admission');
  perform pg_temp.reject('select * from public.calc3d_list_audit_events()','28000','applicant listed audit');
  perform pg_temp.reject('select * from calc3d_audit_private.events','42501','private table visible');
  perform pg_temp.reject('select calc3d_audit_private.capture_request()','42501','private helper callable');
  perform pg_temp.reject('select * from public.calc3d_access_requests','42501','applicant read private requests');
end $$;
set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ declare r public.calc3d_access_requests; e record; before_events bigint;
begin
  select * into r from public.calc3d_list_access_requests() where email='applicant@example.com';
  perform pg_temp.check(r.status='pending' and r.revision=0,'admin request list');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where action='access_request.created' and target_id=r.id::text and target_type='access_request'
      and outcome='committed' and actor_id=r.user_id and actor_email='applicant@example.com'
      and ip_address is null and country is null and occurred_at between r.created_at - interval '1 minute' and clock_timestamp())=1,
    'public admin list missing verified created event');
  select count(*) into before_events from public.calc3d_list_audit_events() where target_type='access_request';
  perform pg_temp.check(before_events=1,'repeat request duplicated created event');
  perform pg_temp.reject(format('select public.calc3d_review_access_request(%L::uuid,%L,0)',r.id,'invalid'),
    '23514','invalid review decision');
  perform pg_temp.reject(format('select public.calc3d_review_access_request(%L::uuid,%L,4)',r.id,'approved'),
    '40001','stale CAS');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where target_type='access_request')=before_events,
    'failed reviews recorded event');
  r := public.calc3d_review_access_request(r.id,'approved',0);
  perform pg_temp.check(r.status='approved' and r.revision=1 and r.reviewed_at is not null,
    'approval response');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where action='access_request.approved' and target_id=r.id::text and outcome='committed'
      and actor_id='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6' and actor_email='admin@example.com'
      and ip_address is null and country is null and occurred_at >= r.created_at)=1,
    'approved event actor/target/origin');
  perform pg_temp.reject(format('select public.calc3d_review_access_request(%L::uuid,%L,1)',r.id,'rejected'),
    '40001','repeat review CAS');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where target_type='access_request')=2,
    'repeat review added event');
end $$;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
select pg_temp.check(public.calc3d_request_access()->>'state'='pending','second request');
set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ declare r public.calc3d_access_requests;
begin
  select * into r from public.calc3d_list_access_requests() where email='second@example.com';
  r := public.calc3d_review_access_request(r.id,'rejected',0);
  perform pg_temp.check(r.status='rejected' and r.revision=1,'rejection DTO');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where target_type='access_request' and target_id=r.id::text and action='access_request.rejected'
      and outcome='committed' and actor_id='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6'
      and ip_address is null and country is null)=1,'rejection event');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where target_type='access_request')=4,'request event catalog');
end $$;
reset role;
-- An orphan active membership is a known 23514 approval blocker, not an audit event.
insert into auth.users values ('77777777-7777-4777-8777-777777777777','orphan@example.com',now());
insert into public.calc3d_members(email,role,active) values ('orphan@example.com','member',true);
set role authenticated;
set request.jwt.claim.sub='77777777-7777-4777-8777-777777777777';
select pg_temp.check(public.calc3d_request_access()->>'state'='pending','orphan request');
set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ declare r public.calc3d_access_requests; before_state jsonb;
begin
  select * into r from public.calc3d_list_access_requests() where email='orphan@example.com';
  select jsonb_build_object('request',to_jsonb(r),
    'events',(select count(*) from public.calc3d_list_audit_events() where target_type='access_request'),
    'status',public.calc3d_access_status()) into before_state;
  perform pg_temp.reject(format('select public.calc3d_review_access_request(%L::uuid,%L,0)',r.id,'approved'),
    '23514','orphan missing binding');
  perform pg_temp.check(before_state=jsonb_build_object('request',(select to_jsonb(x) from public.calc3d_list_access_requests() x where x.id=r.id),
    'events',(select count(*) from public.calc3d_list_audit_events() where target_type='access_request'),
    'status',public.calc3d_access_status()), 'failed approval mutated state');
end $$;
reset role;
-- A successful review subsequently aborted must roll back request, membership and both audit categories.
set role authenticated;
set request.jwt.claim.sub='88888888-8888-4888-8888-888888888888';
reset role;
insert into auth.users values ('88888888-8888-4888-8888-888888888888','rollback@example.com',now());
set role authenticated;
set request.jwt.claim.sub='88888888-8888-4888-8888-888888888888';
select pg_temp.check(public.calc3d_request_access()->>'state'='pending','rollback request');
set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ declare r public.calc3d_access_requests; before_count bigint;
begin
  select * into r from public.calc3d_list_access_requests() where email='rollback@example.com';
  select count(*) into before_count from public.calc3d_list_audit_events();
  begin
    perform public.calc3d_review_access_request(r.id,'approved',0);
    raise exception 'rollback probe' using errcode='P0001';
  exception when sqlstate 'P0001' then null;
  end;
  perform pg_temp.check((select status='pending' and revision=0 from public.calc3d_list_access_requests() where id=r.id),
    'rolled-back request status');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events())=before_count,
    'rolled-back request/membership event survived');
  perform pg_temp.check((select count(*) from public.calc3d_list_access_requests() where email='rollback@example.com' and status='pending')=1,
    'rolled-back review was visible');
end $$;
reset role;
set request.jwt.claim.sub='';
insert into public.calc3d_access_requests(user_id,email) values
  ('99999999-9999-4999-8999-999999999999','maintenance@example.com');
select pg_temp.check((select count(*) from calc3d_audit_private.events
  where target_type='access_request' and target_id=(select id::text from public.calc3d_access_requests
    where email='maintenance@example.com') and action='access_request.created'
    and actor_id is null and actor_email is null and ip_address is null and country is null)=1,
  'maintenance falsely attributed');
select pg_temp.check(not has_schema_privilege('anon','calc3d_audit_private','usage') and
  not has_schema_privilege('authenticated','calc3d_audit_private','usage') and
  not has_function_privilege('anon','calc3d_audit_private.capture_request()','execute') and
  not has_function_privilege('authenticated','calc3d_audit_private.capture_request()','execute') and
  not has_table_privilege('authenticated','calc3d_audit_private.events','insert'),
  'request helper privilege leak');
select pg_temp.check((select count(*) from public.calc3d_access_requests where email='historical@example.com' and status='pending')=1 and
  (select count(*) from calc3d_audit_private.events where target_type='access_request' and target_id in
    (select id::text from public.calc3d_access_requests where email='historical@example.com'))=0,
  'old request backfilled');
select pg_temp.check((select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_purchases)=0
  and (select count(*) from public.calc3d_quote_counters)=0 and
  (select count(*) from public.calc3d_member_identities where email='applicant@example.com'
    and user_id='44444444-4444-4444-8444-444444444444' and not pending)=1,
  'business history or approval binding');
