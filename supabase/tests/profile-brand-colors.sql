\set ON_ERROR_STOP on
select pg_catalog.set_config('test.other_brand', :'other_brand', false);
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare p public.calc3d_spool_profiles; b public.calc3d_brands; original jsonb; historical jsonb;
declare state text; message text; payload jsonb; hex_only_before jsonb; business_before jsonb;
begin
  select * into p from public.calc3d_spool_profiles;
  select * into b from public.calc3d_brands where 'esun pla' = any(aliases);
  perform pg_catalog.set_config('test.member_brand', b.id::text, false);
  if p.brand_id <> b.id or p.brand <> 'eSun  PLA' or p.revision <> 1 or
     p.purchase_price <> 123 or p.net_weight_grams <> 1000 or p.filament_color <> '' or
     p.filament_color_hex is not null then raise exception 'backfill changed legacy presentation'; end if;
  select to_jsonb(x) into original from public.calc3d_spool_profiles x where id = p.id;
  select jsonb_build_object('purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
    'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
    'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
    'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x)) into historical;
  select * into p from public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","purchasePrice":123,"netWeightGrams":1000,"filamentColor":"Azul marino","filamentColorHex":"#aabbcc"}', p.id, 1);
  if p.revision <> 2 or p.brand_id <> b.id or p.filament_color <> 'Azul marino' or p.filament_color_hex <> '#AABBCC' then raise exception 'omission or color mismatch'; end if;
  select to_jsonb(x) into hex_only_before from public.calc3d_spool_profiles x where id = p.id;
  select jsonb_build_object('purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
    'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
    'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
    'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x)) into business_before;
  begin
    perform public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","purchasePrice":123,"netWeightGrams":1000,"filamentColorHex":"#123456"}',p.id,2);
    raise exception 'hex-only update accepted';
  exception when others then
    if sqlstate <> '23514' or sqlerrm <> 'Invalid spool profile' then
      raise exception 'wrong hex-only refusal: % %',sqlstate,sqlerrm; end if;
  end;
  if (select to_jsonb(x) from public.calc3d_spool_profiles x where id=p.id) <> hex_only_before or
     (select jsonb_build_object('purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
       'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
       'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
       'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x))) <> business_before then
    raise exception 'rejected hex-only update changed public profile or business state'; end if;
  select * into p from public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","brand":"unknown legacy","purchasePrice":123,"netWeightGrams":1000}', p.id, 2);
  if p.brand_id is not null or p.brand <> 'unknown legacy' or p.filament_color <> 'Azul marino' or p.filament_color_hex <> '#AABBCC' then raise exception 'unknown legacy must remain readable'; end if;
  select * into p from public.calc3d_save_spool_profile(jsonb_build_object('name','PLA','material','PLA','brandId',b.id,'purchasePrice',123,'netWeightGrams',1000), p.id, 3);
  if p.brand_id <> b.id or p.brand <> b.name or p.filament_color <> 'Azul marino' or p.filament_color_hex <> '#AABBCC' then raise exception 'selected brand mismatch'; end if;
  select * into p from public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","filamentColor":"Verde imposible","filamentColorHex":null,"purchasePrice":123,"netWeightGrams":1000}',p.id,4);
  if p.brand_id <> b.id or p.filament_color <> 'Verde imposible' or p.filament_color_hex is not null then raise exception 'unrepresentable color mismatch'; end if;
  select * into p from public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","brandId":null,"brand":"Historical label","filamentColor":"","purchasePrice":123,"netWeightGrams":1000}',p.id,5);
  if p.brand_id is not null or p.brand <> 'Historical label' or p.filament_color <> '' or p.filament_color_hex is not null then raise exception 'explicit clearing mismatch'; end if;
  select to_jsonb(x) into original from public.calc3d_spool_profiles x where id = p.id;
  for payload, state, message in select * from (values
    ('{"name":"PLA","material":"PLA","purchasePrice":123,"netWeightGrams":1000,"filamentColor":"","filamentColorHex":"#123456"}'::jsonb,'23514','Invalid spool profile'),
    ('{"name":"PLA","material":"PLA","purchasePrice":123,"netWeightGrams":1000,"filamentColor":"Blue","filamentColorHex":"#123"}'::jsonb,'23514','Invalid spool profile'),
    (jsonb_build_object('name','PLA','material','PLA','purchasePrice',123,'netWeightGrams',1000,'filamentColor','a'||chr(8203)),'23514','Invalid spool profile'),
    (jsonb_build_object('name','PLA','material','PLA','brandId',current_setting('test.other_brand'),'purchasePrice',123,'netWeightGrams',1000),'23514','Invalid spool profile'),
    ('{"name":"PLA","material":"PLA","brandId":"invalid","purchasePrice":123,"netWeightGrams":1000}'::jsonb,'23514','Invalid spool profile'),
    ('{"name":"PLA","material":"PLA","purchasePrice":-1,"netWeightGrams":1000}'::jsonb,'23514','Invalid spool profile')) v loop
    begin
      perform public.calc3d_save_spool_profile(payload,p.id,6);
      raise exception 'invalid save accepted';
    exception when others then
      if sqlstate <> state or sqlerrm <> message then raise exception 'wrong refusal: % %',sqlstate,sqlerrm; end if;
    end;
  end loop;
  begin perform public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","purchasePrice":123,"netWeightGrams":1000}',p.id,5);
    raise exception 'stale accepted';
  exception when others then
    if sqlstate <> '40001' or sqlerrm <> 'Spool profile revision conflict' then raise exception 'wrong revision feedback: % %',sqlstate,sqlerrm; end if;
  end;
  if (select to_jsonb(x) from public.calc3d_spool_profiles x where id=p.id) <> original or
     (select jsonb_build_object('purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
       'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
       'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
       'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x))) <> historical then
    raise exception 'rejected write changed public rows or counters'; end if;
  begin update public.calc3d_spool_profiles set brand_id=b.id; raise exception 'direct update accepted';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ declare p public.calc3d_spool_profiles; begin
  select * into p from public.calc3d_spool_profiles;
  if p.brand_id is null or p.brand <> 'eSun PLA' then raise exception 'owner backfill mismatch'; end if;
  begin perform public.calc3d_save_spool_profile(jsonb_build_object('name','Other','material','PLA','brandId',
    current_setting('test.member_brand')::uuid,'purchasePrice',321,'netWeightGrams',500),p.id,1);
    raise exception 'foreign brand accepted';
  exception when check_violation then
    if sqlerrm <> 'Invalid spool profile' then raise; end if;
  end;
end $$;
set role anon;
do $$ begin
  if pg_catalog.has_table_privilege('anon','public.calc3d_spool_profiles','update') or
     pg_catalog.has_function_privilege('anon','public.calc3d_save_spool_profile(jsonb,uuid,bigint)','execute') then raise exception 'anon privilege'; end if;
end $$;
