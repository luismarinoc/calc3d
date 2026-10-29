import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const member = '11111111-1111-4111-8111-111111111111';
const admin = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
const product = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/tpu-1kg-negro';
const stamp = '2026-01-01T00:00:00Z';
const row = { id: member, name: 'TPU Negro', material: 'TPU', brand: 'CREALITY', purchase_price: 12000,
  net_weight_grams: 1000, revision: 2, created_at: stamp, updated_at: stamp, archived_at: null };
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const portAvailable = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

test('public profile projection selects verified URLs and omits unsafe or absent metadata; legacy fields remain', async () => {
  let selected;
  const client = { from: () => ({ select(columns) { selected = columns; return Promise.resolve({ data: [row, { ...row, id: admin, source_url: product },
    { ...row, id: '22222222-2222-4222-8222-222222222222', source_url: 'javascript:alert(1)' },
    { ...row, id: '33333333-3333-4333-8333-333333333333', source_url: 'https://www.todotoner.cl@evil.test/impresoras/impresoras-3d/filamentos/x' },
    { ...row, id: '44444444-4444-4444-8444-444444444444', source_url: `${product}\n` },
    { ...row, id: '55555555-5555-4555-8555-555555555555', source_url: `${product}\r` }] }); } }) };
  const access = { requireAccess: async () => ({ session: { user: { id: member } }, access: { allowed: true } }) };
  const profiles = await createRemoteRepositories(client, { user: { id: member } }, access).spoolProfiles.list();
  assert.match(selected, /(?:^|,)source_url(?:,|$)/);
  assert.deepEqual(profiles.map(p => p.sourceUrl), [undefined, product, undefined, undefined, undefined, undefined]);
  assert.equal(Object.hasOwn(profiles[0], 'sourceUrl'), false);
  assert.equal(profiles[0].purchasePrice, 12000);
  assert.equal(profiles[0].netWeightGrams, 1000);
});

test('additive source metadata migration keeps existing rows and authenticated save preserves link; invalid writes change nothing', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-source-links-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable(), log = join(root, 'server.log');
    run('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port}`, '-w', 'start']);
    started = true;
    const sql = (text) => run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-c', text]).trim().split('\n').at(-1);
    const file = name => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/migrations', name)]);
    sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      insert into auth.users values ('${admin}','admin@example.com',now()),('${member}','member@example.com',now());`);
    for (const name of ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql', '202610220001_calc3d_spool_profiles.sql',
      '202610220002_restrict_sql_rpc.sql']) file(name);
    sql(`set role authenticated; set request.jwt.claim.sub='${admin}'; select public.calc3d_invite_user('member@example.com');
      set request.jwt.claim.sub='${member}'; select public.calc3d_save_spool_profile('{"name":"TPU Negro","material":"TPU","brand":"CREALITY","purchasePrice":12000,"netWeightGrams":1000}');`);
    for (const name of ['202610230001_calc3d_brands.sql', '202610230002_calc3d_profile_brand_colors.sql',
      '202610230003_calc3d_catalog_archive.sql', '202610260001_calc3d_member_identity.sql',
      '202610260002_calc3d_quote_integrity.sql', '202610270001_calc3d_access_requests.sql',
      '202610270002_calc3d_activity_audit.sql', '202610270003_calc3d_request_audit.sql']) file(name);
    const id = sql(`select id from public.calc3d_spool_profiles where owner_id='${member}';`);
    const before = JSON.parse(sql(`select to_jsonb(p) from public.calc3d_spool_profiles p where id='${id}';`));
    file('202610290001_calc3d_profile_source_urls.sql');
    const after = JSON.parse(sql(`select to_jsonb(p) from public.calc3d_spool_profiles p where id='${id}';`));
    assert.deepEqual(after, { ...before, source_url: null });
    sql(`update public.calc3d_spool_profiles set source_url='${product}' where id='${id}';`);
    const snapshot = () => JSON.parse(sql(`select to_jsonb(p) from public.calc3d_spool_profiles p where id='${id}';`));
    const assigned = snapshot();
    for (const url of ['javascript:alert(1)', 'https://evil.test/impresoras/impresoras-3d/filamentos/x',
      'https://user@www.todotoner.cl/impresoras/impresoras-3d/filamentos/x', 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/',
      `${product}\n`, `${product}\r`]) {
      const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-c', `update public.calc3d_spool_profiles set source_url='${url}' where id='${id}';`], { encoding: 'utf8', timeout: 30000 });
      assert.notEqual(result.status, 0, url);
      assert.deepEqual(snapshot(), assigned, `rejected ${url} must not change row/revision`);
    }
    const saved = JSON.parse(sql(`set role authenticated; set request.jwt.claim.sub='${member}';
      select to_jsonb(public.calc3d_save_spool_profile('{"name":"TPU Negro","material":"TPU","brand":"CREALITY","purchasePrice":13000,"netWeightGrams":1000}', '${id}', 1));`));
    assert.equal(saved.source_url, product);
    assert.equal(saved.revision, 2);
    assert.equal(saved.purchase_price, 13000);
    assert.equal(snapshot().source_url, product);
  } finally {
    if (started || spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8', timeout: 30000 }).status === 0)
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
