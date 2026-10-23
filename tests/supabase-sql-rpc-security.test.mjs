import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migration = resolve('supabase/migrations/202610220002_restrict_sql_rpc.sql');
const fixture = resolve('supabase/tests/sql-rpc-security.sql');
const input = 'select value from public.rpc_fixture_state';
const mutation = "update public.rpc_fixture_state set value = 'changed', counter = counter + 1";

function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, `${program} ${args.join(' ')} exited ${result.status}: ${result.error?.message ?? ''}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}
function psql(port, sql, db = 'postgres') {
  return spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db, '-c', sql], { encoding: 'utf8', timeout: 30_000 });
}
function ok(result) {
  assert.equal(result.status, 0, `exit ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.equal(result.stderr, '');
  return result.stdout;
}
function file(port, path, db = 'postgres') {
  return ok(spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db, '-f', path], { encoding: 'utf8', timeout: 30_000 }));
}
function call(port, role, expression, db = 'postgres') {
  return psql(port, `set role ${role}; select ${expression};`, db);
}
function denied(result) {
  assert.equal(result.status, 1, `expected permission denial, got exit ${result.status}: ${result.stdout} ${result.stderr}`);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'ERROR:  permission denied for function execute_sql\n');
}
function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function deniedState(port, role, expression) {
  ok(psql(port, `set role ${role}; do $rpc$ declare code text; begin
    begin perform ${expression};
      raise exception 'call was permitted' using errcode = 'P0001';
    exception when others then
      get stacked diagnostics code = returned_sqlstate;
      if code <> '42501' then raise exception 'unexpected SQLSTATE: %', code; end if;
    end;
  end $rpc$;`));
}
function snapshot(port) {
  return ok(psql(port, `select jsonb_build_object(
    'state', (select to_jsonb(s) from public.rpc_fixture_state s),
    'two', (select to_jsonb(p) from pg_catalog.pg_proc p where p.oid = 'public.execute_sql(text,boolean)'::regprocedure),
    'untouched', (select to_jsonb(p) from pg_catalog.pg_proc p where p.oid = 'public.rpc_fixture_untouched()'::regprocedure),
    'one_body', pg_catalog.pg_get_functiondef('public.execute_sql(text)'::regprocedure),
    'one_owner', (select proowner from pg_catalog.pg_proc where oid = 'public.execute_sql(text)'::regprocedure)
  )::text;`));
}
function acl(port) {
  return JSON.parse(ok(psql(port, `select jsonb_build_object(
    'public', has_function_privilege('public', 'public.execute_sql(text)', 'execute'),
    'anon', has_function_privilege('anon', 'public.execute_sql(text)', 'execute'),
    'authenticated', has_function_privilege('authenticated', 'public.execute_sql(text)', 'execute'),
    'service_role', has_function_privilege('service_role', 'public.execute_sql(text)', 'execute'))::text;`)));
}
function noOverloadChanges(port, before) {
  assert.equal(snapshot(port), before);
  for (const role of ['anon', 'authenticated']) denied(call(port, role, `public.execute_sql('${input}', true)`));
  const admin = call(port, 'service_role', `public.execute_sql('${input}', true)`);
  assert.equal(admin.status, 0);
  assert.equal(admin.stdout, `{"flag": true, "input": "${input}", "route": "two"}\n`);
  assert.equal(admin.stderr, '');
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

test('one-argument SQL RPC ACL only; no overload or fixture state changes', { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-sql-rpc-'));
  const data = join(root, 'data');
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await freePort();
    const log = join(root, 'server.log');
    const start = spawnSync('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port}`, '-w', 'start'], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(start.status, 0, `pg_ctl startup exited ${start.status}: ${start.error?.message ?? ''}\nstdout: ${start.stdout}\nstderr: ${start.stderr}\nserver.log: ${existsSync(log) ? readFileSync(log, 'utf8') : '(absent)'}`);
    started = true;
    file(port, fixture);
    const before = snapshot(port);
    assert.deepEqual(acl(port), { public: true, anon: true, authenticated: true, service_role: true });
    noOverloadChanges(port, before);

    // Before this migration, both calls succeed: RED must fail on the real privilege expectation.
    if (existsSync(migration)) file(port, migration);
    for (const role of ['anon', 'authenticated']) {
      for (const sql of [input, mutation]) {
        const unchanged = snapshot(port);
        const expression = `public.execute_sql(${sqlLiteral(sql)})`;
        denied(call(port, role, expression));
        deniedState(port, role, expression);
        assert.equal(snapshot(port), unchanged, `${role} rejected call changed data, counters or function metadata`);
      }
    }
    assert.deepEqual(acl(port), { public: false, anon: false, authenticated: false, service_role: true });
    const admin = call(port, 'service_role', `public.execute_sql('${input}')`);
    assert.equal(admin.status, 0);
    assert.equal(admin.stdout, `{"input": "${input}", "route": "one"}\n`);
    assert.equal(admin.stderr, '');
    noOverloadChanges(port, before);
    file(port, migration);
    assert.deepEqual(acl(port), { public: false, anon: false, authenticated: false, service_role: true });
    noOverloadChanges(port, before);

    // Fresh installation: an absent one-argument helper is not created or required.
    ok(psql(port, 'create database rpc_absent'));
    ok(psql(port, `create function public.execute_sql(text, boolean) returns jsonb language sql as $$ select jsonb_build_object('input', $1, 'flag', $2) $$;
      revoke all on function public.execute_sql(text, boolean) from public, anon, authenticated;
      grant execute on function public.execute_sql(text, boolean) to service_role;`, 'rpc_absent'));
    const absentBefore = ok(psql(port, `select to_jsonb(p)::text from pg_catalog.pg_proc p where p.oid = 'public.execute_sql(text,boolean)'::regprocedure`, 'rpc_absent'));
    file(port, migration, 'rpc_absent');
    assert.equal(ok(psql(port, `select count(*) from pg_catalog.pg_proc where oid = to_regprocedure('public.execute_sql(text)')`, 'rpc_absent')), '0\n');
    assert.equal(ok(psql(port, `select to_jsonb(p)::text from pg_catalog.pg_proc p where p.oid = 'public.execute_sql(text,boolean)'::regprocedure`, 'rpc_absent')), absentBefore);
    file(port, migration, 'rpc_absent');
  } finally {
    if (started || spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8' }).status === 0) {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    }
    rmSync(root, { recursive: true, force: true });
  }
});
