\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare b public.calc3d_brands; r public.calc3d_brands; state text; message text;
declare profile_before jsonb; purchase_before jsonb; spool_before jsonb; quote_before jsonb; counter_before jsonb; brands_before jsonb;
begin
  select to_jsonb(p) into profile_before from public.calc3d_spool_profiles p;
  select to_jsonb(p) into purchase_before from public.calc3d_purchases p;
  select to_jsonb(s) into spool_before from public.calc3d_spools s;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into quote_before from public.calc3d_quotes q;
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into counter_before from public.calc3d_quote_counters c;
  select * into b from public.calc3d_brands;
  if (select count(*) from public.calc3d_brands) <> 1 or b.normalized_name <> 'esun pla' or
     b.aliases <> array['esun pla'] or b.color is not null or b.revision <> 1 then raise exception 'legacy association mismatch'; end if;
  select * into r from public.calc3d_save_brand('{"name":"Fresh Brand","color":"#aBc123"}');
  if r.revision <> 1 or r.color <> '#ABC123' or r.aliases <> array['fresh brand'] then raise exception 'create mismatch'; end if;
  select * into r from public.calc3d_save_brand('{"name":"New  Brand","color":"#112233"}', b.id, 1);
  if r.id <> b.id or r.revision <> 2 or r.normalized_name <> 'new brand' or
     r.aliases <> array['esun pla','new brand'] or r.color <> '#112233' then raise exception 'rename mismatch'; end if;
  select * into r from public.calc3d_save_brand('{"name":"Árbol 🪴","color":"#A0B0C0"}');
  if r.name <> 'Árbol 🪴' or r.normalized_name <> 'árbol 🪴' then raise exception 'legitimate Unicode rejected'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) into brands_before from public.calc3d_brands x;
  if jsonb_array_length(brands_before) <> 3 or
     (select count(*) from public.calc3d_spool_profiles) <> 1 or
     (select count(*) from public.calc3d_purchases) <> 1 or
     (select count(*) from public.calc3d_spools) <> 1 or
     (select count(*) from public.calc3d_quotes) <> 1 or
     (select count(*) from public.calc3d_quote_counters) <> 1 then
    raise exception 'unexpected public pre-rejection row counts'; end if;
  -- The authenticated public RPC must reject Unicode Cc/Cf just as validateBrand does.
  -- In particular U+200B was previously accepted and made the saved row unreadable by the repository.
  for state, message in select * from (values
    (8203, 'zero-width space'), (8205, 'zero-width joiner'), (8288, 'word joiner'),
    (65279, 'byte-order mark'), (1564, 'Arabic letter mark'), (917505, 'supplementary format'),
    (129, 'C1 control')) v(codepoint, label) loop
    begin
      perform public.calc3d_save_brand(jsonb_build_object('name', 'A' || chr(state::integer) || 'B', 'color', '#123456'));
      raise exception 'accepted %', message;
    exception when others then
      if sqlstate <> '23514' or sqlerrm <> 'Invalid brand' then
        raise exception 'wrong control rejection for %: % %', message, sqlstate, sqlerrm; end if;
    end;
  end loop;
  begin
    perform public.calc3d_save_brand(jsonb_build_object('name', 'A' || chr(8203) || 'B', 'color', '#123456'), b.id, 2);
    raise exception 'control update accepted';
  exception when others then
    if sqlstate <> '23514' or sqlerrm <> 'Invalid brand' then
      raise exception 'wrong control update rejection: % %', sqlstate, sqlerrm; end if;
  end;
  if (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.calc3d_brands x) <> brands_before or
     (select to_jsonb(p) from public.calc3d_spool_profiles p) <> profile_before or
     (select to_jsonb(p) from public.calc3d_purchases p) <> purchase_before or
     (select to_jsonb(s) from public.calc3d_spools s) <> spool_before or
     (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.calc3d_quotes q) <> quote_before or
     (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.calc3d_quote_counters c) <> counter_before then
    raise exception 'control rejection changed public brand, business or counter rows'; end if;
  for state, message in select * from (values
    ('23514', 'Invalid brand'), ('23505', 'Brand name already in use'), ('40001', 'Brand revision conflict')) v loop
    begin
      if state = '23514' then perform public.calc3d_save_brand('{"name":"Invalid","color":"red"}');
      elsif state = '23505' then perform public.calc3d_save_brand('{"name":"ESUN PLA","color":"#AABBCC"}');
      else perform public.calc3d_save_brand('{"name":"Again","color":"#AABBCC"}', b.id, 1); end if;
      raise exception 'rejection missing';
    exception when others then
      if sqlstate <> state or sqlerrm <> message then raise exception 'wrong failure: % % expected % %', sqlstate, sqlerrm, state, message; end if;
    end;
  end loop;
  for state, message in select * from (values
    ('{"name":"","color":"#123456"}'::jsonb, 'invalid empty name'),
    ('{"name":"Bad\nName","color":"#123456"}'::jsonb, 'invalid control name'),
    ('{"name":"Valid","color":"#123"}'::jsonb, 'invalid short color'),
    ('{"name":"Valid","color":"#12345678"}'::jsonb, 'invalid long color'),
    ('{"name":"Valid","color":null}'::jsonb, 'invalid null color')) v loop
    begin perform public.calc3d_save_brand(state::jsonb); raise exception '% accepted', message;
    exception when check_violation then
      if sqlerrm <> 'Invalid brand' then raise exception 'wrong invalid feedback: %', sqlerrm; end if;
    end;
  end loop;
  begin perform public.calc3d_save_brand('{"name":"Test","color":"#123456"}', b.id, 0);
    raise exception 'zero update revision accepted';
  exception when check_violation then
    if sqlerrm <> 'Invalid brand' then raise exception 'wrong revision feedback'; end if;
  end;
  begin perform public.calc3d_save_brand('{"name":"Test","color":"#123456"}', null, 1);
    raise exception 'nonzero create revision accepted';
  exception when check_violation then
    if sqlerrm <> 'Invalid brand' then raise exception 'wrong create revision feedback'; end if;
  end;
  if (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.calc3d_brands x) <> brands_before or
     (select to_jsonb(p) from public.calc3d_spool_profiles p) <> profile_before or
     (select to_jsonb(p) from public.calc3d_purchases p) <> purchase_before or
     (select to_jsonb(s) from public.calc3d_spools s) <> spool_before or
     (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.calc3d_quotes q) <> quote_before or
     (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.calc3d_quote_counters c) <> counter_before then
    raise exception 'save or rejected write changed historical state'; end if;
  begin update public.calc3d_brands set color = '#FFFFFF'; raise exception 'direct update accepted';
  exception when insufficient_privilege then null; end;
  perform pg_catalog.set_config('test.brand_id', b.id::text, false);
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ declare b public.calc3d_brands; begin
  select * into b from public.calc3d_brands;
  if (select count(*) from public.calc3d_brands) <> 1 or b.normalized_name <> 'esun pla' or b.color is not null then raise exception 'cross-owner list'; end if;
  begin perform public.calc3d_save_brand('{"name":"Changed","color":"#112233"}', pg_catalog.current_setting('test.brand_id')::uuid, 2);
    raise exception 'cross-owner update accepted'; exception when serialization_failure then null; end;
end $$;
set role anon;
do $$ begin
  if pg_catalog.has_table_privilege('anon', 'public.calc3d_brands', 'select') or
     pg_catalog.has_function_privilege('anon', 'public.calc3d_save_brand(jsonb,uuid,bigint)', 'execute') then raise exception 'anon privilege'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from public.calc3d_brands) <> 0 then raise exception 'anonymous read'; end if;
  begin perform public.calc3d_save_brand('{}'); raise exception 'anonymous write';
  exception when invalid_authorization_specification then null; end;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com', false);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if (select count(*) from public.calc3d_brands) <> 0 then raise exception 'deactivated read'; end if;
  begin perform public.calc3d_save_brand('{}'); raise exception 'deactivated write';
  exception when invalid_authorization_specification then null; end;
end $$;
