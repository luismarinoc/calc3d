-- Local-only representative ACL fixture; neither function executes the supplied SQL.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.rpc_fixture_state (id integer primary key, value text not null, counter integer not null);
insert into public.rpc_fixture_state values (1, 'unchanged', 7);
create function public.execute_sql(text) returns jsonb
language sql security definer set search_path = ''
as $$ select pg_catalog.jsonb_build_object('route', 'one', 'input', $1) $$;
grant execute on function public.execute_sql(text) to anon, authenticated, service_role;
create function public.execute_sql(text, boolean) returns jsonb
language sql security invoker set search_path = ''
as $$ select pg_catalog.jsonb_build_object('route', 'two', 'input', $1, 'flag', $2) $$;
revoke all on function public.execute_sql(text, boolean) from public, anon, authenticated;
grant execute on function public.execute_sql(text, boolean) to service_role;
create function public.rpc_fixture_untouched() returns text language sql as $$ select 'intact'::text $$;
revoke all on function public.rpc_fixture_untouched() from public, anon, authenticated;
grant execute on function public.rpc_fixture_untouched() to service_role;
