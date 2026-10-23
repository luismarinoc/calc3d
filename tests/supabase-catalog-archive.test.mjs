import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const member = '11111111-1111-4111-8111-111111111111';
const admin = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
function run(program, args) {
  const r = spawnSync(program, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, `${program} exited ${r.status}: ${r.error?.message ?? ''}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return r.stdout;
}
const sql = (port, args) => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...args]);
const freePort = () => new Promise((accept, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => accept(port)); });
});
test('owner RPC archives catalog identities without removing references or business history', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-archive-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await freePort(), log = join(root, 'server.log');
    const start = spawnSync('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port}`, '-w', 'start'], { encoding: 'utf8', timeout: 30000 });
    assert.equal(start.status, 0, `pg_ctl exited ${start.status}: ${start.error?.message ?? ''}\nstdout: ${start.stdout}\nstderr: ${start.stderr}\nlog: ${existsSync(log) ? readFileSync(log, 'utf8') : '(absent)'}`);
    started = true;
    sql(port, ['-c', `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      insert into auth.users values ('${admin}','admin@example.com',now()),('${member}','member@example.com',now()),
      ('22222222-2222-4222-8222-222222222222','other@example.com',now());`]);
    for (const file of ['202610210001_calc3d_storage.sql','202610210002_calc3d_invitations.sql',
      '202610220001_calc3d_spool_profiles.sql']) sql(port, ['-f', resolve('supabase/migrations', file)]);
    sql(port, ['-c', `set role authenticated; set request.jwt.claim.sub='${admin}';
      select public.calc3d_invite_user('member@example.com'); select public.calc3d_invite_user('other@example.com');
      set request.jwt.claim.sub='${member}';
      select public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","brand":"eSun PLA","purchasePrice":123,"netWeightGrams":1000}');
      select public.calc3d_save_purchase('{"date":"2026-01-01","supplier":{"name":"Shop"},"lines":[{"material":"PLA","brand":"ESUN PLA","color":"Blue","quantity":1,"netWeightGrams":1000,"purchasePrice":200}]}');`]);
    sql(port, ['-c', `insert into public.calc3d_quote_counters(owner_id,next_number) values ('${member}',2);
      insert into public.calc3d_quotes(owner_id,number,client,title,spool_id,form,input,result)
      values ('${member}','COT-000001','{}','Legacy','legacy','{}','{}','{}');`]);
    for (const file of ['202610230001_calc3d_brands.sql','202610230002_calc3d_profile_brand_colors.sql'])
      sql(port, ['-f', resolve('supabase/migrations', file)]);
    sql(port, ['-c', `set role authenticated; set request.jwt.claim.sub='${member}';
      select public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","purchasePrice":123,"netWeightGrams":1000,"filamentColor":"Azul","filamentColorHex":"#123456"}',
      (select id from public.calc3d_spool_profiles),1);`]);
    sql(port, ['-f', resolve('supabase/migrations/202610230003_calc3d_catalog_archive.sql')]);
    sql(port, ['-f', resolve('supabase/tests/catalog-archive.sql')]);
  } finally {
    if (started || spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8', timeout: 30000 }).status === 0)
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
