import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const admin = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${program} exited ${result.status}: ${result.error?.message ?? ''}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result.stdout;
}
function psql(port, args) { return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...args]); }
function freePort() { return new Promise((accept, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => accept(port)); });
}); }
test('legacy brands bootstrap through public reads and saves stay owner scoped', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-brands-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await freePort(); const log = join(root, 'server.log');
    const start = spawnSync('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port}`, '-w', 'start'], { encoding: 'utf8' });
    assert.equal(start.status, 0, `pg_ctl startup exited ${start.status}: ${start.error?.message ?? ''}\nstdout: ${start.stdout}\nstderr: ${start.stderr}\nserver.log: ${existsSync(log) ? readFileSync(log, 'utf8') : '(absent)'}`);
    started = true;
    psql(port, ['-c', `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values ('${admin}','Admin@Example.com',now()),
      ('11111111-1111-4111-8111-111111111111','Member@Example.com',now()),
      ('22222222-2222-4222-8222-222222222222','Other@Example.com',now());`]);
    for (const file of ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql', '202610220001_calc3d_spool_profiles.sql'])
      psql(port, ['-f', resolve('supabase/migrations', file)]);
    psql(port, ['-c', `set role authenticated; set request.jwt.claim.sub = '${admin}';
      select public.calc3d_invite_user('member@example.com'); select public.calc3d_invite_user('other@example.com');
      select public.calc3d_save_purchase('{"date":"2026-01-01","supplier":{"name":"Shop"},"lines":[{"material":"PLA","brand":"${'L'.repeat(121)}","color":"Blue","quantity":1,"netWeightGrams":1000,"purchasePrice":200}]}');
      set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
      select public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","brand":"eSun  PLA","purchasePrice":123,"netWeightGrams":1000}');
      select public.calc3d_save_purchase('{"date":"2026-01-01","supplier":{"name":"Shop"},"lines":[{"material":"PLA","brand":"ESUN PLA","color":"Blue","quantity":1,"netWeightGrams":1000,"purchasePrice":200}]}');
      set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
      select public.calc3d_save_spool_profile('{"name":"Other","material":"PLA","brand":"eSun PLA","purchasePrice":321,"netWeightGrams":500}');`]);
    // Existing immutable quote snapshot/counter fixture; there is no simple independent quote RPC input.
    psql(port, ['-c', `insert into public.calc3d_quote_counters(owner_id,next_number)
      values ('11111111-1111-4111-8111-111111111111', 2);
      insert into public.calc3d_quotes(owner_id,number,client,title,spool_id,form,input,result)
      values ('11111111-1111-4111-8111-111111111111','COT-000001','{}','Legacy','legacy','{}','{}','{}');`]);
    const publicReads = `set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
      select jsonb_build_object('profiles', (select jsonb_agg(to_jsonb(x)) from public.calc3d_spool_profiles x),
        'purchases', (select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
        'spools', (select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
        'quotes', (select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
        'counters', (select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x));`;
    const before = psql(port, ['-At', '-c', publicReads]);
    psql(port, ['-f', resolve('supabase/migrations/202610230001_calc3d_brands.sql')]);
    assert.equal(psql(port, ['-At', '-c', publicReads]), before, 'migration changed publicly visible historical rows');
    assert.equal(psql(port, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub = '${admin}';
      select count(*) from public.calc3d_brands where length(name) = 121 and color is null;`]).trim().split('\n').at(-1), '1');
    psql(port, ['-f', resolve('supabase/tests/brands.sql')]);
  } finally {
    if (started || spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8' }).status === 0) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
