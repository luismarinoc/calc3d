import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { calculateQuote } from '../src/domain/costs.mjs';

const A = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
const B = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const profile = { name: 'Existente', material: 'PLA', brand: '', purchasePrice: 12000, netWeightGrams: 1000 };
const run = (program, args) => {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${program}: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
const portAvailable = () => new Promise((done, fail) => {
  const server = createServer(); server.once('error', fail);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => done(port)); });
});

test('legacy-only migration makes one catalog readable, admin-owned rows editable in place and private history intact', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-existing-catalog-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable();
    run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
    started = true;
    const psql = sql => spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-c', sql], { encoding: 'utf8' });
    const ok = sql => { const r = psql(sql); assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`); assert.equal(r.stderr, ''); return r.stdout.trim().split('\n').at(-1); };
    const denied = (sql, message) => { const r = psql(sql); assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`); assert.equal(r.stdout, 'SET\nSET\n'); assert.match(r.stderr, message); };
    const as = (id, sql) => `set role authenticated; set request.jwt.claim.sub = '${id}'; ${sql}`;
    ok(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values ('${A}','admin@example.com',now()),('${B}','member@example.com',now()),('${C}','inactive@example.com',now());`);
    for (const name of ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql',
      '202610220001_calc3d_spool_profiles.sql', '202610230001_calc3d_brands.sql',
      '202610230002_calc3d_profile_brand_colors.sql', '202610230003_calc3d_catalog_archive.sql',
      '202610260002_calc3d_quote_integrity.sql', '202610290001_calc3d_profile_source_urls.sql',
      '202610290002_calc3d_supplier_references.sql']) {
      run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/migrations', name)]);
    }
    ok(as(A, `select public.calc3d_invite_user('member@example.com')`));
    const id = ok(as(A, `select id from public.calc3d_save_spool_profile(${json(profile)})`));
    const memberId = ok(as(B, `select id from public.calc3d_save_spool_profile(${json({ ...profile, name: 'De miembro' })})`));
    const stored = () => ok(`select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p)) from public.calc3d_spool_profiles p),
      'quotes',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from public.calc3d_quotes q),
      'counters',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.calc3d_quote_counters c),
      'purchases',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.calc3d_purchases p))::text`);
    assert.equal(ok(as(B, `select count(*) from public.calc3d_spool_profiles where id='${id}'`)), '0');
    const before = stored();
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/migrations/202611040001_calc3d_existing_catalog_permissions.sql')]);
    assert.equal(stored(), before);
    assert.equal(ok(`select count(*) from information_schema.tables where table_schema='public' and table_name like 'calc3d_shared%'`), '0');
    assert.equal(ok(as(B, `select count(*) from public.calc3d_spool_profiles where id='${id}'`)), '1');
    assert.equal(ok(as(C, `select count(*) from public.calc3d_spool_profiles where id='${id}'`)), '0');
    const ownBrand = ok(as(A, `select id from public.calc3d_save_brand(${json({ name: 'Catalog', color: '#123456' })})`));
    assert.equal(ok(as(B, `select color from public.calc3d_brands where id='${ownBrand}'`)), '#123456');
    assert.equal(ok(as(C, `select count(*) from public.calc3d_brands where id='${ownBrand}'`)), '0');
    const unchanged = (sql, pattern) => { const snapshot = stored(); denied(sql, pattern); assert.equal(stored(), snapshot); };
    unchanged(as(B, `select public.calc3d_save_spool_profile(${json(profile)})`), /Calc3D admin required/);
    unchanged(as(B, `select public.calc3d_save_spool_profile(${json({ ...profile, name: 'Hack' })}, '${id}', 1)`), /Calc3D admin required/);
    unchanged(as(B, `select public.calc3d_archive_spool_profile('${id}', 1)`), /Calc3D admin required/);
    unchanged(as(B, `select public.calc3d_save_purchase('{}'::jsonb)`), /Calc3D admin required/);
    unchanged(as(B, `select public.calc3d_save_brand(${json({ name: 'Marca', color: '#123456' })})`), /Calc3D admin required/);
    unchanged(as(B, `select public.calc3d_archive_brand('${ownBrand}', 1)`), /Calc3D admin required/);
    unchanged(as(A, `select public.calc3d_save_spool_profile(${json({ ...profile, name: 'Stale' })}, '${id}', 2)`), /Spool profile revision conflict/);
    const changed = JSON.parse(ok(as(A, `select row_to_json(p)::text from public.calc3d_save_spool_profile(${json({ ...profile, name: 'Actualizada' })}, '${id}', 1) p`)));
    assert.equal(changed.owner_id, A); assert.equal(changed.id, id); assert.equal(changed.revision, 2);
    assert.equal(ok(as(B, `select name from public.calc3d_spool_profiles where id='${id}'`)), 'Actualizada');
    unchanged(as(B, `select public.calc3d_save_spool_profile(${json(profile)}, '${memberId}', 1)`), /Calc3D admin required/);
    const foreign = JSON.parse(ok(as(A, `select row_to_json(p)::text from public.calc3d_save_spool_profile(${json({ ...profile, name: 'Mantenida' })}, '${memberId}', 1) p`)));
    assert.equal(foreign.owner_id, B); assert.equal(foreign.id, memberId); assert.equal(foreign.revision, 2);
    const input = { purpose: 'sale', spool: { purchasePrice: 12000, netWeightGrams: 1000 }, grams: 20,
      hours: 1, minutes: 0, watts: 100, electricityPricePerKwh: 200, markupPercent: 100 };
    const quote = { title: 'Cotización', spoolId: `profile:${id}`,
      client: { name: '', phone: '', email: '' }, form: { purpose: 'sale' },
      input, result: calculateQuote(input) };
    unchanged(as(B, `select public.calc3d_save_quote(${json({ ...quote, input: {
      ...input, spool: { ...input.spool, purchasePrice: 1 } } })})`), /Catalog spool is not quotable/);
    const ownQuote = JSON.parse(ok(as(B, `select row_to_json(q)::text from public.calc3d_save_quote(${json(quote)}) q`)));
    assert.equal(ownQuote.spool_id, `profile:${id}`); assert.equal(ownQuote.owner_id, B);
    assert.equal(ownQuote.number, 'COT-000001');
    assert.equal(ok(as(A, 'select count(*) from public.calc3d_quotes')), '0');
    assert.equal(ok(as(B, 'select count(*) from public.calc3d_quotes')), '1');
    assert.equal(ok(as(B, 'select count(*) from public.calc3d_purchases')), '0');
    assert.equal(ok(as(A, `select count(*) from public.calc3d_spool_profiles where id='${memberId}'`)), '1');
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
