-- Run only in isolated disposable PostgreSQL after all existing Calc3D migrations.
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'audit fixture: %', message; end if; end $$;
create function pg_temp.denied(statement text, state text, message text) returns void
language plpgsql as $$
declare actual text; before_rows bigint; after_rows bigint;
begin
  select count(*) into before_rows from public.calc3d_quotes;
  begin execute statement;
    raise exception 'audit fixture: unexpectedly accepted %', message;
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual <> state then raise exception 'audit fixture: % expected %, got %', message, state, actual; end if;
  end;
  select count(*) into after_rows from public.calc3d_quotes;
  perform pg_temp.check(before_rows = after_rows, message || ' changed business rows');
end $$;

-- Fixtures stay owner-controlled; never give test roles fixture table writes.
insert into public.calc3d_members(email,role,active) values ('member@example.com','member',true);
insert into public.calc3d_member_identities(email,user_id,pending) values
  ('member@example.com','11111111-1111-4111-8111-111111111111',false);
-- The first call above is intentionally owner-role maintenance; audit must label it system.
do $$ begin
  perform pg_temp.check((select actor_id is null from calc3d_audit_private.events
    where action = 'membership.invited' order by occurred_at desc limit 1), 'maintenance impersonation');
end $$;
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
set request.jwt.claim.session_id = '11111111-1111-4111-8111-111111111111';
do $$
declare status jsonb; first_count bigint; second_count bigint; old_count bigint;
declare brand_id uuid; profile_id uuid; cursor_time timestamptz; cursor_id uuid;
begin
  status := public.calc3d_record_access();
  perform pg_temp.check(status->>'role' = 'admin' and status->>'allowed' = 'true', 'admin status DTO');
  select count(*) into first_count from public.calc3d_list_audit_events() where action = 'access.decision';
  status := public.calc3d_record_access();
  select count(*) into second_count from public.calc3d_list_audit_events() where action = 'access.decision';
  perform pg_temp.check(first_count = second_count and first_count = 1, 'same-session bootstrap dedupe');
  perform public.calc3d_invite_user('other@example.com');
  perform public.calc3d_set_user_active('other@example.com', false);
  perform public.calc3d_set_user_active('other@example.com', true);
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where action in ('membership.invited','membership.deactivated','membership.activated')) = 4,
    'membership event catalog');
  perform public.calc3d_save_printers('{"activeId":"demo-printer-p2s","printers":[{"id":"demo-printer-p2s","name":"Printer","modelId":"P2S","watts":130,"electricityPricePerKwh":200,"replacementCost":20000,"replacementLifetimeHours":4000}]}'::jsonb,0);
  perform public.calc3d_save_brand('{"name":"Brand","color":"#AABBCC"}'::jsonb);
  select id into brand_id from public.calc3d_brands where name = 'Brand';
  perform public.calc3d_save_brand('{"name":"Brand 2","color":"#AABBCC"}'::jsonb,brand_id,1);
  perform public.calc3d_archive_brand(brand_id,2);
  perform public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","brand":"","purchasePrice":10,"netWeightGrams":1000}'::jsonb);
  select id into profile_id from public.calc3d_spool_profiles where name = 'PLA';
  perform public.calc3d_save_spool_profile('{"name":"PETG","material":"PETG","brand":"","purchasePrice":10,"netWeightGrams":1000}'::jsonb,profile_id,1);
  perform public.calc3d_archive_spool_profile(profile_id,2);
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where
    action in ('printers.saved','brand.created','brand.updated','brand.archived',
      'profile.created','profile.updated','profile.archived')) = 7, 'editable objects and archives');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where
    actor_email = 'admin@example.com' and actor_id = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6') >= 10,
    'verified actor');
  perform pg_temp.check(not exists (select 1 from public.calc3d_list_audit_events()
    where ip_address is not null or country is not null or target_id like '%@%' or
      action ~ '(password|token|supplier|client)'), 'minimal DTO');
  select occurred_at,id into cursor_time,cursor_id from public.calc3d_list_audit_events(limit_count => 1);
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events(cursor_time,cursor_id,100)) =
    (select count(*) - 1 from public.calc3d_list_audit_events(limit_count => 100)), 'paired cursor');
  perform pg_temp.denied('select * from public.calc3d_list_audit_events(limit_count => 0)', '23514','zero limit');
  perform pg_temp.denied('select * from public.calc3d_list_audit_events(limit_count => 101)', '23514','oversize limit');
  perform pg_temp.denied('select * from public.calc3d_list_audit_events(before_time => now())', '23514','unpaired cursor');
  perform pg_temp.denied('select public.calc3d_prune_audit()', '42501','authenticated prune');
  perform pg_temp.denied('select * from calc3d_audit_private.events', '42501','private schema');
  perform pg_temp.denied('update public.calc3d_quotes set title = ''forged''', '42501','business mutation');
  perform pg_temp.denied('select calc3d_audit_private.capture()', '42501','private helper');
end $$;
-- A real PostgREST JWT exposes claims as JSON; legacy per-claim GUC is cleared.
set request.jwt.claim.sub = '';
set request.jwt.claim.session_id = '';
set request.jwt.claims = '{"sub":"ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
do $$ declare first_count bigint;
begin
  perform pg_temp.check(public.calc3d_record_access()->>'allowed' = 'true', 'JSON JWT actor');
  select count(*) into first_count from public.calc3d_list_audit_events() where action='access.decision';
  perform public.calc3d_record_access();
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where action='access.decision') = first_count, 'JSON JWT session repeat');
end $$;
set request.jwt.claims = '{"sub":"ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
do $$ declare first_count bigint;
begin
  select count(*) into first_count from public.calc3d_list_audit_events() where action='access.decision';
  perform public.calc3d_record_access();
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where action='access.decision') = first_count + 1, 'distinct JSON JWT sessions collapsed');
end $$;
-- A -> B -> A must not inflate a verified A session's unchanged verdict.
set request.jwt.claims = '{"sub":"ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
do $$ declare first_count bigint; before_business jsonb;
begin
  select count(*) into first_count from public.calc3d_list_audit_events() where action='access.decision';
  select jsonb_build_object('quotes',(select count(*) from public.calc3d_quotes),
    'counters',(select coalesce(sum(next_number),0) from public.calc3d_quote_counters),
    'members',(select count(*) from public.calc3d_members)) into before_business;
  perform pg_temp.check(public.calc3d_record_access()->>'allowed' = 'true', 'A return admission');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where action='access.decision') = first_count, 'A-B-A same-session repeat inflated');
  perform pg_temp.check(not exists(select 1 from public.calc3d_list_audit_events()
    where action='access.decision' and (actor_id is distinct from 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6'
      or target_id is distinct from 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6'
      or ip_address is not null or country is not null)), 'access actor/target/origin');
  perform pg_temp.check(before_business = jsonb_build_object('quotes',(select count(*) from public.calc3d_quotes),
    'counters',(select coalesce(sum(next_number),0) from public.calc3d_quote_counters),
    'members',(select count(*) from public.calc3d_members)), 'A-B-A changed business state');
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
set request.jwt.claims = '{malformed';
do $$ begin
  perform pg_temp.check(public.calc3d_record_access()->>'allowed' = 'true', 'malformed session claim blocked admission');
end $$;
set request.jwt.claims = '';
-- A failed business operation rolls back its event/counter in the same transaction.
do $$
declare before_events bigint; before_counter bigint; after_events bigint; after_counter bigint;
begin
  select count(*) into before_events from public.calc3d_list_audit_events();
  select coalesce(max(next_number),0) into before_counter from public.calc3d_quote_counters;
  perform pg_temp.denied('select public.calc3d_save_quote(''{}''::jsonb)', '23514','invalid quote');
  select count(*) into after_events from public.calc3d_list_audit_events();
  select coalesce(max(next_number),0) into after_counter from public.calc3d_quote_counters;
  perform pg_temp.check(before_events = after_events and before_counter = after_counter,
    'rejected quote changed audit/counter');
end $$;
-- Committed public quote and purchase paths emit only IDs, never business payloads.
do $$
declare q public.calc3d_quotes; p public.calc3d_purchases; before_events bigint; before_rows bigint; before_counter bigint;
begin
  q := public.calc3d_save_quote('{"title":"Pieza","spoolId":"s1","client":{"name":"Private Customer","phone":"","email":""},"form":{"purpose":"sale"},"input":{"purpose":"sale","spool":{"purchasePrice":100,"netWeightGrams":100},"grams":10,"hours":0,"minutes":0,"watts":0,"electricityPricePerKwh":0,"markupPercent":100},"result":{"breakdown":{"material":10,"electricity":0,"depreciation":0,"maintenance":0,"labor":0,"extras":0},"totalCost":10,"internalCost":0,"basePrice":20,"discountAmount":0,"surchargeAmount":0,"finalPrice":20,"commercialProfit":10}}'::jsonb);
  perform pg_temp.check(q.number = 'COT-000001' and q.result->>'finalPrice' = '20', 'quote DTO/counter changed');
  p := public.calc3d_save_purchase('{"date":"2026-10-01","supplier":{"name":"Private Supplier"},"lines":[{"material":"PLA","brand":"Brand","color":"Black","purchasePrice":20,"quantity":1,"netWeightGrams":1000}]}'::jsonb);
  perform pg_temp.check(p.total = 20 and p.spool_count = 1 and
    (select count(*) from public.calc3d_spools where purchase_id = p.id) = 1, 'purchase/spool DTO changed');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where
    (action = 'quote.saved' and target_id = q.id::text) or
    (action = 'purchase.saved' and target_id = p.id::text)) = 2, 'public write capture');
  perform pg_temp.check(not exists(select 1 from public.calc3d_list_audit_events()
    where target_id ~ '(Private|Supplier|Customer)'), 'business payload leak');
  select count(*) into before_events from public.calc3d_list_audit_events();
  select count(*) into before_rows from public.calc3d_purchases;
  select next_number into before_counter from public.calc3d_quote_counters where owner_id = q.owner_id;
  perform pg_temp.denied('select public.calc3d_save_purchase(''{}''::jsonb)', '23502','invalid purchase');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()) = before_events and
    (select count(*) from public.calc3d_purchases) = before_rows and
    (select next_number from public.calc3d_quote_counters where owner_id = q.owner_id) = before_counter,
    'rejected purchase changed audit/business/counter');
  -- A later error must roll back even an initially successful public business RPC and trigger.
  begin
    perform public.calc3d_save_printers('{"activeId":"demo-printer-p2s","printers":[{"id":"demo-printer-p2s","name":"Rolled back","modelId":"P2S","watts":130,"electricityPricePerKwh":200,"replacementCost":20000,"replacementLifetimeHours":4000}]}'::jsonb,1);
    raise exception 'fixture rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()) = before_events and
    (select state->'printers'->0->>'name' from public.calc3d_printer_settings where owner_id=q.owner_id) = 'Printer',
    'rolled-back trigger survived business rollback');
end $$;
reset role;
-- Seed and prune in one transaction: now() is the same server cutoff at exact 180 days.
begin;
insert into calc3d_audit_private.events(occurred_at,action,target_type,outcome)
  values (now() - interval '181 days','test.old','application','committed'),
    (now() - interval '180 days','test.boundary','application','committed'),
    (now() - interval '179 days','test.new','application','committed');
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where action = 'test.old') = 0,
    'expired event listed');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where action = 'test.new') = 1,
    'within retention hidden');
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events() where action = 'test.boundary') = 1,
    'exact boundary hidden');
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set request.jwt.claim.session_id = '22222222-2222-4222-8222-222222222222';
do $$
declare status jsonb;
begin
  status := public.calc3d_record_access();
  perform pg_temp.check(status->>'allowed' = 'false', 'uninvited admission');
  perform pg_temp.denied('select * from public.calc3d_list_audit_events()', '28000','non-admin list');
  perform pg_temp.denied('select public.calc3d_prune_audit()', '42501','non-admin prune');
end $$;
set request.jwt.claim.sub = '';
do $$ begin
  perform pg_temp.denied('select public.calc3d_record_access()', '28000','unauthenticated identity');
end $$;
reset role;
-- Admin reads the denied decision and the absence of a fabricated anonymous actor.
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where action = 'access.decision' and outcome = 'denied' and actor_id =
      '22222222-2222-4222-8222-222222222222') = 1, 'denied admission missing');
end $$;
reset role;
-- service_role is the only application grant for physical pruning.
set role service_role;
select pg_temp.check(public.calc3d_prune_audit() = 1, 'service prune exact old row');
reset role;
commit;
do $$ begin
  perform pg_temp.check((select count(*) from calc3d_audit_private.events where action = 'test.old') = 0,
    'old row remained');
  perform pg_temp.check((select count(*) from calc3d_audit_private.events where action = 'test.new') = 1 and
    (select count(*) from calc3d_audit_private.events where action = 'test.boundary') = 1,
    'boundary/new row removed');
  perform pg_temp.check((select count(*) from public.calc3d_brands) = 1 and
    (select count(*) from public.calc3d_spool_profiles) = 1, 'cleanup touched business data');
end $$;
-- In absence of session_id, dedupe is bounded; an admission change still emits a new outcome.
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com',false);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set request.jwt.claim.session_id = '';
do $$ begin
  perform pg_temp.check(public.calc3d_record_access()->>'allowed' = 'false', 'revoked member admitted');
  perform pg_temp.check(public.calc3d_record_access()->>'allowed' = 'false', 'fallback repeat denied');
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where actor_id = '11111111-1111-4111-8111-111111111111' and outcome = 'denied') = 1,
    'revoked decision not captured');
end $$;
select public.calc3d_set_user_active('member@example.com',true);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  perform pg_temp.check(public.calc3d_record_access()->>'allowed' = 'true', 'restored admission');
  perform pg_temp.check(public.calc3d_record_access()->>'allowed' = 'true', 'fallback repeated');
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where actor_id = '11111111-1111-4111-8111-111111111111' and outcome = 'allowed') = 1,
    'changed admission/fallback dedupe');
end $$;
reset role;
-- Same verified session must preserve allowed -> denied -> allowed, not a static uniqueness constraint.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set request.jwt.claim.session_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select pg_temp.check(public.calc3d_record_access()->>'allowed' = 'true', 'C initial admission');
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com',false);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.check(public.calc3d_record_access()->>'allowed' = 'false', 'C denied after revocation');
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com',true);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.check(public.calc3d_record_access()->>'allowed' = 'true', 'C allowed after restoration');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  perform pg_temp.check((select count(*) from public.calc3d_list_audit_events()
    where actor_id='11111111-1111-4111-8111-111111111111' and action='access.decision') = 5,
    'same-session verdict return was collapsed');
  perform pg_temp.check(not exists(select 1 from public.calc3d_list_audit_events()
    where action='access.decision' and (target_id is distinct from actor_id::text
      or ip_address is not null or country is not null)), 'transition actor/target/origin');
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at) values
  ('33333333-3333-4333-8333-333333333333','unconfirmed@example.com',null);
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select pg_temp.denied('select public.calc3d_record_access()', '28000', 'unconfirmed admission');
reset role;
set role anon;
do $$ begin
  perform pg_temp.check(not has_function_privilege('anon','public.calc3d_record_access()','execute') and
    not has_function_privilege('anon','public.calc3d_list_audit_events(timestamptz,uuid,integer)','execute') and
    not has_function_privilege('anon','public.calc3d_prune_audit()','execute') and
    not has_schema_privilege('anon','calc3d_audit_private','usage'), 'anonymous privileges');
end $$;
reset role;
