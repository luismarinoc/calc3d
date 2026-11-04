import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { calculateQuote } from '../src/domain/costs.mjs';
import { compileSharedCatalogSql } from '../ops/shared-catalog-sql.mjs';

const A = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
const B = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const seed = JSON.parse(readFileSync(resolve('data/shared-supplier-catalog.json'), 'utf8'));
const confirmed = seed.records.find(row => row.status === 'confirmed');
const pending = seed.records.find(row => row.status === 'pending');
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const uuid = row => row.id.slice(5);
function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${program}: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const portAvailable = () => new Promise((done, fail) => {
  const server = createServer(); server.once('error', fail);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => done(port)); });
});
const source = { purpose: 'sale', spool: { purchasePrice: confirmed.profile.purchasePrice, netWeightGrams: confirmed.profile.netWeightGrams }, grams: 294,
  hours: 11, minutes: 0, watts: 130, electricityPricePerKwh: 230, depreciationPerHour: 3,
  maintenancePerHour: 2, laborMinutes: 24, laborRatePerHour: 200, extraProductionCost: 0.5,
  markupPercent: 35, discount: { type: 'percent', value: 5 }, surcharge: { type: 'amount', value: 100 } };
function quote(spoolId, input = source) {
  return { title: 'Pieza', spoolId, client: { name: '', phone: '', email: '' }, form: { purpose: 'sale' },
    input, result: calculateQuote(input) };
}

test('admitted common read, admin CAS, member mutation denial and private quote snapshots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-shared-'));
  const data = join(root, 'data'); let started = false;
  try {
    command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable();
    command('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
    started = true;
    const psql = (sql, flags = []) => spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...flags, '-c', sql], { encoding: 'utf8' });
    const ok = sql => { const r = psql(sql); assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`); assert.equal(r.stderr, ''); return r.stdout.trim().split('\n').at(-1); };
    const denied = (sql, message) => { const r = psql(sql); assert.equal(r.status, 1, `${sql}: ${r.stdout}\n${r.stderr}`);
      assert.equal(r.stdout, 'SET\nSET\n'); assert.match(r.stderr, /^ERROR: /); assert.match(r.stderr, message); };
    const as = (id, sql, role = 'authenticated') => `set role ${role}; set request.jwt.claim.sub = '${id}'; ${sql}`;
    ok(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values ('${A}','admin@example.com',now()),('${B}','member@example.com',now()),('${C}','inactive@example.com',now());`);
    for (const name of ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql',
      '202610220001_calc3d_spool_profiles.sql', '202610230001_calc3d_brands.sql',
      '202610230002_calc3d_profile_brand_colors.sql', '202610230003_calc3d_catalog_archive.sql',
      '202610260002_calc3d_quote_integrity.sql', '202610290001_calc3d_profile_source_urls.sql',
      '202610290002_calc3d_supplier_references.sql', '202611030001_calc3d_shared_catalog.sql']) {
      command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/migrations', name)]);
    }
    ok(as(A, `select public.calc3d_invite_user('member@example.com');`));
    const baseline = `select count(*) from public.calc3d_shared_products`;
    assert.equal(ok(as(A, baseline)), '0');
    const loaded = { ...seed, records: [confirmed, pending] };
    ok(compileSharedCatalogSql(loaded));
    assert.equal(ok(as(A, baseline)), '2');
    const beforeReload = ok(`select revision from public.calc3d_shared_products where id='${uuid(confirmed)}'`);
    ok(compileSharedCatalogSql(loaded));
    assert.equal(ok(`select revision from public.calc3d_shared_products where id='${uuid(confirmed)}'`), beforeReload);
    command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/tests/shared-catalog.sql')]);
    command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/migrations/202611030002_calc3d_admin_common_catalog.sql')]);
    const save = (id, fields, revision) => as(id, `select row_to_json(r)::text from public.calc3d_update_common_product('${uuid(confirmed)}', ${json(fields)}, ${revision}) r;`);
    const effective = id => as(id, `select profile::text from public.calc3d_effective_shared_products where id='${uuid(confirmed)}';`);
    const state = () => ok(`select jsonb_build_object('products',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.calc3d_shared_products p),'masks',(select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) from public.calc3d_shared_overrides o),'profiles',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.calc3d_spool_profiles p),'purchases',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.calc3d_purchases p),'spools',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.calc3d_spools s),'quotes',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from public.calc3d_quotes q),'counters',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.calc3d_quote_counters c))::text`);
    const unchanged = (sql, pattern) => { const before = state(); denied(sql, pattern); assert.equal(state(), before); };
    assert.equal(ok(as(B, baseline)), '2');
    assert.equal(ok(as(A, baseline)), '2');
    assert.equal(ok(as(C, baseline)), '0');
    assert.equal(ok(as(A, `select count(*) from public.calc3d_shared_overrides`)), '0');
    unchanged(as(C, `select public.calc3d_update_common_product('${uuid(confirmed)}', '{}'::jsonb, 1)`), /Calc3D admin required/);
    unchanged(`set role anon; set request.jwt.claim.sub = ''; select public.calc3d_create_common_product(${json(confirmed.profile)})`, /permission denied/);
    unchanged(as(B, `select public.calc3d_require_catalog_admin()`), /permission denied/);
    unchanged(as(B, `select public.calc3d_save_shared_override('${uuid(confirmed)}', ${json({ name: 'Mine' })}, 0)`), /permission denied/);
    unchanged(as(B, `select public.calc3d_hide_shared_product('${uuid(confirmed)}', 0)`), /permission denied/);
    unchanged(as(B, `select public.calc3d_create_common_product(${json(confirmed.profile)})`), /Calc3D admin required/);
    unchanged(as(B, `select public.calc3d_save_spool_profile(${json(confirmed.profile)})`), /Calc3D admin required/);
    unchanged(as(B, `select public.calc3d_save_purchase('{}'::jsonb)`), /Calc3D admin required/);
    denied(as(A, `update public.calc3d_shared_products set sku='fake'`), /permission denied/);
    denied(as(A, `insert into public.calc3d_shared_overrides (owner_id,base_id,fields) values ('${A}','${uuid(confirmed)}','{}')`), /permission denied/);
    const personal = ok(as(A, `select id from public.calc3d_save_spool_profile(${json({ name: 'Personal', material: 'PLA', purchasePrice: 1, netWeightGrams: 1 })})`));
    assert.equal(ok(as(B, `select count(*) from public.calc3d_spool_profiles where id='${personal}'`)), '0');
    unchanged(as(B, `select public.calc3d_archive_spool_profile('${personal}', 1)`), /Calc3D admin required/);
    assert.equal(ok(as(A, `select revision from public.calc3d_spool_profiles where id='${personal}'`)), '1');
    ok(as(A, `select public.calc3d_archive_spool_profile('${personal}', 1)`));
    assert.equal(ok(as(A, `select revision from public.calc3d_spool_profiles where id='${personal}'`)), '2');
    const purchaseInput = { date: '2026-01-02', supplier: { name: 'Fixture' }, lines: [
      { material: 'PLA', brand: 'Fixture', color: 'Blue', purchasePrice: 100, netWeightGrams: 1000, quantity: 1 }] };
    ok(as(A, `select public.calc3d_save_purchase(${json(purchaseInput)})`));
    assert.equal(ok(as(A, `select count(*) from public.calc3d_spools`)), '1');
    assert.equal(ok(as(B, `select count(*) from public.calc3d_spools`)), '0');
    unchanged(as(B, `select public.calc3d_save_purchase(${json(purchaseInput)})`), /Calc3D admin required/);
    ok(save(A, { name: 'Común', purchasePrice: confirmed.profile.purchasePrice }, 1));
    assert.equal(ok(as(B, `select count(*) from public.calc3d_shared_overrides`)), '0');
    assert.equal(JSON.parse(ok(effective(A))).name, 'Común');
    assert.equal(JSON.parse(ok(effective(B))).name, 'Común');
    const refreshed = { ...confirmed, profile: { ...confirmed.profile, material: 'New PLA' } };
    ok(compileSharedCatalogSql({ ...seed, records: [refreshed] }));
    assert.equal(JSON.parse(ok(effective(A))).material, 'New PLA');
    assert.equal(JSON.parse(ok(effective(B))).material, 'New PLA');
    assert.equal(JSON.parse(ok(effective(A))).name, confirmed.profile.name);
    const current = Number(ok(`select revision from public.calc3d_shared_products where id='${uuid(confirmed)}'`));
    for (const fields of [{ name: '' }, { purchasePrice: -1 }, { netWeightGrams: 0 }, { other: 1 }, { brandId: B }]) {
      unchanged(save(A, fields, current), /Invalid common product/);
    }
    unchanged(save(A, { name: 'Cambio' }, current - 1), /Common product revision conflict/);
    unchanged(save(A, {}, current), /Invalid common product/);
    for (const bad of [{ ...confirmed.profile, purchasePrice: -1 }, { ...confirmed.profile, netWeightGrams: 0 },
      { ...confirmed.profile, sourceUrl: confirmed.sourceUrl }, { ...confirmed.profile, name: '' }]) {
      unchanged(as(A, `select public.calc3d_create_common_product(${json(bad)})`), /Invalid common product/);
    }
    unchanged(as(B, `select public.calc3d_update_common_product('${uuid(confirmed)}', ${json({ name: 'Hacked' })}, ${current})`), /Calc3D admin required/);
    unchanged(as(A, `select public.calc3d_update_common_product('${uuid(pending)}', ${json({ name: 'No' })}, 1)`), /Common product revision conflict/);
    const manual = JSON.parse(ok(as(A, `select row_to_json(r)::text from public.calc3d_create_common_product(${json({ name: 'Manual', material: 'PLA', brand: '', purchasePrice: 500, netWeightGrams: 1000 })}) r`)));
    assert.equal(manual.origin, 'manual');
    for (const field of ['sku', 'source_url', 'source_sha256', 'normalized_sha256']) assert.equal(manual[field], null);
    assert.equal(JSON.parse(ok(as(B, `select profile::text from public.calc3d_shared_products where id='${manual.id}'`))).name, 'Manual');
    assert.equal(ok(as(B, `select origin || ':' || revision from public.calc3d_shared_products where id='${manual.id}'`)), 'manual:1');
    unchanged(as(B, `select public.calc3d_update_common_product('${manual.id}', ${json({ name: 'Intruso' })}, 1)`), /Calc3D admin required/);
    ok(as(A, `select public.calc3d_update_common_product('${manual.id}', ${json({ name: 'Manual común', purchasePrice: 600 })}, 1)`));
    assert.equal(JSON.parse(ok(as(B, `select profile::text from public.calc3d_shared_products where id='${manual.id}'`))).name, 'Manual común');
    assert.equal(ok(as(B, `select origin || ':' || revision from public.calc3d_shared_products where id='${manual.id}'`)), 'manual:2');
    unchanged(as(A, `select public.calc3d_update_common_product('${manual.id}', ${json({ purchasePrice: 900 })}, 1)`), /Common product revision conflict/);
    assert.equal(ok(as(A, `select count(*) from public.calc3d_quote_counters`)), '0');
    const valid = quote(confirmed.id);
    const memberQuote = JSON.parse(ok(as(B, `select row_to_json(q)::text from public.calc3d_save_quote(${json(valid)}) q`)));
    assert.equal(memberQuote.spool_id, confirmed.id);
    assert.equal(memberQuote.number, 'COT-000001');
    assert.equal(ok(as(B, `select count(*) from public.calc3d_quotes`)), '1');
    assert.equal(ok(as(A, `select count(*) from public.calc3d_quotes`)), '0');
    unchanged(as(B, `select public.calc3d_save_quote(${json(quote(`base:${manual.id}`))})`), /Shared spool is not quotable/);
    const manualQuote = quote(`base:${manual.id}`, { ...source, spool: { purchasePrice: 600, netWeightGrams: 1000 } });
    assert.equal(ok(as(B, `select number from public.calc3d_save_quote(${json(manualQuote)})`)), 'COT-000002');
    assert.equal(ok(as(B, `select input->'spool'->>'purchasePrice' from public.calc3d_quotes where id='${memberQuote.id}'`)), String(confirmed.profile.purchasePrice));
    ok(save(A, { purchasePrice: confirmed.profile.purchasePrice + 100 }, current));
    unchanged(as(B, `select public.calc3d_save_quote(${json(valid)})`), /Shared spool is not quotable/);
    const updatedQuote = quote(confirmed.id, { ...source, spool: { ...source.spool, purchasePrice: confirmed.profile.purchasePrice + 100 } });
    assert.equal(ok(as(B, `select number from public.calc3d_save_quote(${json(updatedQuote)})`)), 'COT-000003');
    assert.equal(ok(as(B, `select input->'spool'->>'purchasePrice' from public.calc3d_quotes where id='${memberQuote.id}'`)), String(confirmed.profile.purchasePrice));
    for (const bad of [quote(`base:${C}`), quote(pending.id), quote(confirmed.id, { ...source, spool: { ...source.spool, purchasePrice: 1 } })]) {
      unchanged(as(A, `select public.calc3d_save_quote(${json(bad)})`), /Shared spool is not quotable/);
      assert.equal(ok(as(A, `select count(*) from public.calc3d_quote_counters`)), '0');
      assert.equal(ok(as(A, `select count(*) from public.calc3d_quotes`)), '0');
    }
    assert.equal(ok(as(A, `select spool_id from public.calc3d_save_quote(${json(quote('profile:legacy'))})`)), 'profile:legacy');
    assert.equal(ok(as(B, `select count(*) from public.calc3d_effective_shared_products where id='${uuid(confirmed)}'`)), '1');
    assert.equal(ok(as(A, `select count(*) from public.calc3d_effective_shared_products where id='${uuid(confirmed)}'`)), '1');
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
