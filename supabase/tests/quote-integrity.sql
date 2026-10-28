\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$
declare base jsonb := '{"title":"Pieza","spoolId":"s1","client":{"name":"","phone":"","email":""},"form":{"purpose":"sale"},"input":{"purpose":"sale","spool":{"purchasePrice":100,"netWeightGrams":100},"grams":10,"hours":0,"minutes":0,"watts":0,"electricityPricePerKwh":0,"markupPercent":100},"result":{"breakdown":{"material":10,"electricity":0,"depreciation":0,"maintenance":0,"labor":0,"extras":0},"totalCost":10,"internalCost":0,"basePrice":20,"discountAmount":0,"surchargeAmount":0,"finalPrice":20,"commercialProfit":10}}';
declare before_rows jsonb; before_counter jsonb; state text; message text; candidate jsonb;
begin
  for candidate in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(base, '{input,spool,netWeightGrams}', '0'),
    jsonb_set(base, '{input,hours}', '0.5'),
    jsonb_set(base, '{input,minutes}', '60'),
    jsonb_set(base, '{input,discount}', '{"type":"percent","value":101}'),
    jsonb_set(base, '{input,markupPercent}', '-1'),
    jsonb_set(base, '{input,purpose}', '"gift"'),
    jsonb_set(base, '{input,grams}', '9007199254740992'),
    jsonb_set(base, '{input,discount}', '{"type":"amount","value":30}'))) loop
    select coalesce(jsonb_agg(to_jsonb(q) order by q.number), '[]'::jsonb) into before_rows from public.calc3d_quotes q;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.owner_id), '[]'::jsonb) into before_counter from public.calc3d_quote_counters c;
    begin
      perform public.calc3d_save_quote(candidate);
      raise exception 'invalid input accepted';
    exception when sqlstate '23514' then
      get stacked diagnostics state = returned_sqlstate, message = message_text;
      if state <> '23514' or message not in ('Invalid quote input', 'Invalid quote calculation mode', 'Invalid quote snapshot', 'Invalid quote adjustment', 'Inconsistent quote financial result') then
        raise exception 'unexpected error % %', state, message;
      end if;
    end;
    if (select coalesce(jsonb_agg(to_jsonb(q) order by q.number), '[]'::jsonb) from public.calc3d_quotes q) <> before_rows or
       (select coalesce(jsonb_agg(to_jsonb(c) order by c.owner_id), '[]'::jsonb) from public.calc3d_quote_counters c) <> before_counter then
      raise exception 'rejection mutated public rows or counters'; end if;
  end loop;
  -- Each malformed payload is exercised through the public admission RPC, not the private core.
  <<declare_block>>
  declare
    fault jsonb; expected_message text; failures text := ''; rejected boolean;
  begin
    for fault, expected_message in select value->'payload', value->>'message' from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('payload', jsonb_set(base, '{input,discount}', '{"value":0}'::jsonb), 'message', 'Invalid quote adjustment'),
      jsonb_build_object('payload', jsonb_set(base, '{input,surcharge}', '{"value":0}'::jsonb), 'message', 'Invalid quote adjustment'),
      jsonb_build_object('payload', jsonb_set(base, '{input,discount}', '{"type":null,"value":0}'::jsonb), 'message', 'Invalid quote adjustment'),
      jsonb_build_object('payload', jsonb_set(base, '{input,surcharge}', '{"type":"bad","value":0}'::jsonb), 'message', 'Invalid quote adjustment'),
      jsonb_build_object('payload', jsonb_set(base, '{result}', '{}'::jsonb), 'message', 'Invalid quote breakdown'),
      jsonb_build_object('payload', jsonb_set(base, '{result,breakdown}', '{}'::jsonb), 'message', 'Invalid quote breakdown'),
      jsonb_build_object('payload', jsonb_set(base, '{result,finalPrice}', '"bad"'::jsonb), 'message', 'Invalid quote financial result')
    )) loop
      select coalesce(jsonb_agg(to_jsonb(q) order by q.number), '[]'::jsonb) into before_rows from public.calc3d_quotes q;
      select coalesce(jsonb_agg(to_jsonb(c) order by c.owner_id), '[]'::jsonb) into before_counter from public.calc3d_quote_counters c;
      rejected := false;
      begin
        perform public.calc3d_save_quote(fault);
      exception when others then
        get stacked diagnostics state = returned_sqlstate, message = message_text;
        rejected := true;
        if state <> '23514' or message <> expected_message then
          failures := failures || format('unexpected %s %s (expected 23514 %s); ', state, message, expected_message);
        end if;
      end;
      if not rejected then failures := failures || format('accepted payload expecting %s; ', expected_message); end if;
      if (select coalesce(jsonb_agg(to_jsonb(q) order by q.number), '[]'::jsonb) from public.calc3d_quotes q) <> before_rows or
         (select coalesce(jsonb_agg(to_jsonb(c) order by c.owner_id), '[]'::jsonb) from public.calc3d_quote_counters c) <> before_counter then
        failures := failures || format('public rows/counter changed for %s; ', expected_message);
      end if;
    end loop;
    if failures <> '' then raise exception '%', failures; end if;
  end declare_block;
  -- Explicit zero adjustments are accepted and do not change a valid calculation.
  if (select result->>'finalPrice' from public.calc3d_save_quote(base)) <> '20' then
    raise exception 'existing valid quote changed'; end if;
end $$;
set role anon;
do $$ begin
  if has_function_privilege('anon', 'public.calc3d_save_quote(jsonb)', 'execute') or
     has_function_privilege('anon', 'public.calc3d_save_quote_core(jsonb)', 'execute') then
    raise exception 'anonymous quote access'; end if;
end $$;
