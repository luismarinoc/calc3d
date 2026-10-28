\set ON_ERROR_STOP on
-- Every mutation below uses public RPCs as authenticated; table checks are privilege probes.
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$ declare a jsonb; b jsonb; begin
  a := public.calc3d_request_access(); b := public.calc3d_request_access();
  if a <> b or a->>'state' <> 'pending' or (a->'request'->>'revision')::bigint <> 0 then
    raise exception 'request idempotence failed'; end if;
  if (public.calc3d_access_status()->>'allowed')::boolean then raise exception 'request admitted applicant'; end if;
  begin perform public.calc3d_list_access_requests(); raise exception 'nonadmin listed requests';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Calc3D admin required' then raise; end if;
  end;
  begin perform public.calc3d_review_access_request((a->'request'->>'id')::uuid,'approved',0);
    raise exception 'nonadmin reviewed request';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Calc3D admin required' then raise; end if;
  end;
  if (select count(*) from public.calc3d_members) <> 0 then raise exception 'private table leaked'; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if public.calc3d_request_access() <> '{"state":"authorized","request":null}'::jsonb then
    raise exception 'admitted member requested'; end if;
end $$;
set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
do $$ declare r public.calc3d_access_requests; begin
  if public.calc3d_request_access() <> '{"state":"authorized","request":null}'::jsonb then
    raise exception 'admin requested'; end if;
  if (select count(*) from public.calc3d_list_access_requests()) <> 1 then
    raise exception 'admin list missing request'; end if;
  begin perform public.calc3d_review_access_request(
    (select id from public.calc3d_list_access_requests()),'approved',5);
    raise exception 'stale revision accepted';
  exception when sqlstate '40001' then
    if sqlerrm <> 'Access request revision conflict' then raise; end if;
  end;
  begin perform public.calc3d_review_access_request(
    (select id from public.calc3d_list_access_requests()),'owner',0);
    raise exception 'invalid decision accepted';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Invalid access request decision' then raise; end if;
  end;
  if (select count(*) from public.calc3d_members) <> 2 or
    (select count(*) from public.calc3d_quotes) <> 0 or
    (select count(*) from public.calc3d_quote_counters) <> 0 then
    raise exception 'rejected operation changed membership/business'; end if;
  r := public.calc3d_review_access_request(
    (select id from public.calc3d_list_access_requests()),'rejected',0);
  if r.status <> 'rejected' or r.revision <> 1 or r.reviewed_at is null then
    raise exception 'rejection response mismatch'; end if;
  begin perform public.calc3d_review_access_request(r.id,'approved',1);
    raise exception 'rejected request reopened';
  exception when sqlstate '40001' then
    if sqlerrm <> 'Access request revision conflict' then raise; end if;
  end;
end $$;
set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$ begin
  if public.calc3d_request_access()->>'state' <> 'rejected' or
    (public.calc3d_access_status()->>'allowed')::boolean then
    raise exception 'rejected applicant admitted or reopened'; end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  begin perform public.calc3d_request_access(); raise exception 'unconfirmed requested';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Confirmed Calc3D identity required' then raise; end if;
  end;
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  begin perform public.calc3d_request_access(); raise exception 'forged requested';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Confirmed Calc3D identity required' then raise; end if;
  end;
end $$;
reset role;
-- Verify rejected request never touched private rows or business/counters.
do $$ begin
  if (select count(*) from public.calc3d_access_requests) <> 1 or
     (select count(*) from public.calc3d_access_requests where status='rejected' and revision=1) <> 1 or
     (select count(*) from public.calc3d_members) <> 2 or
     (select count(*) from public.calc3d_quotes) <> 0 or
     (select count(*) from public.calc3d_quote_counters) <> 0 or
     has_table_privilege('anon','public.calc3d_access_requests','SELECT') or
     has_table_privilege('authenticated','public.calc3d_access_requests','SELECT') or
     has_table_privilege('authenticated','public.calc3d_access_requests','INSERT') or
     has_function_privilege('anon','public.calc3d_request_access()','EXECUTE') then
       raise exception 'request privacy or rejection state mismatch'; end if;
end $$;
