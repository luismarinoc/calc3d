-- Restrict only the existing one-argument SQL RPC. Never create the helper or modify its overload.
begin;
do $$
begin
  if pg_catalog.to_regprocedure('public.execute_sql(text)') is not null then
    grant execute on function public.execute_sql(text) to service_role;
    revoke execute on function public.execute_sql(text) from public, anon, authenticated;
  end if;
end $$;
commit;
