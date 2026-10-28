import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const foundation = resolve('supabase/migrations/202610210001_calc3d_storage.sql');
const invitations = resolve('supabase/migrations/202610210002_calc3d_invitations.sql');
const identity = resolve('supabase/migrations/202610260001_calc3d_member_identity.sql');
const checks = resolve('supabase/tests/identity.sql');
const run = (program, args, expected = 0) => {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, expected, `${program} exited ${result.status}; stdout: ${result.stdout}; stderr: ${result.stderr}`);
  return result;
};
const psql = (port, args, expected = 0) => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...args], expected);
const port = () => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const number = server.address().port;
    server.close(() => resolvePort(number));
  });
});

async function database(callback) {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-identity-'));
  const data = join(root, 'data');
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const number = await port();
    run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${number}`, '-w', 'start']);
    started = true;
    psql(number, ['-c', `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values
      ('ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6','Admin@Example.com',now()),
      ('11111111-1111-4111-8111-111111111111','Member@Example.com',now()),
      ('33333333-3333-4333-8333-333333333333','unconfirmed@example.com',null);`]);
    psql(number, ['-f', foundation]);
    psql(number, ['-f', invitations]);
    await callback(number);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
}

test('baseline differential: email recycling was admitted before UID binding', async () => {
  await database(async (number) => {
    psql(number, ['-c', `set role authenticated; set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select public.calc3d_invite_user('member@example.com');`]);
    psql(number, ['-c', `delete from auth.users where id='11111111-1111-4111-8111-111111111111';
      insert into auth.users values ('55555555-5555-4555-8555-555555555555','member@example.com',now());`]);
    const old = psql(number, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
      select public.calc3d_access_status();`]);
    assert.match(old.stdout, /"allowed": true/);
    psql(number, ['-c', `delete from auth.users where id='55555555-5555-4555-8555-555555555555';
      insert into auth.users values ('11111111-1111-4111-8111-111111111111','member@example.com',now());`]);
    const preserved = psql(number, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
      select public.calc3d_access_status();`]);
    psql(number, ['-f', identity]);
    const after = psql(number, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
      select public.calc3d_access_status();`]);
    assert.equal(after.stdout, preserved.stdout, 'existing member public status, stdout and exit unchanged');
    assert.equal(after.stderr, preserved.stderr);
    psql(number, ['-c', `delete from auth.users where id='11111111-1111-4111-8111-111111111111';
      insert into auth.users values ('55555555-5555-4555-8555-555555555555','member@example.com',now());`]);
    const current = psql(number, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
      select public.calc3d_access_status();`]);
    assert.match(current.stdout, /"allowed": false/);
  });
});

test('accepted identity never transfers and pending invitation claims require the confirmed UID', async () => {
  await database(async (number) => {
    psql(number, ['-c', `set role authenticated; set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select public.calc3d_invite_user('member@example.com');`]);
    psql(number, ['-f', identity]);
    psql(number, ['-f', checks]);
  });
});

test('historical unmatched memberships cannot be silently converted into new pending invitations', async () => {
  await database(async (number) => {
    psql(number, ['-c', `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select public.calc3d_invite_user('orphan@example.com');`]);
    psql(number, ['-f', identity]);
    const denied = psql(number, ['-c', `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select public.calc3d_invite_user('orphan@example.com');`], 1);
    assert.match(denied.stderr, /Historical Calc3D identity requires reconciliation/);
    assert.equal(psql(number, ['-At', '-c', `select (select count(*) from public.calc3d_members)=2 and
      (select count(*) from public.calc3d_member_identities where email='orphan@example.com' and user_id is null and not pending)=1;`]).stdout.trim(), 't');
  });
});

test('a pending invitation refuses ambiguous confirmed claim without changing public rows', async () => {
  await database(async (number) => {
    psql(number, ['-f', identity]);
    psql(number, ['-c', `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select public.calc3d_invite_user('pending@example.com');`]);
    psql(number, ['-c', `insert into auth.users values
      ('88888888-8888-4888-8888-888888888888','pending@example.com',now()),
      ('99999999-9999-4999-8999-999999999999','PENDING@example.com',now());`]);
    const denied = psql(number, ['-c', `set role authenticated; set request.jwt.claim.sub='88888888-8888-4888-8888-888888888888';
      select public.calc3d_claim_invitation();`], 1);
    assert.match(denied.stderr, /Ambiguous Calc3D member identity/);
    assert.equal(psql(number, ['-At', '-c', `select (select count(*) from public.calc3d_member_identities where pending and user_id is null)=1 and
      (select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_quote_counters)=0;`]).stdout.trim(), 't');
  });
});

test('backfill does not wait on an unrelated Auth insert transaction', async () => {
  await database(async (number) => {
    const process = spawn('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(number), '-U', 'postgres', '-d', 'postgres'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const ready = new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error('Auth transaction did not start')), 5000);
      process.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('AUTH_READY')) { clearTimeout(timer); resolveReady(); }
      });
      process.once('error', rejectReady);
    });
    process.stdin.end(`begin;\ninsert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','unrelated@example.com',now());\nselect 'AUTH_READY';\nselect pg_sleep(2);\ncommit;\n`);
    await ready;
    try {
      psql(number, ['-c', `set lock_timeout='500ms';`, '-f', identity]);
    } finally {
      const exit = await new Promise((resolveExit) => process.once('close', resolveExit));
      assert.equal(exit, 0, output);
    }
  });
});

test('claim definer with only Auth SELECT and Calc3D grants never locks shared Auth writes', async () => {
  await database(async (number) => {
    psql(number, ['-f', identity]);
    psql(number, ['-c', `create role calc3d_claim_owner nologin;
      grant usage on schema auth, public to calc3d_claim_owner;
      grant select on auth.users to calc3d_claim_owner;
      alter table public.calc3d_member_identities owner to calc3d_claim_owner;
      alter table public.calc3d_members owner to calc3d_claim_owner;
      grant execute on function auth.uid(), public.calc3d_access_status() to calc3d_claim_owner;
      alter function public.calc3d_claim_invitation() owner to calc3d_claim_owner;
      set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select public.calc3d_invite_user('pending@example.com');`]);
    psql(number, ['-c', `insert into auth.users values ('66666666-6666-4666-8666-666666666666','pending@example.com',now());`]);
    const process = spawn('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(number), '-U', 'postgres', '-d', 'postgres'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const ready = new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error('claim transaction did not start')), 5000);
      process.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('CLAIM_READY')) { clearTimeout(timer); resolveReady(); }
      });
      process.once('error', rejectReady);
    });
    process.stdin.end(`begin;\nset role authenticated;\nset request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';\nselect email from public.calc3d_claim_invitation();\nselect 'CLAIM_READY';\nselect pg_sleep(2);\ncommit;\n`);
    await ready;
    try {
      const unrelated = psql(number, ['-At', '-c', `set lock_timeout='500ms';
        insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','unrelated@example.com',now());
        select count(*) from auth.users where email='unrelated@example.com';`]);
      assert.match(unrelated.stdout, /\n1\n?$/);
      const locks = psql(number, ['-At', '-c', `select count(*) from pg_locks where relation='auth.users'::regclass
        and mode not in ('AccessShareLock','RowShareLock');`]);
      assert.equal(locks.stdout.trim(), '0', 'no Auth table lock beyond ordinary SELECT');
    } finally {
      const exit = await new Promise((resolveExit) => process.once('close', resolveExit));
      assert.equal(exit, 0, output);
    }
    assert.match(output, /pending@example.com/);
    assert.equal(psql(number, ['-At', '-c', `select has_table_privilege('calc3d_claim_owner','auth.users','UPDATE') or
      has_table_privilege('calc3d_claim_owner','auth.users','INSERT');`]).stdout.trim(), 'f');
  });
});

test('membership table and invitation RPCs preserve original four-field JSON shape', async () => {
  await database(async (number) => {
    psql(number, ['-f', identity]);
    const shape = psql(number, ['-At', '-c', `select string_agg(column_name,',' order by ordinal_position)
      from information_schema.columns where table_schema='public' and table_name='calc3d_members';`]).stdout.trim();
    assert.equal(shape, 'email,role,active,created_at');
    const result = psql(number, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select count(*) from jsonb_object_keys(to_jsonb(public.calc3d_invite_user('new@example.com')));`]);
    assert.match(result.stdout, /\n4\n?$/);
    const metadata = psql(number, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select (select string_agg(key,',' order by key) from jsonb_object_keys(to_jsonb(public.calc3d_invite_user('new@example.com'))) key)='active,created_at,email,role'
      and not has_table_privilege('anon','public.calc3d_member_identities','SELECT')
      and not has_table_privilege('authenticated','public.calc3d_member_identities','SELECT')
      and not has_table_privilege('authenticated','public.calc3d_member_identities','UPDATE')
      and not has_function_privilege('anon','public.calc3d_claim_invitation()','EXECUTE')
      and (select provolatile from pg_proc where oid='public.calc3d_access_status()'::regprocedure)='s';`]);
    assert.match(metadata.stdout, /\nt\n?$/, 'private grants, original DTO fields and STABLE status');
  });
});

test('independent baseline/candidate clusters preserve unchanged public RPC stdout, stderr and exits', async () => {
  const results = [];
  for (const migrate of [false, true]) {
    await database(async (number) => {
      psql(number, ['-c', `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
        select public.calc3d_invite_user('member@example.com');`]);
      psql(number, ['-c', `update public.calc3d_members set created_at='2020-01-01 00:00:00+00';`]);
      if (migrate) psql(number, ['-f', identity]);
      const query = `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
        select public.calc3d_access_status(); select to_jsonb(public.calc3d_invite_user('member@example.com'));
        select to_jsonb(public.calc3d_set_user_active('member@example.com', true));`;
      const good = psql(number, ['-At', '-c', query]);
      const bad = psql(number, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
        select public.calc3d_set_user_active('admin@example.com',false);`], 1);
      results.push({ good: { stdout: good.stdout, stderr: good.stderr, status: good.status },
        bad: { stdout: bad.stdout, stderr: bad.stderr, status: bad.status } });
    });
  }
  assert.deepEqual(results[1].good, results[0].good);
  assert.equal(results[1].bad.status, results[0].bad.status);
  assert.equal(results[1].bad.stdout, results[0].bad.stdout);
  assert.equal(results[1].bad.stderr.split('\n')[0], results[0].bad.stderr.split('\n')[0]);
  // CONTEXT function line numbers differ because the implementation has changed.
  assert.equal(results[1].bad.stderr.replace(/line \d+/g, 'line <n>'),
    results[0].bad.stderr.replace(/line \d+/g, 'line <n>'));
});

test('ambiguous confirmed backfill aborts atomically before changing any membership', async () => {
  await database(async (number) => {
    psql(number, ['-c', `insert into auth.users values ('44444444-4444-4444-8444-444444444444','MEMBER@example.com',now());
      set role authenticated; set request.jwt.claim.sub = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select public.calc3d_invite_user('member@example.com');`]);
    const failure = psql(number, ['-f', identity], 3);
    assert.match(failure.stderr, /Ambiguous Calc3D member identity/);
    assert.equal(psql(number, ['-At', '-c', `select to_regclass('public.calc3d_member_identities') is null and
      (select count(*) from public.calc3d_members)=2;`]).stdout.trim(), 't');
  });
});
