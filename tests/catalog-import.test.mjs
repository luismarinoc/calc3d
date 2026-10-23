import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildCatalogImportSQL, normalizeCatalogBatch } from '../ops/catalog-import.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const item = { sku: 'TEST-ABS', originalName: 'ABS blanco | Filamentos', profile: { name: 'ABS blanco', material: 'ABS', brand: 'ACME', purchasePrice: 12345, netWeightGrams: 1000 } };
function run(program, args, success = true) {
  const r = spawnSync(program, args, { encoding: 'utf8' });
  if (success) assert.equal(r.status, 0, `${program}: ${r.stdout}\n${r.stderr}\n${r.error ?? ''}`);
  return r;
}
function port() { return new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); }); }
function sampleSnapshot() { return JSON.stringify({ coverage: { complete: false }, items: [{ ...item, profile: { ...item.profile, name: item.originalName }, sourceUrl: 'https://www.todotoner.cl/item', diameterMm: 1.75, availability: 'InStock', compatibilityNotes: ['TPU: alimentación externa'], evidence: Object.fromEntries(['name','sku','brand','material','diameter','weight','availability','price'].map(k => [k, { path: k, value: ({ name: item.originalName, sku: item.sku, brand: item.profile.brand, price: item.profile.purchasePrice, weight: '1 kg', diameter: '1.75 mm' })[k] ?? k }])) }] }); }

test('partial snapshots require evidence, preserve name and reject held or bad fields', () => {
  const batch = normalizeCatalogBatch(JSON.parse(sampleSnapshot()));
  assert.equal(batch.items.length, 1);
  assert.equal(batch.items[0].originalName, item.originalName);
  assert.equal(batch.items[0].profile.name, item.profile.name);
  assert.deepEqual(batch.items[0].compatibilityNotes, ['TPU: alimentación externa']);
  const seed = JSON.parse(readFileSync(resolve('.cache/odd/todotoner-p2s-catalog/pipeline-seed.json'), 'utf8'));
  const actual = normalizeCatalogBatch(seed);
  assert.equal(seed.coverage.complete, false);
  assert.equal(seed.items.length, 27);
  assert.equal(actual.items.length, 25);
  assert.deepEqual(actual.heldSkus, ['197PLAESUN', '12PLAELEGOO']);
  assert.equal(new Set(actual.items.map(x => x.sku)).size, 25);
  assert.equal(new Set(actual.items.map(x => x.profile.name)).size, 25);
  assert.equal(actual.items.find(x => x.sku === 'TPUNECR').compatibilityNotes[0].includes('alimentación externa'), true);
  assert.equal(normalizeCatalogBatch({ items: [{ ...JSON.parse(sampleSnapshot()).items[0], sku: '197PLAESUN' }] }).items.length, 0);
  assert.throws(() => normalizeCatalogBatch({ items: [{ ...JSON.parse(sampleSnapshot()).items[0], diameterMm: 2.85 }] }));
  assert.throws(() => normalizeCatalogBatch({ items: [{ ...JSON.parse(sampleSnapshot()).items[0], evidence: {} }] }));
  for (const changed of [{ sku: item.sku, profile: { ...item.profile, netWeightGrams: 0 } }, { ...item, profile: { ...item.profile, name: 'x'.repeat(121) } }]) {
    assert.throws(() => buildCatalogImportSQL([changed], { ownerId: owner }));
  }
});

test('isolated admin SQL is atomic, idempotent and does not alter existing business state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-import-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const p = await port();
    const log = join(root, 'server.log');
    const start = run('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${p}`, '-w', 'start'], false);
    assert.equal(start.status, 0, `${start.stderr}\n${readFileSync(log, 'utf8')}`); started = true;
    const sql = (text, success = true) => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(p), '-U', 'postgres', '-d', 'postgres', '-c', text], success);
    sql(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; insert into auth.users values ('ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6','admin@example.com',now()), ('${owner}','member@example.com',now()), ('${other}','other@example.com',now());`);
    for (const f of ['202610210001_calc3d_storage.sql','202610210002_calc3d_invitations.sql','202610220001_calc3d_spool_profiles.sql']) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(p), '-U','postgres','-d','postgres','-f',resolve('supabase/migrations', f)]);
    sql(`insert into public.calc3d_members(email,role) values ('member@example.com','member'),('other@example.com','member'); insert into public.calc3d_spool_profiles(owner_id,name,material,brand,purchase_price,net_weight_grams,revision) values ('${owner}','ABS blanco | Filamentos','ABS','ACME',5,1000,3),('${other}','Private','PLA','',99,500,2);`);
    const state = () => sql(`select (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.calc3d_spool_profiles p)::text || ':' || (select count(*) from public.calc3d_quote_counters) || ':' || (select count(*) from public.calc3d_purchases) || ':' || (select count(*) from public.calc3d_spools)`).stdout.trim();
    const before = state();
    const apply = buildCatalogImportSQL([item], { ownerId: owner });
    assert.equal(sql(apply).status, 0);
    assert.equal(state(), before, 'manual match skipped without rewriting');
    const second = { ...item, sku: 'TEST-OTHER', originalName: 'PETG azul', profile: { ...item.profile, name: 'PETG azul', material: 'PETG' } };
    const insert = buildCatalogImportSQL([second], { ownerId: owner });
    sql(insert); const once = state(); assert.notEqual(once, before);
    sql(insert); assert.equal(state(), once);
    assert.match(sql(`set role authenticated; set request.jwt.claim.sub='${owner}'; select count(*) from public.calc3d_spool_profiles;`).stdout, /2/);
    assert.match(sql(`set role authenticated; set request.jwt.claim.sub='${other}'; select count(*) from public.calc3d_spool_profiles;`).stdout, /1/);
    assert.throws(() => buildCatalogImportSQL([{ ...second, sku: 'X', profile: { ...second.profile, netWeightGrams: 0 } }], { ownerId: owner }));
    assert.equal(state(), once);
    const hostile = { ...second, sku: 'X', originalName: 'evil $catalog_payload_0$ $catalog_do_0$ ; raise exception', profile: { ...second.profile, name: 'evil $catalog_payload_0$ $catalog_do_0$ ; raise exception' } };
    sql(buildCatalogImportSQL([hostile], { ownerId: owner }));
    const afterHostile = state();
    assert.match(afterHostile, /evil \$catalog_payload_0\$/);
    assert.deepEqual(JSON.parse(afterHostile.slice(0, afterHostile.lastIndexOf(']:0:0:0') + 1)).filter(x => x.name !== hostile.profile.name), JSON.parse(once.slice(0, once.lastIndexOf(']:0:0:0') + 1)));
    assert.match(afterHostile, /:0:0:0$/);
    assert.throws(() => buildCatalogImportSQL([second], { ownerId: 'bad' }));
    sql(`update auth.users set email_confirmed_at=null where id='${owner}'`);
    assert.notEqual(sql(buildCatalogImportSQL([{...second,sku:'NEW'}], {ownerId: owner}), false).status, 0);
    assert.equal(state(), afterHostile);
    sql(`update auth.users set email_confirmed_at=now() where id='${owner}'; update public.calc3d_members set active=false where email='member@example.com'`);
    assert.notEqual(sql(buildCatalogImportSQL([{...second,sku:'NEW'}], {ownerId: owner}), false).status, 0);
    assert.equal(state(), afterHostile);
  } finally {
    if (started) run('pg_ctl', ['-D',data,'-m','immediate','-w','stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
