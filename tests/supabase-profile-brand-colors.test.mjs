import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const member = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const admin = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
function run(program, args) {
  const r = spawnSync(program, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, `${program} exited ${r.status}: ${r.error?.message ?? ''}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return r.stdout;
}
const sql = (port, args) => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...args]);
const portAvailable = () => new Promise((accept, reject) => {
  const s = createServer(); s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => accept(port)); });
});
test('profile association/color migration and public RPC preserve owner/history', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-profile-colors-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable(), log = join(root, 'server.log');
    const start = spawnSync('pg_ctl', ['-D', data, '-l', log, '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port}`, '-w', 'start'], { encoding: 'utf8', timeout: 30000 });
    assert.equal(start.status, 0, `pg_ctl exited ${start.status}: ${start.error?.message ?? ''}\nstdout: ${start.stdout}\nstderr: ${start.stderr}\nlog: ${existsSync(log) ? readFileSync(log, 'utf8') : '(absent)'}`);
    started = true;
    sql(port, ['-c', `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      insert into auth.users values ('${admin}','admin@example.com',now()),('${member}','member@example.com',now()),('${other}','other@example.com',now());`]);
    for (const file of ['202610210001_calc3d_storage.sql','202610210002_calc3d_invitations.sql','202610220001_calc3d_spool_profiles.sql'])
      sql(port, ['-f', resolve('supabase/migrations', file)]);
    sql(port, ['-c', `set role authenticated; set request.jwt.claim.sub='${admin}';
      select public.calc3d_invite_user('member@example.com'); select public.calc3d_invite_user('other@example.com');
      set request.jwt.claim.sub='${member}';
      select public.calc3d_save_spool_profile('{"name":"PLA","material":"PLA","brand":"eSun  PLA","purchasePrice":123,"netWeightGrams":1000}');
      select public.calc3d_save_purchase('{"date":"2026-01-01","supplier":{"name":"Shop"},"lines":[{"material":"PLA","brand":"ESUN PLA","color":"Blue","quantity":1,"netWeightGrams":1000,"purchasePrice":200}]}');
      set request.jwt.claim.sub='${other}';
      select public.calc3d_save_spool_profile('{"name":"Other","material":"PLA","brand":"eSun PLA","purchasePrice":321,"netWeightGrams":500}');`]);
    sql(port, ['-c', `insert into public.calc3d_quote_counters(owner_id,next_number) values ('${member}',2);
      insert into public.calc3d_quotes(owner_id,number,client,title,spool_id,form,input,result)
      values ('${member}','COT-000001','{}','Legacy','legacy','{}','{}','{}');`]);
    sql(port, ['-f', resolve('supabase/migrations/202610230001_calc3d_brands.sql')]);
    sql(port, ['-c', `set role authenticated; set request.jwt.claim.sub='${member}';
      select public.calc3d_save_brand('{"name":"Renamed Brand","color":"#123456"}',
        (select id from public.calc3d_brands where normalized_name='esun pla'),1);`]);
    const before = sql(port, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='${member}';
      select jsonb_build_object('profile',(select to_jsonb(x) from public.calc3d_spool_profiles x),
        'purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
        'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
        'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
        'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x));`]).trim().split('\n').at(-1);
    sql(port, ['-f', resolve('supabase/migrations/202610230002_calc3d_profile_brand_colors.sql')]);
    const after = JSON.parse(sql(port, ['-At', '-c', `set role authenticated; set request.jwt.claim.sub='${member}';
      select jsonb_build_object('profile',(select to_jsonb(x) from public.calc3d_spool_profiles x),
        'purchases',(select jsonb_agg(to_jsonb(x)) from public.calc3d_purchases x),
        'spools',(select jsonb_agg(to_jsonb(x)) from public.calc3d_spools x),
        'quotes',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quotes x),
        'counters',(select jsonb_agg(to_jsonb(x)) from public.calc3d_quote_counters x));`]).trim().split('\n').at(-1));
    const old = JSON.parse(before);
    const { brand_id, filament_color, filament_color_hex, ...unchangedProfile } = after.profile;
    assert.deepEqual(unchangedProfile, old.profile);
    assert.equal(after.profile.filament_color, '');
    assert.equal(after.profile.filament_color_hex, null);
    assert.ok(after.profile.brand_id);
    for (const key of ['purchases','spools','quotes','counters']) assert.deepEqual(after[key], old[key]);
    const otherBrand = sql(port, ['-At', '-c', `select id from public.calc3d_brands where owner_id='${other}';`]).trim();
    sql(port, ['-v', `other_brand=${otherBrand}`, '-f', resolve('supabase/tests/profile-brand-colors.sql')]);
  } finally {
    if (started || spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8', timeout: 30000 }).status === 0)
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
