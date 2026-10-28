import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const files = ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql',
  '202610260001_calc3d_member_identity.sql', '202610270001_calc3d_access_requests.sql'];
function exec(program, args, expected = 0) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, expected, `${program} exit ${result.status} (wanted ${expected})\n${result.stdout}\n${result.stderr}`);
  return result;
}
function psql(port, sql, expected = 0) {
  return exec('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port),
    '-U', 'postgres', '-d', 'postgres', '-c', sql], expected);
}
const session = (uid, sql) => `set role authenticated; set request.jwt.claim.sub='${uid}'; ${sql}`;
const admin = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
const applicant = '44444444-4444-4444-8444-444444444444';
async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const number = server.address().port;
      server.close(() => resolvePort(number));
    });
  });
}
async function database(callback, candidate = true) {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-requests-'));
  const data = join(root, 'data');
  let started = false;
  try {
    exec('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await freePort();
    exec('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
    started = true;
    psql(port, `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values
      ('${admin}','Admin@Example.com',now()),
      ('11111111-1111-4111-8111-111111111111','Member@Example.com',now()),
      ('${applicant}','Applicant@Example.com',now()),
      ('33333333-3333-4333-8333-333333333333','unconfirmed@example.com',null);`);
    for (const file of files.slice(0, 2)) {
      exec('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/migrations', file)]);
    }
    psql(port, session(admin, `select public.calc3d_invite_user('member@example.com');`));
    for (const file of files.slice(2, candidate ? 4 : 3)) {
      exec('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/migrations', file)]);
    }
    await callback(port);
  } finally {
    if (started) exec('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
}

test('request RPC creates only a private pending request, not admission', async () => {
  await database((port) => {
    const response = JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1));
    assert.equal(response.state, 'pending');
    assert.deepEqual(Object.keys(response).sort(), ['request', 'state']);
    assert.deepEqual(Object.keys(response.request).sort(), ['created_at','email','id','reviewed_at','revision','status','updated_at','user_id']);
    assert.equal(response.request.email, 'applicant@example.com');
    assert.equal(response.request.user_id, applicant);
    assert.equal(response.request.revision, 0);
    assert.deepEqual(JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)), response);
    assert.equal(psql(port, session(applicant, 'select public.calc3d_access_status();')).stdout.includes('"allowed": false'), true);
    assert.equal(psql(port, `select (select count(*) from public.calc3d_members)=2 and
      (select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_quote_counters)=0;`).stdout.trim(), 't');
  });
});

test('public RPC authorization, rejection, CAS, privacy and unchanged business state', async () => {
  await database((port) => {
    exec('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port),
      '-U', 'postgres', '-d', 'postgres', '-f', resolve('supabase/tests/access-requests.sql')]);
  });
});

test('approval binds only the exact confirmed UID and never changes business counters', async () => {
  await database((port) => {
    const request = JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)).request;
    const reviewed = JSON.parse(psql(port, session(admin,
      `select to_jsonb(public.calc3d_review_access_request('${request.id}','approved',0));`)).stdout.trim().split('\n').at(-1));
    assert.equal(reviewed.status, 'approved');
    assert.equal(reviewed.revision, 1);
    assert.equal(reviewed.user_id, applicant);
    assert.equal(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.includes('"authorized"'), true);
    assert.equal(psql(port, session(applicant, 'select public.calc3d_access_status();')).stdout.includes('"allowed": true'), true);
    assert.equal(psql(port, `select (select count(*) from public.calc3d_members where email='applicant@example.com' and role='member' and active)=1 and
      (select count(*) from public.calc3d_member_identities where email='applicant@example.com' and user_id='${applicant}' and not pending)=1 and
      (select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_quote_counters)=0;`).stdout.trim(), 't');
    const denied = psql(port, session(admin,
      `select public.calc3d_review_access_request('${request.id}','approved',1);`), 1);
    assert.match(denied.stderr, /ERROR:  Access request revision conflict/);
    assert.equal(denied.status, 1);
  });
});

test('stale/deleted, recycled, renamed and ambiguous identities fail approval closed', async () => {
  for (const change of [
    `delete from auth.users where id='${applicant}';`,
    `delete from auth.users where id='${applicant}'; insert into auth.users values ('55555555-5555-4555-8555-555555555555','applicant@example.com',now());`,
    `update auth.users set email='changed@example.com' where id='${applicant}';`,
    `insert into auth.users values ('55555555-5555-4555-8555-555555555555','APPLICANT@example.com',now());`,
    `update auth.users set email_confirmed_at=null where id='${applicant}';`,
  ]) {
    await database((port) => {
      const request = JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)).request;
      psql(port, change);
      const failure = psql(port, session(admin,
        `select public.calc3d_review_access_request('${request.id}','approved',0);`), 1);
      assert.match(failure.stderr, /ERROR:  Access request identity changed/);
      assert.equal(failure.status, 1);
      assert.equal(psql(port, `select (select count(*) from public.calc3d_access_requests where status='pending' and revision=0)=1 and
        (select count(*) from public.calc3d_members)=2 and (select count(*) from public.calc3d_member_identities)=2 and
        (select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_quote_counters)=0;`).stdout.trim(), 't');
    });
  }
});

test('old accepted binding and admin role cannot be seized; inactive member stays revoked', async () => {
  await database((port) => {
    psql(port, session(admin, `select public.calc3d_set_user_active('member@example.com',false);`));
    const revoked = JSON.parse(psql(port, session('11111111-1111-4111-8111-111111111111',
      'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1));
    assert.deepEqual(revoked, { state: 'revoked', request: null });
    assert.equal(psql(port, `select (select count(*) from public.calc3d_access_requests)=0 and
      (select active from public.calc3d_members where email='member@example.com')=false;`).stdout.trim(), 't');
    psql(port, `update auth.users set email='member@example.com' where id='${applicant}';
      delete from auth.users where id='11111111-1111-4111-8111-111111111111';`);
    const failure = psql(port, session(applicant, 'select public.calc3d_request_access();'), 1);
    assert.match(failure.stderr, /Accepted Calc3D identity cannot be reassigned/);
    assert.equal(psql(port, `select (select count(*) from public.calc3d_access_requests)=0 and
      (select count(*) from public.calc3d_members)=2;`).stdout.trim(), 't');
  });
});

test('pending explicit invitation stays pending until claim or review; review retains member role', async () => {
  await database((port) => {
    const uid = '66666666-6666-4666-8666-666666666666';
    psql(port, session(admin, `select public.calc3d_invite_user('invited@example.com');`));
    psql(port, `insert into auth.users values ('${uid}','Invited@example.com',now());`);
    const request = JSON.parse(psql(port, session(uid, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)).request;
    assert.equal(psql(port, session(uid, 'select public.calc3d_access_status();')).stdout.includes('"allowed": false'), true);
    const reviewed = psql(port, session(admin, `select to_jsonb(public.calc3d_review_access_request('${request.id}','approved',0));`));
    assert.match(reviewed.stdout, /"status": "approved"/);
    assert.equal(psql(port, `select (select count(*) from public.calc3d_member_identities where email='invited@example.com' and user_id='${uid}' and not pending)=1
      and (select count(*) from public.calc3d_members where email='invited@example.com' and role='member' and active)=1
      and (select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_quote_counters)=0;`).stdout.trim(), 't');
  });
});

test('conflicting accepted administrator binding cannot be overwritten by approval', async () => {
  await database((port) => {
    const request = JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)).request;
    // An independently admitted administrator row appears while the request is pending.
    psql(port, `insert into public.calc3d_members(email,role) values ('applicant@example.com','admin');
      insert into public.calc3d_member_identities(email,user_id) values ('applicant@example.com','${applicant}');`);
    const failure = psql(port, session(admin, `select public.calc3d_review_access_request('${request.id}','approved',0);`), 1);
    assert.match(failure.stderr, /ERROR:  Access request membership conflict/);
    assert.equal(psql(port, `select (select status from public.calc3d_access_requests where id='${request.id}')='pending' and
      (select revision from public.calc3d_access_requests where id='${request.id}')=0 and
      (select role from public.calc3d_members where email='applicant@example.com')='admin' and
      (select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_quote_counters)=0;`).stdout.trim(), 't');
  });
});

test('orphan active membership cannot produce approved request without accepted UID binding', async () => {
  await database((port) => {
    psql(port, `insert into public.calc3d_members(email,role,active) values ('applicant@example.com','member',true);`);
    const request = JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)).request;
    const snapshot = () => psql(port, `select jsonb_build_object(
      'requests',(select jsonb_agg(to_jsonb(r) order by r.id) from public.calc3d_access_requests r),
      'members',(select jsonb_agg(to_jsonb(m) order by m.email) from public.calc3d_members m),
      'bindings',(select jsonb_agg(to_jsonb(i) order by i.email) from public.calc3d_member_identities i),
      'quotes',(select jsonb_agg(to_jsonb(q) order by q.id) from public.calc3d_quotes q),
      'purchases',(select jsonb_agg(to_jsonb(p) order by p.id) from public.calc3d_purchases p),
      'counters',(select jsonb_agg(to_jsonb(c) order by c.owner_id) from public.calc3d_quote_counters c));`).stdout.trim();
    const before = snapshot();
    const failure = psql(port, session(admin,
      `select public.calc3d_review_access_request('${request.id}','approved',0);`), 1);
    assert.match(failure.stderr, /ERROR:  Access request membership conflict/);
    assert.equal(failure.status, 1);
    assert.equal(snapshot(), before, 'request, member, binding and business/counter rows unchanged');
    assert.equal(psql(port, session(applicant, 'select public.calc3d_access_status();')).stdout.includes('"allowed": false'), true);
  });
});

test('approval holds only Calc3D locks while unrelated shared Auth inserts proceed', async () => {
  await database(async (port) => {
    const request = JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)).request;
    const process = spawn('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
      '-p', String(port), '-U', 'postgres', '-d', 'postgres'], { stdio: ['pipe','pipe','pipe'] });
    let output = '';
    let errors = '';
    process.stderr.on('data', (chunk) => { errors += chunk; });
    const ready = new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error(`approval did not start: ${output} ${errors}`)), 5000);
      process.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('REVIEW_READY')) { clearTimeout(timer); resolveReady(); }
      });
      process.once('error', rejectReady);
    });
    process.stdin.end(`begin;\nset role authenticated;\nset request.jwt.claim.sub='${admin}';\n` +
      `select status from public.calc3d_review_access_request('${request.id}','approved',0);\n` +
      `select 'REVIEW_READY';\nselect pg_sleep(2);\ncommit;\n`);
    await ready;
    try {
      const writer = psql(port, `set lock_timeout='500ms';
        insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','unrelated@example.com',now());
        select count(*) from auth.users where email='unrelated@example.com';`);
      assert.match(writer.stdout, /\n1\n?$/);
      assert.equal(psql(port, `select count(*) from pg_locks where relation='auth.users'::regclass
        and mode not in ('AccessShareLock','RowShareLock');`).stdout.trim(), '0');
    } finally {
      const exit = await new Promise((resolveExit) => process.once('close', resolveExit));
      assert.equal(exit, 0, `approval exit ${exit}: ${output} ${errors}`);
    }
  });
});

test('concurrent administrators reviewing one revision yield one approval and one CAS conflict', async () => {
  await database(async (port) => {
    const second = '77777777-7777-4777-8777-777777777777';
    psql(port, `insert into auth.users values ('${second}','second-admin@example.com',now());
      insert into public.calc3d_members(email,role) values ('second-admin@example.com','admin');
      insert into public.calc3d_member_identities(email,user_id) values ('second-admin@example.com','${second}');`);
    const request = JSON.parse(psql(port, session(applicant, 'select public.calc3d_request_access();')).stdout.trim().split('\n').at(-1)).request;
    const process = spawn('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
      '-p', String(port), '-U', 'postgres', '-d', 'postgres'], { stdio: ['pipe','pipe','pipe'] });
    let output = '';
    let errors = '';
    process.stderr.on('data', (chunk) => { errors += chunk; });
    const ready = new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error(`first review not ready: ${output} ${errors}`)), 5000);
      process.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('FIRST_REVIEW_READY')) { clearTimeout(timer); resolveReady(); }
      });
      process.once('error', rejectReady);
    });
    process.stdin.end(`begin;\nset role authenticated;\nset request.jwt.claim.sub='${admin}';\n` +
      `select status from public.calc3d_review_access_request('${request.id}','approved',0);\n` +
      `select 'FIRST_REVIEW_READY';\nselect pg_sleep(2);\ncommit;\n`);
    await ready;
    try {
      const loser = psql(port, session(second,
        `select public.calc3d_review_access_request('${request.id}','rejected',0);`), 1);
      assert.match(loser.stderr, /ERROR:  Access request revision conflict/);
      assert.equal(loser.status, 1);
    } finally {
      const exit = await new Promise((resolveExit) => process.once('close', resolveExit));
      assert.equal(exit, 0, `first review exit ${exit}: ${output} ${errors}`);
    }
    assert.match(output, /approved/);
    assert.equal(psql(port, `select (select count(*) from public.calc3d_access_requests where id='${request.id}' and status='approved' and revision=1)=1 and
      (select count(*) from public.calc3d_members where email='applicant@example.com' and role='member' and active)=1 and
      (select count(*) from public.calc3d_member_identities where email='applicant@example.com' and user_id='${applicant}' and not pending)=1 and
      (select count(*) from public.calc3d_quotes)=0 and (select count(*) from public.calc3d_purchases)=0 and
      (select count(*) from public.calc3d_quote_counters)=0;`).stdout.trim(), 't');
  });
});

test('baseline and candidate preserve unchanged public admission outputs and errors', async () => {
  const results = [];
  for (const candidate of [false, true]) {
    await database((port) => {
      psql(port, session(admin, `select public.calc3d_invite_user('pending@example.com');`));
      psql(port, `insert into auth.users values ('66666666-6666-4666-8666-666666666666','pending@example.com',now());`);
      const good = psql(port, session('66666666-6666-4666-8666-666666666666',
        `select public.calc3d_access_status(); select role,active from public.calc3d_claim_invitation();
         select public.calc3d_access_status();`));
      const denied = psql(port, session(admin,
        `select public.calc3d_set_user_active('admin@example.com',false);`), 1);
      const revoked = psql(port, session(admin,
        `select active from public.calc3d_set_user_active('member@example.com',false);`));
      const revokedStatus = psql(port, session('11111111-1111-4111-8111-111111111111',
        `select public.calc3d_access_status();`));
      const revokedWrite = psql(port, session('11111111-1111-4111-8111-111111111111',
        `select public.calc3d_save_quote('{}');`), 1);
      results.push({ good, denied, revoked, revokedStatus, revokedWrite });
    }, candidate);
  }
  for (const key of ['good','denied','revoked','revokedStatus','revokedWrite']) {
    assert.equal(results[1][key].status, results[0][key].status, `${key} exit`);
    assert.equal(results[1][key].stdout, results[0][key].stdout, `${key} stdout`);
    assert.equal(results[1][key].stderr, results[0][key].stderr, `${key} stderr`);
  }
});
