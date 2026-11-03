-- Run against the disposable local PostgreSQL database after loading the reviewed seed.
-- Public API policy checks are exercised as authenticated/anon roles in the Node harness.
do $$ begin
  if not exists (select 1 from public.calc3d_shared_products where status = 'confirmed') or
     not exists (select 1 from public.calc3d_shared_products where status = 'pending') then
    raise exception 'Shared fixture must include confirmed and pending';
  end if;
  if exists (select 1 from public.calc3d_shared_products where status = 'pending' and profile is not null) then
    raise exception 'Pending reference became quotable';
  end if;
end $$;
