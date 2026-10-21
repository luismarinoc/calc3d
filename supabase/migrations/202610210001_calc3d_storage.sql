-- Calc3D-only foundation. Apply once as migration owner; no changes to other apps.
-- RPCs are SECURITY DEFINER solely because clients have SELECT, never table-write rights.
create table public.calc3d_quote_counters (
  owner_id uuid primary key references auth.users(id),
  next_number bigint not null default 1 check (next_number between 1 and 9007199254740992)
);
create table public.calc3d_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  saved_at timestamptz not null default now(),
  number text not null,
  client jsonb not null,
  title text not null,
  spool_id text not null,
  form jsonb not null,
  input jsonb not null,
  result jsonb not null,
  unique (owner_id, number)
);
create index calc3d_quotes_owner_saved on public.calc3d_quotes (owner_id, saved_at desc);
create table public.calc3d_printer_settings (
  owner_id uuid primary key references auth.users(id),
  revision bigint not null check (revision between 1 and 9007199254740991),
  state jsonb not null
);
create table public.calc3d_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  purchase_date date not null,
  supplier jsonb not null,
  notes text not null,
  lines jsonb not null,
  total bigint not null,
  spool_count integer not null check (spool_count between 1 and 1000)
);
create index calc3d_purchases_owner_created on public.calc3d_purchases (owner_id, created_at desc);
create table public.calc3d_spools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  purchase_id uuid not null references public.calc3d_purchases(id),
  purchase_date date not null,
  supplier jsonb not null,
  material text not null,
  brand text not null,
  color text not null,
  purchase_price bigint not null,
  net_weight_grams numeric not null,
  remaining_grams numeric not null
);
create index calc3d_spools_owner_purchase on public.calc3d_spools (owner_id, purchase_id);

alter table public.calc3d_quote_counters enable row level security;
alter table public.calc3d_quotes enable row level security;
alter table public.calc3d_printer_settings enable row level security;
alter table public.calc3d_purchases enable row level security;
alter table public.calc3d_spools enable row level security;
create policy calc3d_owner_read on public.calc3d_quote_counters for select to authenticated using (owner_id = (select auth.uid()));
create policy calc3d_owner_read on public.calc3d_quotes for select to authenticated using (owner_id = (select auth.uid()));
create policy calc3d_owner_read on public.calc3d_printer_settings for select to authenticated using (owner_id = (select auth.uid()));
create policy calc3d_owner_read on public.calc3d_purchases for select to authenticated using (owner_id = (select auth.uid()));
create policy calc3d_owner_read on public.calc3d_spools for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.calc3d_quote_counters, public.calc3d_quotes, public.calc3d_printer_settings,
  public.calc3d_purchases, public.calc3d_spools from public, anon, authenticated;
grant select on public.calc3d_quote_counters, public.calc3d_quotes, public.calc3d_printer_settings,
  public.calc3d_purchases, public.calc3d_spools to authenticated;

-- Private validation helpers; do not grant them as REST endpoints.
create function public.calc3d_safe_clp(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 9007199254740991
    and (value #>> '{}')::numeric = trunc((value #>> '{}')::numeric)
$$;
-- Decimal reference mode stores cent-rounded amounts; legacy remains whole CLP.
create function public.calc3d_safe_cents(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 90071992547409.91
    and (value #>> '{}')::numeric * 100 = trunc((value #>> '{}')::numeric * 100)
$$;
create function public.calc3d_valid_printer(printer jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; n numeric;
begin
  if jsonb_typeof(printer) <> 'object' or
     coalesce(printer->>'id' !~ '^(demo-printer-p2s|printer-[a-zA-Z0-9_-]+)$', true) or
     length(printer->>'id') > 120 then return false; end if;
  foreach k in array array['name', 'modelId'] loop
    if jsonb_typeof(printer->k) <> 'string' or length(btrim(printer->>k)) not between 1 and 120 or
       printer->>k <> btrim(printer->>k) or (printer->>k) ~ '[[:cntrl:]]' then return false; end if;
  end loop;
  foreach k in array array['watts', 'electricityPricePerKwh', 'replacementCost', 'replacementLifetimeHours'] loop
    if jsonb_typeof(printer->k) <> 'number' then return false; end if;
    n := (printer->>k)::numeric;
    if n < 0 or n > 9007199254740991 or (k = 'replacementLifetimeHours' and n = 0) or
       (k = 'replacementCost' and n <> trunc(n)) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.calc3d_safe_clp(jsonb), public.calc3d_safe_cents(jsonb),
  public.calc3d_valid_printer(jsonb) from public, anon, authenticated;

create function public.calc3d_save_quote(payload jsonb) returns public.calc3d_quotes
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.calc3d_quotes; k text; total numeric := 0; result jsonb; serial bigint;
declare reference_mode boolean; breakdown jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  result := payload->'result';
  if jsonb_typeof(payload) <> 'object' or jsonb_typeof(payload->'form') <> 'object' or
     jsonb_typeof(payload->'input') <> 'object' or jsonb_typeof(result) <> 'object' or
     coalesce(payload->'input'->>'purpose' not in ('sale', 'internal', 'gift'), true) or
     payload->'form'->>'purpose' is distinct from payload->'input'->>'purpose' or
     jsonb_typeof(payload->'title') <> 'string' or length(btrim(payload->>'title')) = 0 or
     jsonb_typeof(payload->'spoolId') <> 'string' or length(btrim(payload->>'spoolId')) = 0 or
     jsonb_typeof(payload->'client') <> 'object' then
    raise exception 'Invalid quote snapshot' using errcode = '23514';
  end if;
  foreach k in array array['name', 'phone', 'email'] loop
    if jsonb_typeof(payload->'client'->k) <> 'string' or payload->'client'->>k <> btrim(payload->'client'->>k) or
       length(payload->'client'->>k) > (case k when 'name' then 120 when 'phone' then 30 else 254 end) then
      raise exception 'Invalid quote client' using errcode = '23514';
    end if;
  end loop;
  if (payload->'client'->>'phone' <> '' and (length(payload->'client'->>'phone') < 3 or
      payload->'client'->>'phone' !~ '^[+()0-9[:space:].-]+$')) or
     (payload->'client'->>'email' <> '' and payload->'client'->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or
     jsonb_typeof(result->'breakdown') <> 'object' then
    raise exception 'Invalid quote client or breakdown' using errcode = '23514';
  end if;
  reference_mode := payload->'form'->>'calculationMode' = 'reference';
  if coalesce(payload->'form'->>'calculationMode' not in ('legacy', 'reference'), false) or
     (not reference_mode and (payload->'input' ? 'replacementCost' or
       payload->'input' ? 'replacementLifetimeHours' or payload->'input' ? 'errorPercent')) then
    raise exception 'Invalid quote calculation mode' using errcode = '23514'; end if;
  if reference_mode then
    foreach k in array array['replacementCost', 'replacementLifetimeHours', 'errorPercent'] loop
      if coalesce(jsonb_typeof(payload->'input'->k) <> 'number', true) or
         coalesce((payload->'input'->>k)::numeric not between 0 and 9007199254740991, true) then
        raise exception 'Invalid reference input' using errcode = '23514'; end if;
    end loop;
    if (payload->'input'->>'replacementLifetimeHours')::numeric = 0 or
       (payload->'input'->>'purpose' = 'sale' and
        (coalesce(jsonb_typeof(payload->'input'->'multiplier') <> 'number', true) or
         (payload->'input'->>'multiplier')::numeric <= 0 or
         (payload->'input'->>'multiplier')::numeric > 9007199254740991)) then
      raise exception 'Invalid reference input' using errcode = '23514'; end if;
  end if;
  breakdown := result->'breakdown';
  foreach k in array (case when reference_mode then
      array['material', 'electricity', 'wear', 'allowance', 'maintenance', 'labor', 'extras']
    else array['material', 'electricity', 'depreciation', 'maintenance', 'labor', 'extras'] end) loop
    if not coalesce(case when reference_mode then public.calc3d_safe_cents(breakdown->k)
                            else public.calc3d_safe_clp(breakdown->k) end, false) then
      raise exception 'Invalid quote breakdown' using errcode = '23514'; end if;
    total := total + (breakdown->>k)::numeric;
  end loop;
  if (reference_mode and breakdown ? 'depreciation') or
     (not reference_mode and (breakdown ? 'wear' or breakdown ? 'allowance')) then
    raise exception 'Invalid quote breakdown shape' using errcode = '23514'; end if;
  foreach k in array array['totalCost', 'internalCost', 'basePrice', 'discountAmount',
                          'surchargeAmount', 'finalPrice', 'commercialProfit'] loop
    if not coalesce(case when reference_mode then public.calc3d_safe_cents(result->k)
                            else public.calc3d_safe_clp(result->k) end, false) then
      raise exception 'Invalid quote financial result' using errcode = '23514'; end if;
  end loop;
  if (reference_mode and abs(total - (result->>'totalCost')::numeric) > 0.04) or
     (not reference_mode and total <> (result->>'totalCost')::numeric) or
     (result->>'finalPrice')::numeric <> (result->>'basePrice')::numeric -
       (result->>'discountAmount')::numeric + (result->>'surchargeAmount')::numeric or
     (result->>'commercialProfit')::numeric <> greatest(0, (result->>'finalPrice')::numeric - (result->>'totalCost')::numeric) or
     (payload->'input'->>'purpose' = 'gift' and
       (not coalesce(case when reference_mode then public.calc3d_safe_cents(result->'giftCost')
                              else public.calc3d_safe_clp(result->'giftCost') end, false) or
        (result->>'giftCost')::numeric <> (result->>'totalCost')::numeric)) or
     (payload->'input'->>'purpose' = 'sale' and
       ((result->>'internalCost')::numeric <> 0 or
        (result->>'finalPrice')::numeric < (result->>'totalCost')::numeric)) or
     (payload->'input'->>'purpose' <> 'sale' and
       ((result->>'basePrice')::numeric <> 0 or (result->>'finalPrice')::numeric <> 0 or
        (result->>'internalCost')::numeric <> case when payload->'input'->>'purpose' = 'gift' then 0
                                                else (result->>'totalCost')::numeric end or
        (result->>'commercialProfit')::numeric <> 0)) then
    raise exception 'Inconsistent quote financial result' using errcode = '23514';
  end if;
  insert into public.calc3d_quote_counters (owner_id, next_number) values (uid, 2)
    on conflict (owner_id) do update set next_number = public.calc3d_quote_counters.next_number + 1
    returning next_number - 1 into serial;
  insert into public.calc3d_quotes (owner_id, number, client, title, spool_id, form, input, result)
    values (uid, 'COT-' || lpad(serial::text, greatest(6, length(serial::text)), '0'), payload->'client', payload->>'title',
            payload->>'spoolId', payload->'form', payload->'input', result) returning * into r;
  return r;
end $$;

create function public.calc3d_save_printers(payload jsonb, expected_revision bigint)
returns public.calc3d_printer_settings
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); printer jsonb; ids text[] := '{}'; r public.calc3d_printer_settings;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if expected_revision is null or expected_revision < 0 or expected_revision >= 9007199254740991 or
     jsonb_typeof(payload) <> 'object' or jsonb_typeof(payload->'printers') <> 'array' or
     jsonb_array_length(payload->'printers') < 1 or jsonb_typeof(payload->'activeId') <> 'string' then
    raise exception 'Invalid printer state' using errcode = '23514';
  end if;
  for printer in select value from jsonb_array_elements(payload->'printers') loop
    if not public.calc3d_valid_printer(printer) or printer->>'id' = any(ids) then
      raise exception 'Invalid or duplicate printer' using errcode = '23514'; end if;
    ids := array_append(ids, printer->>'id');
  end loop;
  if not payload->>'activeId' = any(ids) then
    raise exception 'Unknown active printer' using errcode = '23514'; end if;
  if expected_revision = 0 then
    insert into public.calc3d_printer_settings (owner_id, revision, state)
      values (uid, 1, payload) on conflict (owner_id) do nothing returning * into r;
  else
    update public.calc3d_printer_settings set revision = revision + 1, state = payload
      where owner_id = uid and revision = expected_revision returning * into r;
  end if;
  if not found then raise exception 'Printer revision conflict' using errcode = '40001'; end if;
  return r;
end $$;

create function public.calc3d_save_purchase(payload jsonb) returns public.calc3d_purchases
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); day date; supplier jsonb; line jsonb; normalized jsonb := '[]'::jsonb;
declare qty integer; count_spools integer := 0; total numeric := 0; price numeric; weight numeric;
declare k text; r public.calc3d_purchases; i integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(payload) <> 'object' or payload->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
     jsonb_typeof(payload->'supplier') <> 'object' or jsonb_typeof(payload->'lines') <> 'array' or
     jsonb_array_length(payload->'lines') < 1 or
     jsonb_typeof(payload->'supplier'->'name') <> 'string' or
     length(btrim(payload->'supplier'->>'name')) = 0 or
     (payload ? 'notes' and jsonb_typeof(payload->'notes') <> 'string') then
    raise exception 'Invalid purchase' using errcode = '23514'; end if;
  begin day := (payload->>'date')::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception 'Invalid purchase date' using errcode = '23514'; end;
  if to_char(day, 'YYYY-MM-DD') <> payload->>'date' then
    raise exception 'Invalid purchase date' using errcode = '23514'; end if;
  foreach k in array array['address', 'phone'] loop
    if payload->'supplier' ? k and jsonb_typeof(payload->'supplier'->k) <> 'string' then
      raise exception 'Invalid supplier' using errcode = '23514'; end if;
  end loop;
  supplier := jsonb_build_object('name', payload->'supplier'->>'name',
    'address', coalesce(payload->'supplier'->>'address', ''),
    'phone', coalesce(payload->'supplier'->>'phone', ''));
  for line in select value from jsonb_array_elements(payload->'lines') loop
    if jsonb_typeof(line) <> 'object' then raise exception 'Invalid line' using errcode = '23514'; end if;
    foreach k in array array['material', 'brand', 'color'] loop
      if jsonb_typeof(line->k) <> 'string' or length(btrim(line->>k)) = 0 then
        raise exception 'Invalid line description' using errcode = '23514'; end if;
    end loop;
    if not coalesce(public.calc3d_safe_clp(line->'purchasePrice'), false) or
       jsonb_typeof(line->'quantity') <> 'number' or
       jsonb_typeof(line->'netWeightGrams') <> 'number' then
      raise exception 'Invalid line numbers' using errcode = '23514'; end if;
    price := (line->>'purchasePrice')::numeric;
    weight := (line->>'netWeightGrams')::numeric;
    if (line->>'quantity')::numeric not between 1 and 1000 or
       (line->>'quantity')::numeric <> trunc((line->>'quantity')::numeric) or weight <= 0 then
      raise exception 'Invalid quantity or weight' using errcode = '23514'; end if;
    qty := (line->>'quantity')::integer;
    count_spools := count_spools + qty;
    total := total + price * qty;
    if count_spools > 1000 or total > 9007199254740991 then
      raise exception 'Purchase outside safe limits' using errcode = '23514'; end if;
    normalized := normalized || jsonb_build_array(jsonb_build_object('material', line->>'material',
      'brand', line->>'brand', 'color', line->>'color', 'quantity', qty,
      'netWeightGrams', weight, 'purchasePrice', price));
  end loop;
  insert into public.calc3d_purchases (owner_id, purchase_date, supplier, notes, lines, total, spool_count)
    values (uid, day, supplier, coalesce(payload->>'notes', ''), normalized, total::bigint, count_spools)
    returning * into r;
  for line in select value from jsonb_array_elements(normalized) loop
    for i in 1..(line->>'quantity')::integer loop
      insert into public.calc3d_spools (owner_id, purchase_id, purchase_date, supplier, material,
        brand, color, purchase_price, net_weight_grams, remaining_grams)
      values (uid, r.id, day, supplier, line->>'material', line->>'brand', line->>'color',
        (line->>'purchasePrice')::bigint, (line->>'netWeightGrams')::numeric, (line->>'netWeightGrams')::numeric);
    end loop;
  end loop;
  return r;
end $$;
revoke all on function public.calc3d_save_quote(jsonb), public.calc3d_save_printers(jsonb, bigint),
  public.calc3d_save_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.calc3d_save_quote(jsonb), public.calc3d_save_printers(jsonb, bigint),
  public.calc3d_save_purchase(jsonb) to authenticated;
