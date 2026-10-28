-- Isolated fixture only; all actions below use public RPCs as authenticated/anon.
\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  if public.calc3d_access_status() <> '{"allowed": true, "role": "admin", "email": "admin@example.com"}'::jsonb then
    raise exception 'bootstrap status mismatch'; end if;
  if (select count(*) from public.calc3d_members) <> 1 then raise exception 'admin list mismatch'; end if;
  begin
    perform public.calc3d_invite_user('invalid'); raise exception 'invalid email accepted';
  exception when check_violation then null; end;
  if (select count(*) from public.calc3d_members) <> 1 then raise exception 'invalid invite changed members'; end if;
  if (select email from public.calc3d_invite_user('  MeMbEr@Example.Com  ')) <> 'member@example.com' then
    raise exception 'invite normalization failed'; end if;
  if (select count(*) from public.calc3d_members) <> 2 then raise exception 'invite count mismatch'; end if;
  begin
    perform public.calc3d_set_user_active('ADMIN@example.com', false);
    raise exception 'self deactivation accepted';
  exception when check_violation then null; end;
  if not (select active from public.calc3d_members where email = 'admin@example.com') then
    raise exception 'admin deactivated'; end if;
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set request.jwt.claim.email = 'admin@example.com';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'forged email admitted'; end if;
  if (select count(*) from public.calc3d_members) <> 0 or (select count(*) from public.calc3d_quotes) <> 0 then
    raise exception 'uninvited read'; end if;
  begin perform public.calc3d_save_quote('{}'); raise exception 'uninvited save accepted';
  exception when invalid_authorization_specification then null; end;
  begin perform public.calc3d_save_printers('{}', 0); raise exception 'uninvited printers accepted';
  exception when invalid_authorization_specification then null; end;
  begin perform public.calc3d_save_purchase('{}'); raise exception 'uninvited purchase accepted';
  exception when invalid_authorization_specification then null; end;
  begin perform public.calc3d_invite_user('other@example.com'); raise exception 'uninvited invite accepted';
  exception when invalid_authorization_specification then null; end;
end $$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'unconfirmed admitted'; end if;
  begin perform public.calc3d_save_purchase('{}'); raise exception 'unconfirmed save accepted';
  exception when invalid_authorization_specification then null; end;
end $$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set request.jwt.claim.email = 'admin@example.com';
do $$
declare q jsonb := '{"title":"Pieza","spoolId":"s1","client":{"name":"","phone":"","email":""},"form":{"purpose":"sale"},"input":{"purpose":"sale"},"result":{"breakdown":{"material":0,"electricity":0,"depreciation":0,"maintenance":0,"labor":0,"extras":0},"totalCost":0,"internalCost":0,"basePrice":0,"discountAmount":0,"surchargeAmount":0,"finalPrice":0,"commercialProfit":0}}';
declare printer jsonb := '{"activeId":"printer-a","printers":[{"id":"printer-a","name":"Test","modelId":"p2s","watts":130,"electricityPricePerKwh":215,"replacementCost":220000,"replacementLifetimeHours":4320}]}';
declare purchase jsonb := '{"date":"2026-02-28","supplier":{"name":"Vendor"},"lines":[{"material":"PLA","brand":"B","color":"blue","quantity":2,"netWeightGrams":1000.5,"purchasePrice":1234}]}';
begin
  if public.calc3d_access_status() <> '{"allowed": true, "role": "member", "email": "member@example.com"}'::jsonb then
    raise exception 'member status mismatch'; end if;
  if (select count(*) from public.calc3d_members) <> 0 then raise exception 'member saw membership'; end if;
  begin perform public.calc3d_invite_user('other@example.com'); raise exception 'member invited';
  exception when invalid_authorization_specification then null; end;
  begin perform public.calc3d_set_user_active('admin@example.com', false); raise exception 'member managed';
  exception when invalid_authorization_specification then null; end;
  if (select number from public.calc3d_save_quote(q)) <> 'COT-000001' then raise exception 'quote changed'; end if;
  if (select revision from public.calc3d_save_printers(printer, 0)) <> 1 then raise exception 'printer changed'; end if;
  if (select spool_count from public.calc3d_save_purchase(purchase)) <> 2 then raise exception 'purchase changed'; end if;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  if (select count(*) from public.calc3d_quotes) <> 0 or (select count(*) from public.calc3d_spools) <> 0 then
    raise exception 'admin read another owner'; end if;
  if (select active from public.calc3d_set_user_active(' MEMBER@EXAMPLE.COM ', false)) then
    raise exception 'deactivation failed'; end if;
end $$;
-- Same connection, role and JWT settings as the prior member writes: next statements must fail.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'revoked status'; end if;
  if (select count(*) from public.calc3d_quotes) <> 0 or
     (select count(*) from public.calc3d_quote_counters) <> 0 or
     (select count(*) from public.calc3d_printer_settings) <> 0 or
     (select count(*) from public.calc3d_purchases) <> 0 or
     (select count(*) from public.calc3d_spools) <> 0 then raise exception 'revoked read'; end if;
  begin perform public.calc3d_save_quote('{}'); raise exception 'revoked quote accepted';
  exception when invalid_authorization_specification then null; end;
  begin perform public.calc3d_save_printers('{}', 1); raise exception 'revoked printer accepted';
  exception when invalid_authorization_specification then null; end;
  begin perform public.calc3d_save_purchase('{}'); raise exception 'revoked purchase accepted';
  exception when invalid_authorization_specification then null; end;
  begin perform public.calc3d_save_quote_core('{}'); raise exception 'quote core accessible';
  exception when insufficient_privilege then null; end;
  begin perform public.calc3d_save_printers_core('{}', 0); raise exception 'printer core accessible';
  exception when insufficient_privilege then null; end;
  begin perform public.calc3d_save_purchase_core('{}'); raise exception 'purchase core accessible';
  exception when insufficient_privilege then null; end;
  begin insert into public.calc3d_quotes (owner_id, number, client, title, spool_id, form, input, result)
    values ('11111111-1111-4111-8111-111111111111', 'COT-FAKE', '{}', 'X', 's', '{}', '{}', '{}');
    raise exception 'direct write accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.calc3d_quotes where owner_id = '11111111-1111-4111-8111-111111111111') <> 1 or
     (select next_number from public.calc3d_quote_counters where owner_id = '11111111-1111-4111-8111-111111111111') <> 2 or
     (select revision from public.calc3d_printer_settings where owner_id = '11111111-1111-4111-8111-111111111111') <> 1 or
     (select count(*) from public.calc3d_purchases) <> 1 or (select count(*) from public.calc3d_spools) <> 2 then
    raise exception 'revoked writes changed saved data'; end if;
end $$;
set role anon;
do $$ begin
  begin perform public.calc3d_access_status(); raise exception 'anonymous status accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.calc3d_save_quote('{}'); raise exception 'anonymous save accepted';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  if not (select active from public.calc3d_set_user_active('member@example.com', true)) then
    raise exception 'reactivation failed'; end if;
  if (select role from public.calc3d_invite_user('ADMIN@example.com')) <> 'admin' then
    raise exception 'invite demoted admin'; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if (select count(*) from public.calc3d_quotes) <> 1 or (select count(*) from public.calc3d_spools) <> 2 or
     (select revision from public.calc3d_printer_settings) <> 1 then raise exception 'reactivation lost data'; end if;
end $$;
