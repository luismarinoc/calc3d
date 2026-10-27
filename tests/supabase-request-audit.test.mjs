import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrations = ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql',
  '202610220001_calc3d_spool_profiles.sql', '202610230001_calc3d_brands.sql',
  '202610230002_calc3d_profile_brand_colors.sql', '202610230003_calc3d_catalog_archive.sql',
  '202610260001_calc3d_member_identity.sql', '202610260002_calc3d_quote_integrity.sql',
  '202610270001_calc3d_access_requests.sql', '202610270002_calc3d_activity_audit.sql'];
const seam = resolve('supabase/migrations/202610270003_calc3d_request_audit.sql');
const fixture = resolve('supabase/tests/request-audit.sql');
const admin = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
const applicant = '44444444-4444-4444-8444-444444444444';
const session = (uid, query) => `set role authenticated; set request.jwt.claim.sub='${uid}'; ${query}`;
const portAvailable = () => new Promise((resolvePort, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolvePort(port)); });
});
function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${program} exit=${result.status} stdout=${result.stdout} stderr=${result.stderr}`);
  return result;
}
async function database(candidate, callback) {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-request-audit-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable();
    run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
    started = true;
    const args = ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
    const query = sql => spawnSync('psql', [...args, '-c', sql], { encoding: 'utf8' });
    const ok = sql => {
      const result = query(sql);
      assert.equal(result.status, 0, `psql exit=${result.status} stdout=${result.stdout} stderr=${result.stderr}`);
      return result.stdout.trim().split('\n').at(-1);
    };
    ok(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      insert into auth.users values ('${admin}','admin@example.com',now()),
      ('${applicant}','applicant@example.com',now()),
      ('55555555-5555-4555-8555-555555555555','second@example.com',now());`);
    for (const name of migrations) run('psql', [...args, '-f', resolve('supabase/migrations', name)]);
    ok(`insert into public.calc3d_access_requests(user_id,email) values
      ('66666666-6666-4666-8666-666666666666','historical@example.com')`);
    if (candidate && existsSync(seam)) {
      const preserved = () => ok(`select jsonb_build_object(
        'quotes',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_quotes t),
        'purchases',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_purchases t),
        'spools',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_spools t),
        'counters',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_quote_counters t),
        'printers',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_printer_settings t),
        'profiles',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_spool_profiles t),
        'brands',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_brands t),
        'members',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_members t),
        'identities',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_member_identities t),
        'requests',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.calc3d_access_requests t))`);
      const before = JSON.parse(preserved());
      run('psql', [...args, '-f', seam]);
      assert.deepEqual(JSON.parse(preserved()), before, 'migration-only installation changed original rows');
      assert.equal(ok(`select count(*) from calc3d_audit_private.events where target_type='access_request'`), '0',
        'migration invented historical request events');
    }
    return await callback({ ok, query, args });
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
}

test('public request and review RPCs expose committed request events without payload or privilege leaks', async () => {
  await database(true, ({ args }) => {
    run('psql', [...args, '-f', fixture]);
  });
});

test('separate baseline/candidate public request-review differential preserves DTO, errors and business rows', async () => {
  async function exercise(candidate) {
    return database(candidate, ({ ok, query }) => {
      const result = [];
      const probe = sql => {
        const r = query(sql);
        if (r.status === 0) return { exit: 0, value: r.stdout.trim().split('\n').at(-1) };
        const error = r.stderr.match(/ERROR:\s+([0-9A-Z]{5}): ([^\n]+)/);
        assert.ok(error, `psql exit=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
        return { exit: r.status, code: error[1], message: error[2] };
      };
      for (const uid of [applicant, '55555555-5555-4555-8555-555555555555']) {
        const dto = JSON.parse(ok(session(uid, 'select public.calc3d_request_access();')));
        result.push({ state: dto.state, status: dto.request.status, revision: dto.request.revision, email: dto.request.email });
      }
      const ids = JSON.parse(ok(session(admin,
        `select json_agg(json_build_object('email',email,'status',status,'revision',revision) order by email) from public.calc3d_list_access_requests();`)));
      result.push(ids);
      const requestId = ok(`select id from public.calc3d_access_requests where user_id='${applicant}'`);
      result.push(probe(session(admin, `select public.calc3d_review_access_request('${requestId}','approved',9);`)));
      result.push(probe(session(admin, `select public.calc3d_review_access_request('${requestId}','invalid',0);`)));
      const accepted = JSON.parse(ok(session(admin,
        `select to_jsonb(public.calc3d_review_access_request('${requestId}','approved',0));`)));
      result.push({ status: accepted.status, revision: accepted.revision, user_id: accepted.user_id,
        reviewed: accepted.reviewed_at !== null });
      result.push(probe(session(admin, `select public.calc3d_review_access_request('${requestId}','rejected',0);`)));
      const other = ok(`select id from public.calc3d_access_requests where user_id='55555555-5555-4555-8555-555555555555'`);
      const rejected = JSON.parse(ok(session(admin,
        `select to_jsonb(public.calc3d_review_access_request('${other}','rejected',0));`)));
      result.push({ status: rejected.status, revision: rejected.revision, reviewed: rejected.reviewed_at !== null });
      result.push(JSON.parse(ok(session(applicant, 'select public.calc3d_access_status();'))));
      result.push(JSON.parse(ok(session('55555555-5555-4555-8555-555555555555', 'select public.calc3d_access_status();'))));
      const snapshot = JSON.parse(ok(`select json_build_object(
        'requests',(select json_agg(json_build_object('email',email,'status',status,'revision',revision) order by email) from public.calc3d_access_requests),
        'members',(select json_agg(json_build_object('email',email,'role',role,'active',active) order by email) from public.calc3d_members),
        'identities',(select json_agg(json_build_object('email',email,'user_id',user_id,'pending',pending) order by email) from public.calc3d_member_identities),
        'quotes',(select count(*) from public.calc3d_quotes),'purchases',(select count(*) from public.calc3d_purchases),
        'counters',(select count(*) from public.calc3d_quote_counters))`));
      if (candidate) assert.equal(ok(`select count(*) from calc3d_audit_private.events where target_type='access_request'`), '4');
      return { result, snapshot };
    });
  }
  assert.deepEqual(await exercise(true), await exercise(false));
});
