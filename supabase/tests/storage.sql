-- Run only against the isolated fixture created by tests/supabase-storage.test.mjs.
\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare q jsonb := '{"title":"Pieza","spoolId":"s1","client":{"name":"","phone":"","email":""},"form":{"purpose":"sale"},"input":{"purpose":"sale"},"result":{"breakdown":{"material":0,"electricity":0,"depreciation":0,"maintenance":0,"labor":0,"extras":0},"totalCost":0,"internalCost":0,"basePrice":0,"discountAmount":0,"surchargeAmount":0,"finalPrice":0,"commercialProfit":0}}';
declare n text;
begin
  select number into n from public.calc3d_save_quote(q);
  if n <> 'COT-000001' then raise exception 'first COT mismatch: %', n; end if;
  begin
    perform public.calc3d_save_quote(q || '{"result":{"totalCost":"not a number"}}'::jsonb);
    raise exception 'invalid quote accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.calc3d_save_quote(jsonb_set(q, '{result,finalPrice}', '1'));
    raise exception 'inconsistent financial snapshot accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.calc3d_save_quote(jsonb_set(q, '{input,purpose}', '"gift"'));
    raise exception 'mismatched purpose accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.calc3d_quotes) <> 1 or
     (select next_number from public.calc3d_quote_counters) <> 2 then
    raise exception 'rejected quote changed records/counter';
  end if;
  -- Gift uses the same internal expense as reference costs, with no sale price.
  perform public.calc3d_save_quote(jsonb_set(jsonb_set(jsonb_set(q,
    '{form,purpose}', '"gift"'), '{input,purpose}', '"gift"'),
    '{result,giftCost}', '0'));
  if (select count(*) from public.calc3d_quotes) <> 2 or
     (select next_number from public.calc3d_quote_counters) <> 3 then
    raise exception 'valid gift did not advance exactly once'; end if;
  begin
    update public.calc3d_quotes set result = '{}'::jsonb;
    raise exception 'direct quote mutation accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select count(*) from public.calc3d_quotes) <> 0 then raise exception 'RLS leaked quote'; end if;
  if (select count(*) from public.calc3d_quote_counters) <> 0 then raise exception 'RLS leaked counter'; end if;
  if (select count(*) from public.calc3d_printer_settings) <> 0 or
     (select count(*) from public.calc3d_purchases) <> 0 or
     (select count(*) from public.calc3d_spools) <> 0 then raise exception 'RLS leaked other data'; end if;
end $$;
set role anon;
do $$ begin
  if (select has_table_privilege('anon', 'public.calc3d_quotes', 'select')) or
     (select has_function_privilege('anon', 'public.calc3d_save_quote(jsonb)', 'execute')) then
    raise exception 'anonymous access granted';
  end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare state jsonb := '{"activeId":"printer-a","printers":[{"id":"printer-a","name":"Test","modelId":"p2s","watts":130,"electricityPricePerKwh":215,"replacementCost":220000,"replacementLifetimeHours":4320}]}';
declare changed jsonb;
begin
  perform public.calc3d_save_printers(state, 0);
  changed := jsonb_set(state, '{printers,0,name}', '"Updated"');
  if (select revision from public.calc3d_save_printers(changed, 1)) <> 2 then
    raise exception 'revision 1 did not advance to 2'; end if;
  if (select p.revision <> 2 or p.state <> changed from public.calc3d_printer_settings p) then
    raise exception 'printer update not persisted'; end if;
  begin
    perform public.calc3d_save_printers(state, 1);
    raise exception 'stale positive revision accepted';
  exception when serialization_failure then null;
  end;
  if (select p.revision <> 2 or p.state <> changed from public.calc3d_printer_settings p) then
    raise exception 'stale positive revision changed state'; end if;
  begin
    perform public.calc3d_save_printers(state, 0);
    raise exception 'stale revision accepted';
  exception when serialization_failure then null;
  end;
  if (select revision from public.calc3d_printer_settings) <> 2 then raise exception 'revision changed on conflict'; end if;
  begin
    perform public.calc3d_save_printers('{"activeId":"missing","printers":[]}'::jsonb, 1);
    raise exception 'invalid printer state accepted';
  exception when check_violation then null;
  end;
  if (select revision from public.calc3d_printer_settings) <> 2 then raise exception 'invalid state changed revision'; end if;
  begin
    update public.calc3d_printer_settings set revision = 2;
    raise exception 'direct settings mutation accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
declare purchase jsonb := '{"date":"2026-02-28","supplier":{"name":"Vendor","address":"","phone":""},"notes":"","lines":[{"material":"PLA","brand":"B","color":"blue","quantity":2,"netWeightGrams":1000.5,"purchasePrice":1234}]}';
begin
  perform public.calc3d_save_purchase(purchase);
  if (select count(*) from public.calc3d_purchases) <> 1 or (select count(*) from public.calc3d_spools) <> 2 then
    raise exception 'purchase/spool cardinality mismatch';
  end if;
  begin
    perform public.calc3d_save_purchase(jsonb_set(purchase, '{lines,0,quantity}', '1001'));
    raise exception 'too many spools accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.calc3d_save_purchase(jsonb_set(purchase, '{date}', '"2026-02-29"'));
    raise exception 'invalid leap date accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.calc3d_purchases) <> 1 or (select count(*) from public.calc3d_spools) <> 2 then
    raise exception 'failed purchase wrote records';
  end if;
  begin
    insert into public.calc3d_spools (owner_id) values ('11111111-1111-4111-8111-111111111111');
    raise exception 'direct spool write accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select count(*) from public.calc3d_quotes) <> 0 or
     (select count(*) from public.calc3d_printer_settings) <> 0 or
     (select count(*) from public.calc3d_purchases) <> 0 or
     (select count(*) from public.calc3d_spools) <> 0 then
    raise exception 'cross-owner read leaked data'; end if;
end $$;
