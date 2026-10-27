import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrations = ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql',
  '202610220001_calc3d_spool_profiles.sql', '202610230001_calc3d_brands.sql',
  '202610230002_calc3d_profile_brand_colors.sql', '202610230003_calc3d_catalog_archive.sql',
  '202610260001_calc3d_member_identity.sql', '202610260002_calc3d_quote_integrity.sql'];
const audit = resolve('supabase/migrations/202610270002_calc3d_activity_audit.sql');
const checks = resolve('supabase/tests/activity-audit.sql');
const owner = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
const portAvailable = () => new Promise((accept, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => accept(port)); });
});
function run(program, args) {
  const r = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(r.status, 0, `${program} exit=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  return r;
}
test('Calc3D audit records server decisions and committed changes with isolated grants/retention', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-audit-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable();
    run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
    started = true;
    const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
    const sql = command => run('psql', [...args, '-A', '-t', '-c', command]).stdout.trim().split('\n').at(-1);
    sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language plpgsql stable set search_path = '' as $$
        declare claims jsonb;
        begin
          begin claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
          exception when invalid_text_representation then claims := null; end;
          return coalesce(claims->>'sub', nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid;
        end $$;
      insert into auth.users values ('${owner}','admin@example.com',now()),
        ('11111111-1111-4111-8111-111111111111','member@example.com',now()),
        ('22222222-2222-4222-8222-222222222222','unknown@example.com',now());`);
    for (const name of migrations) run('psql', [...args, '-f', resolve('supabase/migrations', name)]);
    run('psql', [...args, '-f', audit]);
    run('psql', [...args, '-f', checks]);
    const adminCount = () => Number(run('psql', [...args, '-A', '-t', '-c',
      `set role authenticated; set request.jwt.claim.sub = '${owner}';
       select count(*) from public.calc3d_list_audit_events()
       where actor_id = '11111111-1111-4111-8111-111111111111' and action = 'access.decision';`])
      .stdout.trim().split('\n').at(-1));
    const before = adminCount();
    const sameSession = `set role authenticated;
      set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
      set request.jwt.claim.session_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      select public.calc3d_record_access();`;
    const parallel = () => new Promise((accept, reject) => {
      const child = spawn('psql', [...args, '-A', '-t', '-c', sameSession], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? accept(stdout) : reject(Error(`psql exit=${code} stdout=${stdout} stderr=${stderr}`)));
    });
    const outputs = await Promise.all([parallel(), parallel()]);
    for (const output of outputs) assert.match(output, /"allowed": true/);
    assert.equal(adminCount(), before, 'concurrent same-session bootstrap inflated audit rows');
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});

// Separate clusters, not pre/post calls in one database. All historical migration
// inputs are the unchanged baseline bytes; the candidate alone applies the audit.
test('baseline/candidate public business RPC differential (audit rows excepted)', async () => {
  const quote = `'{"title":"Pieza","spoolId":"s1","client":{"name":"","phone":"","email":""},"form":{"purpose":"sale"},"input":{"purpose":"sale","spool":{"purchasePrice":100,"netWeightGrams":100},"grams":10,"hours":0,"minutes":0,"watts":0,"electricityPricePerKwh":0,"markupPercent":100},"result":{"breakdown":{"material":10,"electricity":0,"depreciation":0,"maintenance":0,"labor":0,"extras":0},"totalCost":10,"internalCost":0,"basePrice":20,"discountAmount":0,"surchargeAmount":0,"finalPrice":20,"commercialProfit":10}}'::jsonb`;
  const printers = `'{"activeId":"demo-printer-p2s","printers":[{"id":"demo-printer-p2s","name":"Printer","modelId":"P2S","watts":130,"electricityPricePerKwh":200,"replacementCost":20000,"replacementLifetimeHours":4000}]}'::jsonb`;
  const purchase = `'{"date":"2026-10-01","supplier":{"name":"Supplier"},"lines":[{"material":"PLA","brand":"Brand","color":"Black","purchasePrice":20,"quantity":1,"netWeightGrams":1000}]}'::jsonb`;
  const actor = `set role authenticated; set request.jwt.claim.sub = '${owner}'; `;
  const probes = [
    `select role from public.calc3d_invite_user('member@example.com')`,
    `select active from public.calc3d_set_user_active('member@example.com',false)`,
    `select active from public.calc3d_set_user_active('member@example.com',true)`,
    `select number || ':' || result->>'finalPrice' from public.calc3d_save_quote(${quote})`,
    `select public.calc3d_save_quote('{}'::jsonb)`,
    `select total || ':' || spool_count from public.calc3d_save_purchase(${purchase})`,
    `select public.calc3d_save_purchase('{}'::jsonb)`,
    `select revision from public.calc3d_save_printers(${printers},0)`,
    `select public.calc3d_save_printers(${printers},0)`,
    `select revision from public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","purchasePrice":10,"netWeightGrams":1000}'::jsonb)`,
    `select revision from public.calc3d_save_spool_profile('{"name":"PETG","material":"PETG","purchasePrice":10,"netWeightGrams":1000}'::jsonb, (select id from public.calc3d_spool_profiles where name='PLA'),1)`,
    `select revision from public.calc3d_archive_spool_profile((select id from public.calc3d_spool_profiles where name='PETG'),2)`,
    `select public.calc3d_archive_spool_profile((select id from public.calc3d_spool_profiles where name='PETG'),2)`,
    `select revision from public.calc3d_save_brand('{"name":"Brand","color":"#AABBCC"}'::jsonb)`,
    `select revision from public.calc3d_save_brand('{"name":"Brand 2","color":"#AABBCC"}'::jsonb, (select id from public.calc3d_brands where name='Brand'),1)`,
    `select revision from public.calc3d_archive_brand((select id from public.calc3d_brands where name='Brand 2'),2)`,
    `select public.calc3d_archive_brand((select id from public.calc3d_brands where name='Brand 2'),2)`,
  ];
  async function cluster(candidate) {
    const root = mkdtempSync(join(tmpdir(), candidate ? 'calc3d-candidate-' : 'calc3d-baseline-'));
    const data = join(root, 'data'); let started = false;
    try {
      run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
      const port = await portAvailable();
      run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
      started = true;
      const args = ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
      run('psql', [...args, '-c', `create role anon nologin; create role authenticated nologin; create role service_role nologin;
        create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        insert into auth.users values ('${owner}','admin@example.com',now()),('11111111-1111-4111-8111-111111111111','member@example.com',now());`]);
      for (const name of migrations) {
        const source = join(root, name);
        writeFileSync(source, readFileSync(resolve('supabase/migrations', name)));
        run('psql', [...args, '-f', source]);
      }
      if (candidate) {
        const source = join(root, 'activity-audit.sql');
        writeFileSync(source, readFileSync(audit));
        run('psql', [...args, '-f', source]);
      }
      const outcomes = probes.map(query => {
        const r = spawnSync('psql', [...args, '-c', actor + query], { encoding: 'utf8' });
        if (r.status === 0) return { exit: 0, value: r.stdout.trim().split('\n').at(-1), stderr: r.stderr };
        const error = r.stderr.match(/ERROR:\s+([0-9A-Z]{5}): ([^\n]+)/);
        assert.ok(error, `unexpected public RPC failure: exit=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
        return { exit: r.status, state: error[1], message: error[2] };
      });
      const snapshot = run('psql', [...args, '-c', `select jsonb_build_object(
        'quotes',(select coalesce(jsonb_agg(to_jsonb(q) - 'id' - 'saved_at' order by number),'[]'::jsonb) from public.calc3d_quotes q),
        'counters',(select coalesce(jsonb_agg(to_jsonb(c) order by next_number),'[]'::jsonb) from public.calc3d_quote_counters c),
        'purchases',(select coalesce(jsonb_agg(to_jsonb(p) - 'id' - 'created_at' order by purchase_date),'[]'::jsonb) from public.calc3d_purchases p),
        'spools',(select coalesce(jsonb_agg(to_jsonb(s) - 'id' - 'purchase_id' order by material),'[]'::jsonb) from public.calc3d_spools s),
        'printers',(select coalesce(jsonb_agg(to_jsonb(p) order by revision),'[]'::jsonb) from public.calc3d_printer_settings p),
        'profiles',(select coalesce(jsonb_agg(to_jsonb(p) - 'id' - 'created_at' - 'updated_at' - 'archived_at' order by name),'[]'::jsonb) from public.calc3d_spool_profiles p),
        'brands',(select coalesce(jsonb_agg(to_jsonb(b) - 'id' - 'created_at' - 'updated_at' - 'archived_at' order by name),'[]'::jsonb) from public.calc3d_brands b),
        'member',(select jsonb_build_object('role',role,'active',active) from public.calc3d_members where email='member@example.com'))::text;`]).stdout.trim();
      if (candidate) assert.ok(Number(run('psql', [...args, '-c', 'select count(*) from calc3d_audit_private.events']).stdout.trim()) >= 9);
      return { outcomes, snapshot };
    } finally {
      if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
      rmSync(root, { recursive: true, force: true });
    }
  }
  const baseline = await cluster(false);
  const candidate = await cluster(true);
  assert.deepEqual(candidate, baseline, 'existing public RPC outputs, SQLSTATE/message and business snapshot must match');
});
