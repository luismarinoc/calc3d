import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrations = ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql'];
const admin = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${program} ${args.join(' ')} exited ${result.status}: ${result.error?.message ?? ''}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result.stdout;
}
function psql(port, args) {
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...args]);
}
function freePort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => accept(port));
    });
  });
}
test('public spool profile save, validation, ownership and admission', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-profiles-'));
  const data = join(root, 'data');
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await freePort();
    const log = join(root, 'server.log');
    const start = spawnSync('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port}`, '-w', 'start'], { encoding: 'utf8' });
    assert.equal(start.status, 0, `pg_ctl startup exited ${start.status}: ${start.error?.message ?? ''}\nstdout: ${start.stdout}\nstderr: ${start.stderr}\nserver.log: ${existsSync(log) ? readFileSync(log, 'utf8') : '(absent)'}`);
    started = true;
    psql(port, ['-c', `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values
        ('${admin}','Admin@Example.com',now()),
        ('11111111-1111-4111-8111-111111111111','Member@Example.com',now()),
        ('22222222-2222-4222-8222-222222222222','other@example.com',now());`]);
    for (const file of migrations) psql(port, ['-f', resolve('supabase/migrations', file)]);
    psql(port, ['-f', resolve('supabase/migrations/202610220001_calc3d_spool_profiles.sql')]);
    psql(port, ['-f', resolve('supabase/tests/spool-profiles.sql')]);
  } finally {
    if (started || spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8' }).status === 0) {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    }
    rmSync(root, { recursive: true, force: true });
  }
});
