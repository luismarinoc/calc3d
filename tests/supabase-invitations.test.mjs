import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const foundation = resolve('supabase/migrations/202610210001_calc3d_storage.sql');
const membership = resolve('supabase/migrations/202610210002_calc3d_invitations.sql');
const checks = resolve('supabase/tests/invitations.sql');
function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${program} ${args.join(' ')} exited ${result.status}: ${result.error?.message ?? ''}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result.stdout;
}
function psql(port, args) {
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...args]);
}
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
  });
}

test('isolated PostgreSQL invitation admission and revocation across all public storage interfaces', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-invites-'));
  const data = join(root, 'data');
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await freePort();
    run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories=${root} -p ${port}`, '-w', 'start']);
    started = true;
    psql(port, ['-c', `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values
        ('ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6','Admin@Example.com',now()),
        ('11111111-1111-4111-8111-111111111111','Member@Example.com',now()),
        ('22222222-2222-4222-8222-222222222222','other@example.com',now()),
        ('33333333-3333-4333-8333-333333333333','unconfirmed@example.com',null);`]);
    psql(port, ['-f', foundation]);
    psql(port, ['-c', `delete from auth.users where id = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';`]);
    const missing = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port),
      '-U', 'postgres', '-d', 'postgres', '-f', membership], { encoding: 'utf8' });
    assert.equal(missing.status, 3, `missing bootstrap must abort: ${missing.stdout}\n${missing.stderr}`);
    assert.match(missing.stderr, /Calc3D bootstrap requires the existing confirmed Auth account/);
    assert.equal(psql(port, ['-A', '-t', '-c', `select to_regclass('public.calc3d_members') is null;`]).trim(), 't',
      'failed bootstrap must roll back schema changes');
    psql(port, ['-c', `insert into auth.users values
      ('ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6', 'Admin@Example.com', now());`]);
    psql(port, ['-f', membership]);
    psql(port, ['-f', checks]);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
