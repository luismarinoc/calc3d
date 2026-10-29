-- Optional supplier evidence, separate from editable profile fields and prices.
-- Apply as migration owner after profile brand/color and archive migrations.
begin;
alter table public.calc3d_spool_profiles add column source_url text
  constraint calc3d_profile_source_url_official_product check (
    source_url is null or
    (length(source_url) <= 2048 and source_url = btrim(source_url) and
     source_url !~ '[[:cntrl:]]' and source_url ~ '^https://www[.]todotoner[.]cl/impresoras/impresoras-3d/filamentos/[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*/?$')
  );
commit;
