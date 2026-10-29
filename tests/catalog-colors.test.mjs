import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildCatalogColorsSQL } from '../ops/catalog-colors.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
function id(sku, uid = owner) {
  const h = createHash('sha256').update(`calc3d:catalog:todotoner:v1:${uid}:${sku}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
function match(sku = 'TEST-A', color = 'Azul', uid = owner) {
  const originalName = `Filamento PLA ${color} | Filamentos`;
  return { sku, id: id(sku, uid), expected: { name: `Filamento PLA ${color}`, originalName, material: 'PLA', brand: 'ACME', netWeightGrams: 1000 },
    sourceUrl: 'https://www.todotoner.cl/filamentos/pla', color,
    evidence: { path: 'Product.additionalProperty[Color]', value: color,
      sku: { path: 'Product.sku', value: sku }, name: { path: 'Product.name', value: originalName } } };
}
function manifest(matches = [match()]) { return { ownerId: owner, matches }; }
function build(m = manifest(), expectedRevision = 1) { return buildCatalogColorsSQL(m, { ownerId: owner, expectedRevision }); }
function run(program, args, ok = true) {
  const r = spawnSync(program, args, { encoding: 'utf8', timeout: 30000 });
  if (ok) assert.equal(r.status, 0, `${program}: ${r.stdout}\n${r.stderr}\n${r.error ?? ''}`);
  return r;
}
function port() { return new Promise((yes, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => yes(p)); }); }); }

test('input and exact source proof fail closed, title evidence accepts bounded color token', () => {
  const a = match();
  for (const m of [manifest([]), manifest([a, a]), manifest([a, { ...a, sku: 'TEST-B' }]),
    { ...manifest(), ownerId: other }, manifest([{ ...a, id: id('TEST-B') }]),
    manifest([{ ...a, sourceUrl: 'https://www.todotoner.cl.evil/abc' }]),
    manifest([{ ...a, sourceUrl: 'http://www.todotoner.cl/abc' }]),
    manifest([{ ...a, color: '\nAzul' }]), manifest([{ ...a, color: 'a'.repeat(121) }]),
    manifest([{ ...a, evidence: { ...a.evidence, value: 'Rojo' } }]),
    manifest([{ ...a, evidence: { ...a.evidence, sku: { path: 'Product.sku', value: 'WRONG' } } }]),
    manifest([{ ...a, evidence: { ...a.evidence, path: 'Product.name', value: a.expected.originalName.replace('Azul', 'Rojo') } }]),
    manifest([{ ...a, evidence: { ...a.evidence, path: 'Product.name', value: a.expected.originalName }, color: 'Rojo' }])]) {
    assert.throws(() => build(m));
  }
  assert.throws(() => build(manifest(), 0));
  assert.throws(() => build(manifest(), 1.5));
  assert.throws(() => build(manifest(Array.from({ length: 72 }, (_, i) => match(`SKU-${i}`)))));
  assert.throws(() => buildCatalogColorsSQL(manifest(), { ownerId: other, expectedRevision: 1 }));
  const title = { ...a, evidence: { ...a.evidence, path: 'Product.name', value: a.expected.originalName } };
  assert.match(build(manifest([title])), /calc3d_spool_profiles/);
  assert.match(build(manifest([match('TEST-B', "O'Neill") ])), /calc3d_spool_profiles/);
});

test('public SQL atomically updates color only; rejects stale, other owner, sample, archive and inactive identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-colors-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const p = await port(); const log = join(root, 'server.log');
    const start = run('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${p}`, '-w', 'start'], false);
    assert.equal(start.status, 0, `${start.stderr}\n${readFileSync(log, 'utf8')}`); started = true;
    const sql = (text, ok = true) => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(p), '-U', 'postgres', '-d', 'postgres', '-c', text], ok);
    sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; insert into auth.users values ('ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6','admin@example.com',now()), ('${owner}','member@example.com',now()), ('${other}','other@example.com',now());`);
    for (const f of ['202610210001_calc3d_storage.sql','202610210002_calc3d_invitations.sql','202610220001_calc3d_spool_profiles.sql','202610230001_calc3d_brands.sql','202610230002_calc3d_profile_brand_colors.sql','202610230003_calc3d_catalog_archive.sql','202610260001_calc3d_member_identity.sql','202610270002_calc3d_activity_audit.sql'])
      run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(p), '-U','postgres','-d','postgres','-f',resolve('supabase/migrations', f)]);
    const a = match(), b = match('TEST-B', "O'Neill"), c = match('TEST-C', 'Negro');
    sql(`insert into public.calc3d_members(email,role) values ('member@example.com','member'),('other@example.com','member'); insert into public.calc3d_member_identities(email,user_id) values ('member@example.com','${owner}'),('other@example.com','${other}');
      insert into public.calc3d_spool_profiles(id,owner_id,name,material,brand,purchase_price,net_weight_grams,revision) values
      ('${a.id}','${owner}','${a.expected.name}','PLA','ACME',1234,1000,1),
      ('${b.id}','${owner}','Filamento PLA O''Neill','PLA','ACME',4321,1000,1),
      ('${c.id}','${owner}','${c.expected.name}','PLA','ACME',5000,1000,1),
      ('${id('PERSONAL')}','${owner}','Personal','PETG','',55,500,1),
      ('${id('TEST-FOREIGN', other)}','${other}','Foreign','PLA','',10,500,1);
      insert into public.calc3d_quote_counters(owner_id,next_number) values ('${owner}',7);
      insert into public.calc3d_purchases(id,owner_id,purchase_date,supplier,notes,lines,total,spool_count)
        values ('33333333-3333-4333-8333-333333333333','${owner}','2026-01-02','{"name":"Synthetic"}','fixture','[]',345,1);
      insert into public.calc3d_spools(owner_id,purchase_id,purchase_date,supplier,material,brand,color,purchase_price,net_weight_grams,remaining_grams)
        values ('${owner}','33333333-3333-4333-8333-333333333333','2026-01-02','{"name":"Synthetic"}','PLA','ACME','White',345,1000,850);`);
    const state = () => JSON.parse(sql(`select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.calc3d_spool_profiles p), 'business',jsonb_build_object('quotes',(select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from public.calc3d_quotes q),'counters',(select coalesce(jsonb_agg(to_jsonb(c) order by owner_id),'[]') from public.calc3d_quote_counters c),'purchases',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.calc3d_purchases t),'spools',(select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from public.calc3d_spools s)), 'audit',(select count(*) from calc3d_audit_private.events))`).stdout.trim());
    const reject = (patch, expected = /ERROR/) => { const before = state(); const r = sql(patch, false); assert.notEqual(r.status, 0, r.stderr); assert.match(r.stderr, expected); assert.deepEqual(state(), before); };
    const initial = state();
    reject(`set role authenticated; ${build()}`);
    reject(build(manifest([a, b, c]), 2));
    assert.throws(() => build(manifest([a, { ...b, id: id('TEST-FOREIGN', other) }])));
    reject(build(manifest([a, { ...b, expected: { ...b.expected, brand: 'OTHER' } }])));
    reject(build(manifest([a, { ...b, expected: { ...b.expected, netWeightGrams: 2000 } }])));
    reject(build(manifest([a, match('MISSING')])));
    sql(`update public.calc3d_spool_profiles set owner_id='${other}' where id='${b.id}'`);
    reject(build(manifest([a,b])));
    sql(`update public.calc3d_spool_profiles set owner_id='${owner}' where id='${b.id}'`);
    sql(`update public.calc3d_member_identities set user_id=null where email='member@example.com'`);
    reject(build(manifest([a,b])));
    sql(`update public.calc3d_member_identities set user_id='${owner}' where email='member@example.com'`);
    sql(`update public.calc3d_spool_profiles set revision=2 where id='${b.id}'`);
    reject(build(manifest([a, b]))); sql(`update public.calc3d_spool_profiles set revision=1 where id='${b.id}'`);
    sql(`update public.calc3d_spool_profiles set filament_color='Existing' where id='${b.id}'`);
    reject(build(manifest([a,b]))); sql(`update public.calc3d_spool_profiles set filament_color='' where id='${b.id}'`);
    sql(`update public.calc3d_spool_profiles set filament_color='Existing', filament_color_hex='#AABBCC' where id='${b.id}'`);
    reject(build(manifest([a,b])));
    sql(`update public.calc3d_spool_profiles set filament_color='', filament_color_hex=null where id='${b.id}'`);
    sql(`update public.calc3d_spool_profiles set archived_at=now() where id='${b.id}'`);
    reject(build(manifest([a,b])));
    sql(`update public.calc3d_spool_profiles set archived_at=null where id='${b.id}'`);
    sql(`update public.calc3d_members set active=false where email='member@example.com'`);
    reject(build(manifest([a,b])));
    sql(`update public.calc3d_members set active=true where email='member@example.com'`);
    const patch = build(manifest([a,b]));
    sql(`create function public.corrupt_colors() returns trigger language plpgsql as $$ begin new.purchase_price := new.purchase_price + 1; return new; end $$; create trigger corrupt_colors before update on public.calc3d_spool_profiles for each row execute function public.corrupt_colors()`);
    reject(patch);
    sql('drop trigger corrupt_colors on public.calc3d_spool_profiles');
    // AFTER trigger changes a *different* target after row A is checked, before row B's local snapshot.
    sql(`create function public.corrupt_sibling() returns trigger language plpgsql as $$ begin
      if new.id = '${a.id}' then update public.calc3d_spool_profiles set purchase_price=purchase_price+1 where id='${b.id}'; end if;
      return new; end $$;
      create trigger corrupt_sibling after update on public.calc3d_spool_profiles for each row execute function public.corrupt_sibling()`);
    reject(patch, /Catalog color preservation failed/);
    sql('drop trigger corrupt_sibling on public.calc3d_spool_profiles');
    const before = state(); const applied = sql(patch);
    assert.match(applied.stderr, /Catalog colors: updated 2/);
    const after = state(); assert.equal(after.audit, before.audit + 2);
    assert.deepEqual(after.business, before.business);
    assert.deepEqual(after.profiles.map((p, i) => ({ ...p, filament_color: '', revision: p.revision - (p.id === a.id || p.id === b.id ? 1 : 0), updated_at: (p.id === a.id || p.id === b.id) ? before.profiles[i].updated_at : p.updated_at })), before.profiles);
    assert.equal(after.profiles.find(p => p.id === a.id).filament_color, 'Azul');
    assert.equal(after.profiles.find(p => p.id === b.id).filament_color, "O'Neill");
    reject(patch);
    assert.equal(initial.profiles.length, after.profiles.length);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
