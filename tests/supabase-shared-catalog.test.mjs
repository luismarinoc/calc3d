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

test('admitted shared read, private CAS overrides, hide, and guarded quote snapshots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-shared-'));
  const data = join(root, 'data'); let started = false;
  try {
    command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable();
    command('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
    started = true;
    const psql = (sql, flags = []) => spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...flags, '-c', sql], { encoding: 'utf8' });
    const ok = sql => { const r = psql(sql); assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`); assert.equal(r.stderr, ''); return r.stdout.trim().split('\n').at(-1); };
    const denied = (sql, message) => { const r = psql(sql); assert.notEqual(r.status, 0, sql); assert.match(r.stderr, message); };
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
    const save = (id, fields, revision) => as(id, `select row_to_json(r)::text from public.calc3d_save_shared_override('${uuid(confirmed)}', ${json(fields)}, ${revision}) r;`);
    const effective = id => as(id, `select profile::text from public.calc3d_effective_shared_products where id='${uuid(confirmed)}';`);
    assert.equal(ok(as(B, baseline)), '2');
    assert.equal(ok(as(A, baseline)), '2');
    assert.equal(ok(as(C, baseline)), '0');
    assert.equal(ok(as(A, `select count(*) from public.calc3d_shared_overrides`)), '0');
    denied(as(C, `select public.calc3d_save_shared_override('${uuid(confirmed)}', '{}'::jsonb, 0)`), /Calc3D access denied/);
    denied(as(A, `update public.calc3d_shared_products set sku='fake'`), /permission denied/);
    denied(as(A, `insert into public.calc3d_shared_overrides (owner_id,base_id,fields) values ('${A}','${uuid(confirmed)}','{}')`), /permission denied/);
    const personal = ok(as(A, `select id from public.calc3d_save_spool_profile(${json({ name: 'Personal', material: 'PLA', purchasePrice: 1, netWeightGrams: 1 })})`));
    assert.equal(ok(as(B, `select count(*) from public.calc3d_spool_profiles where id='${personal}'`)), '0');
    ok(save(A, { name: 'Mía', purchasePrice: confirmed.profile.purchasePrice }, 0));
    assert.equal(ok(as(B, `select count(*) from public.calc3d_shared_overrides`)), '0');
    assert.equal(JSON.parse(ok(effective(A))).name, 'Mía');
    assert.equal(JSON.parse(ok(effective(B))).name, confirmed.profile.name);
    const refreshed = { ...confirmed, profile: { ...confirmed.profile, material: 'New PLA' } };
    ok(compileSharedCatalogSql({ ...seed, records: [refreshed] }));
    assert.equal(JSON.parse(ok(effective(A))).material, 'New PLA');
    assert.equal(JSON.parse(ok(effective(B))).material, 'New PLA');
    assert.equal(JSON.parse(ok(effective(A))).name, 'Mía');
    const unchanged = ok(as(A, `select fields::text || ':' || revision from public.calc3d_shared_overrides`));
    for (const fields of [{ name: '' }, { purchasePrice: -1 }, { netWeightGrams: 0 }, { other: 1 }, { brandId: B }]) {
      denied(save(A, fields, 1), /Invalid shared override/);
      assert.equal(ok(as(A, `select fields::text || ':' || revision from public.calc3d_shared_overrides`)), unchanged);
    }
    denied(save(A, { name: 'Cambio' }, 0), /Shared override revision conflict/);
    denied(as(A, `select public.calc3d_save_shared_override('${uuid(pending)}', ${json({ name: 'No' })}, 0)`), /Invalid shared override/);
    assert.equal(ok(as(A, `select count(*) from public.calc3d_quote_counters`)), '0');
    const valid = quote(confirmed.id);
    assert.equal(ok(as(B, `select spool_id from public.calc3d_save_quote(${json(valid)})`)), confirmed.id);
    for (const bad of [quote(`base:${C}`), quote(pending.id), quote(confirmed.id, { ...source, spool: { ...source.spool, purchasePrice: 1 } })]) {
      denied(as(A, `select public.calc3d_save_quote(${json(bad)})`), /Shared spool is not quotable/);
      assert.equal(ok(as(A, `select count(*) from public.calc3d_quote_counters`)), '0');
      assert.equal(ok(as(A, `select count(*) from public.calc3d_quotes`)), '0');
    }
    assert.equal(ok(as(A, `select spool_id from public.calc3d_save_quote(${json(quote('profile:legacy'))})`)), 'profile:legacy');
    ok(as(A, `select public.calc3d_hide_shared_product('${uuid(confirmed)}', 1)`));
    assert.equal(ok(as(B, `select count(*) from public.calc3d_effective_shared_products where id='${uuid(confirmed)}'`)), '1');
    assert.equal(ok(as(A, `select count(*) from public.calc3d_effective_shared_products where id='${uuid(confirmed)}'`)), '0');
    denied(as(A, `select public.calc3d_save_quote(${json(valid)})`), /Shared spool is not quotable/);
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
