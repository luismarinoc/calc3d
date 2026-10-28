-- New saves only. The public admission wrapper, historical rows, and owner counter are unchanged.
begin;
create or replace function public.calc3d_save_quote_core(payload jsonb) returns public.calc3d_quotes
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_quotes; k text; input jsonb := payload->'input';
declare mode text := coalesce(payload->'form'->>'calculationMode', 'legacy'); purpose text;
declare n numeric; vals jsonb := '{}'::jsonb; selected jsonb; quantity numeric;
declare duration numeric; material numeric; electricity numeric; wear numeric; allowance numeric := 0;
declare depreciation numeric; maintenance numeric; labor numeric; extras numeric; raw_total numeric;
declare total numeric; base numeric := 0; discount numeric := 0; surcharge numeric := 0; final numeric := 0;
declare breakdown jsonb; result jsonb; serial bigint; reference_mode boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(payload) <> 'object' or jsonb_typeof(payload->'form') <> 'object' or
     jsonb_typeof(input) <> 'object' or jsonb_typeof(payload->'result') <> 'object' or
     coalesce(input->>'purpose' not in ('sale', 'internal', 'gift'), true) or
     payload->'form'->>'purpose' is distinct from input->>'purpose' or
     jsonb_typeof(payload->'title') <> 'string' or length(btrim(payload->>'title')) = 0 or
     jsonb_typeof(payload->'spoolId') <> 'string' or length(btrim(payload->>'spoolId')) = 0 or
     jsonb_typeof(payload->'client') <> 'object' then
    raise exception 'Invalid quote snapshot' using errcode = '23514'; end if;
  foreach k in array array['name', 'phone', 'email'] loop
    if jsonb_typeof(payload->'client'->k) <> 'string' or payload->'client'->>k <> btrim(payload->'client'->>k) or
       length(payload->'client'->>k) > (case k when 'name' then 120 when 'phone' then 30 else 254 end) then
      raise exception 'Invalid quote client' using errcode = '23514'; end if;
  end loop;
  if (payload->'client'->>'phone' <> '' and (length(payload->'client'->>'phone') < 3 or
      payload->'client'->>'phone' !~ '^[+()0-9[:space:].-]+$')) or
     (payload->'client'->>'email' <> '' and payload->'client'->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or
     (jsonb_typeof(payload->'result'->'breakdown') <> 'object') then
    raise exception 'Invalid quote client or breakdown' using errcode = '23514'; end if;
  if mode not in ('legacy', 'reference') or
     (mode = 'legacy' and (input ? 'replacementCost' or input ? 'replacementLifetimeHours' or input ? 'errorPercent')) then
    raise exception 'Invalid quote calculation mode' using errcode = '23514'; end if;
  reference_mode := mode = 'reference'; purpose := input->>'purpose';
  -- Preserve the submitted result's structural/type contract while discarding its financial values.
  foreach k in array (case when reference_mode then
      array['material', 'electricity', 'wear', 'allowance', 'maintenance', 'labor', 'extras']
    else array['material', 'electricity', 'depreciation', 'maintenance', 'labor', 'extras'] end) loop
    if not coalesce(case when reference_mode then public.calc3d_safe_cents(payload->'result'->'breakdown'->k)
                            else public.calc3d_safe_clp(payload->'result'->'breakdown'->k) end, false) then
      raise exception 'Invalid quote breakdown' using errcode = '23514'; end if;
  end loop;
  if (reference_mode and payload->'result'->'breakdown' ? 'depreciation') or
     (not reference_mode and (payload->'result'->'breakdown' ? 'wear' or payload->'result'->'breakdown' ? 'allowance')) then
    raise exception 'Invalid quote breakdown shape' using errcode = '23514'; end if;
  foreach k in array array['totalCost', 'internalCost', 'basePrice', 'discountAmount',
                          'surchargeAmount', 'finalPrice', 'commercialProfit'] loop
    if not coalesce(case when reference_mode then public.calc3d_safe_cents(payload->'result'->k)
                            else public.calc3d_safe_clp(payload->'result'->k) end, false) then
      raise exception 'Invalid quote financial result' using errcode = '23514'; end if;
  end loop;
  if purpose = 'gift' and not coalesce(case when reference_mode then public.calc3d_safe_cents(payload->'result'->'giftCost')
                                     else public.calc3d_safe_clp(payload->'result'->'giftCost') end, false) then
    raise exception 'Inconsistent quote financial result' using errcode = '23514'; end if;
  if jsonb_typeof(input->'spool') <> 'object' then
    raise exception 'Invalid quote input' using errcode = '23514'; end if;
  -- Validate all arithmetic operands before casting; optional values have the same zero defaults as the calculators.
  foreach k in array array['purchasePrice', 'netWeightGrams', 'grams', 'hours', 'minutes', 'watts',
    'electricityPricePerKwh', 'depreciationPerHour', 'maintenancePerHour', 'laborMinutes',
    'laborRatePerHour', 'extraProductionCost', 'markupPercent', 'replacementCost',
    'replacementLifetimeHours', 'errorPercent', 'multiplier'] loop
    if (k in ('replacementCost', 'replacementLifetimeHours', 'errorPercent', 'multiplier') and not reference_mode) or
       (k in ('depreciationPerHour', 'markupPercent') and reference_mode) or
       (k = 'multiplier' and purpose <> 'sale') then continue; end if;
    selected := case when k in ('purchasePrice', 'netWeightGrams') then input->'spool'->k else input->k end;
    if selected is null and k in ('depreciationPerHour', 'maintenancePerHour', 'laborMinutes',
       'laborRatePerHour', 'extraProductionCost', 'markupPercent') then selected := '0'::jsonb; end if;
    if jsonb_typeof(selected) is distinct from 'number' then
      raise exception 'Invalid quote input' using errcode = '23514'; end if;
    n := (selected #>> '{}')::numeric;
    if n < 0 or n > 9007199254740991 or
       (k in ('netWeightGrams', 'replacementLifetimeHours', 'multiplier') and n = 0) or
       (k in ('hours', 'minutes') and n <> trunc(n)) or (k = 'minutes' and n > 59) then
      raise exception 'Invalid quote input' using errcode = '23514'; end if;
    vals := vals || pg_catalog.jsonb_build_object(k, n);
  end loop;
  duration := (vals->>'hours')::numeric + (vals->>'minutes')::numeric / 60;
  material := (vals->>'purchasePrice')::numeric / (vals->>'netWeightGrams')::numeric * (vals->>'grams')::numeric;
  electricity := (vals->>'watts')::numeric / 1000 * duration * (vals->>'electricityPricePerKwh')::numeric;
  maintenance := (vals->>'maintenancePerHour')::numeric * duration;
  labor := (vals->>'laborMinutes')::numeric / 60 * (vals->>'laborRatePerHour')::numeric;
  extras := (vals->>'extraProductionCost')::numeric;
  if reference_mode then
    wear := (vals->>'replacementCost')::numeric / (vals->>'replacementLifetimeHours')::numeric * duration;
    allowance := (material + electricity + wear) * (vals->>'errorPercent')::numeric / 100;
    raw_total := material + electricity + wear + allowance + maintenance + labor + extras;
    breakdown := pg_catalog.jsonb_build_object('material', round(material, 2), 'electricity', round(electricity, 2),
      'wear', round(wear, 2), 'allowance', round(allowance, 2), 'maintenance', round(maintenance, 2),
      'labor', round(labor, 2), 'extras', round(extras, 2));
    total := round(raw_total, 2);
  else
    depreciation := (vals->>'depreciationPerHour')::numeric * duration;
    breakdown := pg_catalog.jsonb_build_object('material', round(material), 'electricity', round(electricity),
      'depreciation', round(depreciation), 'maintenance', round(maintenance), 'labor', round(labor), 'extras', round(extras));
    total := round((breakdown->>'material')::numeric + (breakdown->>'electricity')::numeric +
      (breakdown->>'depreciation')::numeric + (breakdown->>'maintenance')::numeric +
      (breakdown->>'labor')::numeric + (breakdown->>'extras')::numeric);
  end if;
  if total < 0 or total > (case when reference_mode then 90071992547409.91 else 9007199254740991 end) or
     exists (select 1 from pg_catalog.jsonb_each(breakdown) b where (b.value #>> '{}')::numeric >
       (case when reference_mode then 90071992547409.91 else 9007199254740991 end)) then
    raise exception 'Inconsistent quote financial result' using errcode = '23514'; end if;
  if purpose = 'sale' then
    base := round((case when reference_mode then raw_total * (vals->>'multiplier')::numeric
      else total * (1 + (vals->>'markupPercent')::numeric / 100) end),
      case when reference_mode then 2 else 0 end);
  end if;
  foreach k in array array['discount', 'surcharge'] loop
    selected := input->k; if selected is null then continue; end if;
    if jsonb_typeof(selected) is distinct from 'object' or
       coalesce(selected->>'type' not in ('amount', 'percent'), true) or
       jsonb_typeof(selected->'value') is distinct from 'number' then
      raise exception 'Invalid quote adjustment' using errcode = '23514'; end if;
    quantity := (selected->>'value')::numeric;
    if quantity < 0 or quantity > 9007199254740991 or (purpose <> 'sale' and quantity <> 0) or
       (k = 'discount' and ((selected->>'type' = 'percent' and quantity > 100) or
        (selected->>'type' = 'amount' and (case when reference_mode then round(quantity, 2) > base else quantity > base end)))) then
      raise exception 'Invalid quote adjustment' using errcode = '23514'; end if;
    n := round((case when selected->>'type' = 'amount' then quantity else base * quantity / 100 end),
      case when reference_mode then 2 else 0 end);
    if k = 'discount' then discount := n; else surcharge := n; end if;
  end loop;
  if purpose = 'sale' then final := base - discount + surcharge; end if;
  if base > (case when reference_mode then 90071992547409.91 else 9007199254740991 end) or
     discount > (case when reference_mode then 90071992547409.91 else 9007199254740991 end) or
     surcharge > (case when reference_mode then 90071992547409.91 else 9007199254740991 end) or
     final < total and purpose = 'sale' or final > (case when reference_mode then 90071992547409.91 else 9007199254740991 end) then
    raise exception 'Inconsistent quote financial result' using errcode = '23514'; end if;
  result := pg_catalog.jsonb_build_object('breakdown', breakdown, 'totalCost', total,
    'internalCost', case when purpose = 'internal' then total else 0 end,
    'basePrice', base, 'discountAmount', discount, 'surchargeAmount', surcharge,
    'finalPrice', final, 'commercialProfit', case when purpose = 'sale' then round(final - total, case when reference_mode then 2 else 0 end) else 0 end);
  if purpose = 'gift' then result := result || pg_catalog.jsonb_build_object('giftCost', total); end if;
  insert into public.calc3d_quote_counters (owner_id, next_number) values (uid, 2)
    on conflict (owner_id) do update set next_number = public.calc3d_quote_counters.next_number + 1
    returning next_number - 1 into serial;
  insert into public.calc3d_quotes (owner_id, number, client, title, spool_id, form, input, result)
    values (uid, 'COT-' || lpad(serial::text, greatest(6, length(serial::text)), '0'), payload->'client', payload->>'title',
            payload->>'spoolId', payload->'form', input, result) returning * into r;
  return r;
end $$;
revoke all on function public.calc3d_save_quote_core(jsonb) from public, anon, authenticated;
commit;
