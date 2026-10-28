\set ON_ERROR_STOP on
-- Assertions only use the public authenticated interface, including public RLS reads.
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ declare r public.calc3d_members; begin
  if public.calc3d_access_status() <> '{"allowed":true,"role":"admin","email":"admin@example.com"}'::jsonb then
    raise exception 'original admin changed'; end if;
  if (select count(*) from public.calc3d_members) <> 2 then raise exception 'backfill lost member'; end if;
  r := public.calc3d_invite_user('pending@example.com');
  if not r.active or r.role <> 'member' then raise exception 'pending invitation changed'; end if;
  begin
    perform public.calc3d_set_user_active('admin@example.com',false);
    raise exception 'self deactivation accepted';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Cannot deactivate self or last admin' then raise; end if;
  end;
  if not (select active from public.calc3d_members where email='admin@example.com') then raise exception 'self deactivation wrote'; end if;
end $$;
-- A JWT email is not authority, and no pending claim happens through STABLE access/RLS.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set request.jwt.claim.email = 'pending@example.com';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'forged identity admitted'; end if;
  begin perform public.calc3d_claim_invitation(); raise exception 'forged identity claimed';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Confirmed Calc3D identity required' then raise; end if;
  end;
  if (select count(*) from public.calc3d_members) <> 0 or (select count(*) from public.calc3d_quotes) <> 0 or
     (select count(*) from public.calc3d_quote_counters) <> 0 then raise exception 'forged identity changed public rows'; end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'unconfirmed admitted'; end if;
  begin perform public.calc3d_claim_invitation(); raise exception 'unconfirmed claimed';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Confirmed Calc3D identity required' then raise; end if;
  end;
  if (select count(*) from public.calc3d_members) <> 0 then raise exception 'unconfirmed read'; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if public.calc3d_access_status() <> '{"allowed":true,"role":"member","email":"member@example.com"}'::jsonb then
    raise exception 'existing member changed'; end if;
  begin perform public.calc3d_invite_user('x@example.com'); raise exception 'member invited';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Calc3D admin required' then raise; end if;
  end;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com',false);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'revoked member admitted'; end if;
  begin perform public.calc3d_save_quote('{}'); raise exception 'revoked write accepted';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Calc3D access denied' then raise; end if;
  end;
  if (select count(*) from public.calc3d_quotes) <> 0 or (select count(*) from public.calc3d_quote_counters) <> 0 then
    raise exception 'revoked write changed rows'; end if;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('member@example.com',true);
-- Simulate external Auth deletion and a newly confirmed account reusing the address.
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
insert into auth.users values ('55555555-5555-4555-8555-555555555555','member@example.com',now());
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'recycled member admitted'; end if;
  begin perform public.calc3d_claim_invitation(); raise exception 'recycled member claimed';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Invitation is not pending' then raise; end if;
  end;
  if (select count(*) from public.calc3d_members) <> 0 or (select count(*) from public.calc3d_quotes) <> 0 or
      (select count(*) from public.calc3d_quote_counters) <> 0 then raise exception 'recycled member read rows'; end if;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  begin perform public.calc3d_invite_user('member@example.com'); raise exception 'recycled re-invite accepted';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Accepted Calc3D identity cannot be reassigned' then raise; end if;
  end;
  if (select count(*) from public.calc3d_members) <> 3 or
     (select active from public.calc3d_members where email='member@example.com') is distinct from true then
    raise exception 'reinvite changed rows'; end if;
end $$;
reset role;
insert into auth.users values ('66666666-6666-4666-8666-666666666666','pending@example.com',null);
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  begin perform public.calc3d_claim_invitation(); raise exception 'unconfirmed pending claimed';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Confirmed Calc3D identity required' then raise; end if;
  end;
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'unconfirmed pending admitted'; end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='66666666-6666-4666-8666-666666666666';
set role authenticated;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('pending@example.com',false);
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'revoked pending admitted'; end if;
  begin perform public.calc3d_claim_invitation(); raise exception 'revoked pending claimed';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Invitation is not pending' then raise; end if;
  end;
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'revoked pending status changed'; end if;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ begin
  if (select count(*) from public.calc3d_members where email='pending@example.com' and not active) <> 1 or
     (select count(*) from public.calc3d_quotes) <> 0 or (select count(*) from public.calc3d_quote_counters) <> 0 then
    raise exception 'revoked pending wrote business state'; end if;
end $$;
select public.calc3d_set_user_active('pending@example.com',true);
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'pending auto-claimed'; end if;
  if (select string_agg(key, ',' order by key) from
    jsonb_object_keys(to_jsonb(public.calc3d_claim_invitation())) key) <> 'active,created_at,email,role' then
    raise exception 'pending claim response changed'; end if;
  if public.calc3d_access_status() <> '{"allowed":true,"role":"member","email":"pending@example.com"}'::jsonb then
    raise exception 'claimed member status mismatch'; end if;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('pending@example.com',false);
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'claimed revoked member admitted'; end if;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
select public.calc3d_set_user_active('pending@example.com',true);
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean is distinct from true then raise exception 'reactivation lost binding'; end if;
end $$;
-- Even a reused administrator address cannot confer administrator rights.
reset role;
delete from auth.users where id='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
insert into auth.users values ('77777777-7777-4777-8777-777777777777','admin@example.com',now());
set role authenticated;
set request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
do $$ begin
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'recycled admin admitted'; end if;
  begin perform public.calc3d_invite_user('new@example.com'); raise exception 'recycled admin invited';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Calc3D admin required' then raise; end if;
  end;
  if (select count(*) from public.calc3d_members) <> 0 or (select count(*) from public.calc3d_quote_counters) <> 0 then
    raise exception 'recycled admin changed public data'; end if;
end $$;
