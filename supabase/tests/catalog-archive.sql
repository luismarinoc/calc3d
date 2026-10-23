\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare b public.calc3d_brands; p public.calc3d_spool_profiles; original jsonb; history jsonb;
declare code text; msg text; target text; fresh jsonb;
begin
  select * into b from public.calc3d_brands;
  select * into p from public.calc3d_spool_profiles;
  if p.brand_id <> b.id then raise exception 'fixture association missing'; end if;
  select jsonb_build_object('brands',(select jsonb_agg(to_jsonb(x)) from public.calc3d_brands x),
    'profiles',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spool_profiles x),
    'purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
    'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
    'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
    'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x)) into original;
  for target, code, msg in select * from (values
    ('brand-null','23514','Invalid brand archive'),('brand-zero','23514','Invalid brand archive'),
    ('profile-null','23514','Invalid spool profile archive'),('profile-zero','23514','Invalid spool profile archive'),
    ('brand-foreign','40001','Brand revision conflict'),('profile-foreign','40001','Spool profile revision conflict')) v loop
    begin
      case target
      when 'brand-null' then perform public.calc3d_archive_brand(null,1);
      when 'brand-zero' then perform public.calc3d_archive_brand(b.id,0);
      when 'profile-null' then perform public.calc3d_archive_spool_profile(null,1);
      when 'profile-zero' then perform public.calc3d_archive_spool_profile(p.id,0);
      when 'brand-foreign' then perform public.calc3d_archive_brand('22222222-2222-4222-8222-222222222222',1);
      when 'profile-foreign' then perform public.calc3d_archive_spool_profile('22222222-2222-4222-8222-222222222222',1);
      end case;
      raise exception 'archive accepted %',target;
    exception when others then
      if sqlstate <> code or sqlerrm <> msg then raise exception 'wrong % rejection % %',target,sqlstate,sqlerrm; end if;
    end;
  end loop;
  select jsonb_build_object('brands',(select jsonb_agg(to_jsonb(x)) from public.calc3d_brands x),
    'profiles',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spool_profiles x),
    'purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
    'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
    'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
    'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x)) into fresh;
  if fresh <> original then raise exception 'rejected archive mutated public rows'; end if;
  select jsonb_build_object('purchases',original->'purchases','spools',original->'spools',
    'quotes',original->'quotes','counters',original->'counters') into history;
  select * into b from public.calc3d_archive_brand(b.id,b.revision);
  if b.archived_at is null or b.revision <> 2 or b.updated_at = (original->'brands'->0->>'updated_at')::timestamptz then
    raise exception 'brand archive metadata mismatch'; end if;
  select * into p from public.calc3d_spool_profiles where id=p.id;
  if p.brand_id <> b.id or p.archived_at is not null or p.purchase_price <> 123 or p.net_weight_grams <> 1000 or
     p.revision <> 2 or p.filament_color <> 'Azul' or p.filament_color_hex <> '#123456' then
    raise exception 'brand archive changed linked profile'; end if;
  begin perform public.calc3d_archive_brand(b.id,2); raise exception 'repeat brand archive accepted';
  exception when others then if sqlstate <> '40001' or sqlerrm <> 'Brand revision conflict' then raise; end if; end;
  begin perform public.calc3d_archive_brand(b.id,1); raise exception 'stale brand archive accepted';
  exception when others then if sqlstate <> '40001' or sqlerrm <> 'Brand revision conflict' then raise; end if; end;
  select * into p from public.calc3d_archive_spool_profile(p.id,p.revision);
  if p.archived_at is null or p.revision <> 3 or p.brand_id <> b.id or p.purchase_price <> 123 or
     p.net_weight_grams <> 1000 then raise exception 'profile archive mutated financial/brand fields'; end if;
  begin perform public.calc3d_archive_spool_profile(p.id,3); raise exception 'repeat profile archive accepted';
  exception when others then if sqlstate <> '40001' or sqlerrm <> 'Spool profile revision conflict' then raise; end if; end;
  begin perform public.calc3d_archive_spool_profile(p.id,2); raise exception 'stale profile archive accepted';
  exception when others then if sqlstate <> '40001' or sqlerrm <> 'Spool profile revision conflict' then raise; end if; end;
  -- Old save payloads can still update but cannot erase archive metadata.
  select * into b from public.calc3d_save_brand('{"name":"eSun PLA","color":"#123456"}',b.id,2);
  select * into p from public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","purchasePrice":123,"netWeightGrams":1000}',p.id,3);
  if b.archived_at is null or p.archived_at is null or p.brand_id <> b.id or p.purchase_price <> 123 then
    raise exception 'older save unarchived records'; end if;
  if (select jsonb_build_object('purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
    'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
    'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
    'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x))) <> history then
    raise exception 'archive changed historical business rows'; end if;
  perform pg_catalog.set_config('test.archive.brand',b.id::text,false);
  perform pg_catalog.set_config('test.archive.profile',p.id::text,false);
  begin update public.calc3d_brands set archived_at=null; raise exception 'direct brand update accepted';
  exception when insufficient_privilege then null; end;
  begin update public.calc3d_spool_profiles set archived_at=null; raise exception 'direct profile update accepted';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  begin perform public.calc3d_archive_brand(pg_catalog.current_setting('test.archive.brand')::uuid,3);
  raise exception 'foreign brand archive accepted';
  exception when others then if sqlstate <> '40001' or sqlerrm <> 'Brand revision conflict' then raise; end if; end;
  begin perform public.calc3d_archive_spool_profile(pg_catalog.current_setting('test.archive.profile')::uuid,4);
  raise exception 'foreign profile archive accepted';
  exception when others then if sqlstate <> '40001' or sqlerrm <> 'Spool profile revision conflict' then raise; end if; end;
end $$;
set role anon;
do $$ begin
  if pg_catalog.has_function_privilege('anon','public.calc3d_archive_brand(uuid,bigint)','execute') or
     pg_catalog.has_function_privilege('anon','public.calc3d_archive_spool_profile(uuid,bigint)','execute') then raise exception 'anon RPC grant'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '';
do $$ begin
  begin perform public.calc3d_archive_brand(pg_catalog.current_setting('test.archive.brand')::uuid,3);
  raise exception 'anonymous archive accepted'; exception when others then
    if sqlstate <> '28000' or sqlerrm <> 'Calc3D access denied' then raise; end if; end;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com',false);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  begin perform public.calc3d_archive_spool_profile(pg_catalog.current_setting('test.archive.profile')::uuid,4);
  raise exception 'disabled archive accepted'; exception when others then
    if sqlstate <> '28000' or sqlerrm <> 'Calc3D access denied' then raise; end if; end;
end $$;
