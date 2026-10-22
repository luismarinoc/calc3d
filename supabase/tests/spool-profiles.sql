-- Isolated PostgreSQL fixture: public interfaces only, under client roles and JWT claims.
\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_invite_user('member@example.com');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare payload jsonb := '{"name":"PLA 1 kg","material":"PLA+","brand":"","purchasePrice":21900,"netWeightGrams":1000.5}';
declare r public.calc3d_spool_profiles; updated public.calc3d_spool_profiles;
declare bad jsonb; before_rejection jsonb; denied_state text; denied_message text;
begin
  select * into r from public.calc3d_save_spool_profile(payload);
  if r.id is null or r.owner_id <> '11111111-1111-4111-8111-111111111111'::uuid or r.revision <> 1 or
     r.name <> 'PLA 1 kg' or r.material <> 'PLA+' or r.brand <> '' or
     r.purchase_price <> 21900 or r.net_weight_grams <> 1000.5 or
     r.created_at is null or r.updated_at is null or r.created_at <> r.updated_at or
     (select count(*) from public.calc3d_spool_profiles) <> 1 then
    raise exception 'create result or owner list mismatch'; end if;
  select * into updated from public.calc3d_save_spool_profile(
    payload || '{"name":"PETG refill","material":"PETG","brand":"Acme","purchasePrice":0,"netWeightGrams":750}'::jsonb,
    r.id, 1);
  if updated.id <> r.id or updated.revision <> 2 or updated.created_at <> r.created_at or
     updated.name <> 'PETG refill' or updated.material <> 'PETG' or updated.brand <> 'Acme' or
     updated.purchase_price <> 0 or updated.net_weight_grams <> 750 or
     (select count(*) from public.calc3d_spool_profiles) <> 1 then
    raise exception 'update result mismatch'; end if;
  before_rejection := to_jsonb(updated);
  begin
    perform public.calc3d_save_spool_profile(payload || '{"netWeightGrams":0}'::jsonb, r.id, 2);
    raise exception 'invalid weight update accepted';
  exception when check_violation then
    get stacked diagnostics denied_state = returned_sqlstate, denied_message = message_text;
    if denied_state <> '23514' or denied_message <> 'Invalid spool profile' then
      raise exception 'invalid weight rejection contract changed'; end if;
  end;
  if (select to_jsonb(profile) from public.calc3d_spool_profiles profile where profile.id = r.id)
      is distinct from before_rejection then
    raise exception 'invalid weight update changed stored row'; end if;
  begin perform public.calc3d_save_spool_profile(payload, r.id, 1);
    raise exception 'stale revision accepted';
  exception when serialization_failure then null; end;
  begin perform public.calc3d_save_spool_profile(payload, null, 1);
    raise exception 'nonzero create revision accepted';
  exception when check_violation then null; end;
  begin perform public.calc3d_save_spool_profile(payload, r.id, 0);
    raise exception 'zero update revision accepted';
  exception when check_violation then null; end;
  begin perform public.calc3d_save_spool_profile(payload, r.id, 9007199254740991);
    raise exception 'unsafe revision accepted';
  exception when check_violation then null; end;
  foreach bad in array array[
    'null'::jsonb, '[]'::jsonb, '{"name":5}'::jsonb,
    payload - 'name', payload || '{"name":"  "}'::jsonb,
    payload || pg_catalog.jsonb_build_object('name', repeat('x',121)),
    payload || '{"name":" A"}'::jsonb, payload || '{"material":""}'::jsonb,
    payload - 'material', payload || '{"material":null}'::jsonb,
    payload || pg_catalog.jsonb_build_object('material', repeat('x',121)),
    payload || '{"brand":12}'::jsonb, payload || pg_catalog.jsonb_build_object('brand', repeat('x',121)),
    payload || '{"purchasePrice":-1}'::jsonb, payload || '{"purchasePrice":1.5}'::jsonb,
    payload || '{"purchasePrice":9007199254740992}'::jsonb,
    payload || '{"purchasePrice":"21900"}'::jsonb, payload - 'purchasePrice',
    payload || '{"netWeightGrams":0}'::jsonb, payload || '{"netWeightGrams":-1}'::jsonb,
    payload || '{"netWeightGrams":"1000"}'::jsonb, payload - 'netWeightGrams',
    payload || '{"netWeightGrams":1e1000}'::jsonb
  ] loop
    begin perform public.calc3d_save_spool_profile(bad, r.id, 2);
      raise exception 'invalid profile accepted: %', bad;
    exception when check_violation then null; end;
  end loop;
  begin perform public.calc3d_save_spool_profile(payload - 'name');
    raise exception 'invalid create accepted';
  exception when check_violation then null; end;
  if (select count(*) from public.calc3d_spool_profiles) <> 1 or
     (select revision from public.calc3d_spool_profiles) <> 2 or
     (select name from public.calc3d_spool_profiles) <> 'PETG refill' or
     (select count(*) from public.calc3d_quotes) <> 0 or
     (select count(*) from public.calc3d_quote_counters) <> 0 or
     (select count(*) from public.calc3d_purchases) <> 0 then
    raise exception 'rejected input changed stored data or counters'; end if;
  begin update public.calc3d_spool_profiles set purchase_price = 10;
    raise exception 'direct mutation accepted';
  exception when insufficient_privilege then null; end;
  perform pg_catalog.set_config('test.profile_id', r.id::text, false);
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  if (select count(*) from public.calc3d_spool_profiles) <> 0 then raise exception 'cross-owner read'; end if;
  begin perform public.calc3d_save_spool_profile('{"name":"Other","material":"PLA","brand":"","purchasePrice":1,"netWeightGrams":1}',
    pg_catalog.current_setting('test.profile_id')::uuid, 2);
    raise exception 'cross-owner update accepted';
  exception when serialization_failure then null; end;
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select count(*) from public.calc3d_spool_profiles) <> 0 then raise exception 'uninvited read'; end if;
  begin perform public.calc3d_save_spool_profile('{}'); raise exception 'uninvited save';
  exception when invalid_authorization_specification then null; end;
end $$;
set role anon;
do $$ begin
  if pg_catalog.has_table_privilege('anon', 'public.calc3d_spool_profiles', 'select') or
     pg_catalog.has_function_privilege('anon', 'public.calc3d_save_spool_profile(jsonb,uuid,bigint)', 'execute') then
    raise exception 'anonymous privilege'; end if;
  begin perform public.calc3d_save_spool_profile('{}'); raise exception 'anonymous save';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com', false);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if (select count(*) from public.calc3d_spool_profiles) <> 0 then raise exception 'revoked read'; end if;
  begin perform public.calc3d_save_spool_profile('{}'); raise exception 'revoked save';
  exception when invalid_authorization_specification then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.calc3d_spool_profiles) <> 1 or
     (select revision from public.calc3d_spool_profiles) <> 2 then
    raise exception 'rejected writes changed underlying row'; end if;
end $$;
