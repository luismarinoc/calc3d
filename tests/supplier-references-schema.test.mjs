import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { calculateQuote } from '../src/domain/costs.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-pendiente';
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 12000 });
  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
  return result.stdout.trim().split('\n').at(-1);
};
const portAvailable = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

test('pending reference table is independent, constrained and SELECT-only for admitted owner', { timeout: 29000 }, async () => {
  const scratch = resolve('.cache/odd/todotoner-complete-filaments/pending-model-proof');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'pending-pg-'));
  const data = join(root, 'data'); let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable();
    run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port}`, '-w', 'start']);
    started = true;
    const args = ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
    const sql = text => run('psql', [...args, '-c', text]);
    const file = name => run('psql', [...args, '-f', resolve('supabase/migrations', name)]);
    sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      insert into auth.users values ('ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6','admin@example.test',now()),
        ('${owner}','owner@example.test',now()), ('${other}','other@example.test',now());`);
    for (const name of ['202610210001_calc3d_storage.sql','202610210002_calc3d_invitations.sql',
      '202610220001_calc3d_spool_profiles.sql','202610220002_restrict_sql_rpc.sql',
      '202610230001_calc3d_brands.sql','202610230002_calc3d_profile_brand_colors.sql',
      '202610230003_calc3d_catalog_archive.sql','202610260001_calc3d_member_identity.sql',
      '202610260002_calc3d_quote_integrity.sql','202610270001_calc3d_access_requests.sql',
      '202610270002_calc3d_activity_audit.sql','202610270003_calc3d_request_audit.sql',
      '202610290001_calc3d_profile_source_urls.sql']) file(name);
    sql(`insert into public.calc3d_spool_profiles(owner_id,name,material,brand,purchase_price,net_weight_grams,revision,source_url)
      values ('${owner}','Perfil preservado','PLA','',9000,500,1,'${url}');`);
    const beforeMigration = sql(`select to_jsonb(p) from public.calc3d_spool_profiles p where name='Perfil preservado'`);
    const quoteInput = { purpose: 'sale', spool: { purchasePrice: 10000, netWeightGrams: 1000 },
      grams: 50, hours: 1, minutes: 0, watts: 100, electricityPricePerKwh: 200,
      depreciationPerHour: 0, maintenancePerHour: 0, laborMinutes: 0,
      laborRatePerHour: 0, extraProductionCost: 0, markupPercent: 20 };
    const quotePayload = JSON.stringify({ title: 'Pieza', spoolId: 's1',
      client: { name: '', phone: '', email: '' }, form: { purpose: 'sale' }, input: quoteInput,
      result: calculateQuote(quoteInput) });
    const quoteCommand = `set role authenticated; set request.jwt.claim.sub='ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
      select result::text from public.calc3d_save_quote('${quotePayload}'::jsonb);`;
    const quoteResult = () => spawnSync('psql', [...args, '-c', quoteCommand], { encoding: 'utf8', timeout: 12000 });
    const beforeQuote = quoteResult();
    assert.equal(beforeQuote.status, 0, beforeQuote.stderr);
    const invalidPayload = JSON.stringify({ ...JSON.parse(quotePayload),
      input: { ...quoteInput, spool: { ...quoteInput.spool, netWeightGrams: 0 } } });
    const invalidQuote = () => spawnSync('psql', [...args,
      '-c', quoteCommand.replace(quotePayload, invalidPayload)], { encoding: 'utf8', timeout: 12000 });
    const beforeInvalid = invalidQuote();
    assert.equal(beforeInvalid.status, 1);
    assert.match(beforeInvalid.stderr, /ERROR:  Invalid quote input\n/);
    file('202610290002_calc3d_supplier_references.sql');
    const afterQuote = quoteResult();
    assert.deepEqual({ status: afterQuote.status, stdout: afterQuote.stdout, stderr: afterQuote.stderr },
      { status: beforeQuote.status, stdout: beforeQuote.stdout, stderr: beforeQuote.stderr });
    const afterInvalid = invalidQuote();
    assert.deepEqual({ status: afterInvalid.status, stdout: afterInvalid.stdout, stderr: afterInvalid.stderr },
      { status: beforeInvalid.status, stdout: beforeInvalid.stdout, stderr: beforeInvalid.stderr });
    assert.equal(sql(`select to_jsonb(p) from public.calc3d_spool_profiles p where name='Perfil preservado'`), beforeMigration);
    const verifiedAliases = [
      'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-mate-creality-verde-Palta-1kg',
      'https://www.todotoner.cl/filamento/pla-plus/filamentos-pla-arcoiris-1kg-ender-filamentos',
      'https://www.todotoner.cl/filamento-pla-mate-lila-1kg-con-bobina-plastica-esun-filamentos',
      'https://www.todotoner.cl/filamento-pla-hyper-alta-velocidad-amarillo-1kg-todotonercl-filamentos-1',
      'https://www.todotoner.cl/filamento-pla-hyper-alta-velocidad-azul-1kg-todotonercl-filamentos-1',
      'https://www.todotoner.cl/filamento-pla-lite-azul-1kg-bambu-lab-filamentos',
      'https://www.todotoner.cl/filamento-petg-gris-texturizado-anycubic-filamentos',
      'https://www.todotoner.cl/filamento-petg-cafe-oscuro-anycubic-filamentos',
    ];
    for (const link of [...verifiedAliases, url]) {
      assert.equal(sql(`select public.calc3d_official_filament_url('${link}')`), 't');
      sql(`insert into public.calc3d_spool_profiles(owner_id,name,material,brand,purchase_price,net_weight_grams,revision,source_url)
        values ('${owner}','PLA','PLA','',1000,500,1,'${link}');`);
    }
    for (const link of ['https://www.todotoner.cl/filamento-no-autorizado',
      'http://www.todotoner.cl/filamento-pla-lite-azul-1kg-bambu-lab-filamentos',
      'https://evil.test/filamento-pla-lite-azul-1kg-bambu-lab-filamentos', `${url}\n`])
      assert.equal(sql(`select public.calc3d_official_filament_url('${link}')`), 'f');
    assert.equal(sql(`select count(*) from public.calc3d_spool_profiles`), '10');
    sql(`insert into public.calc3d_supplier_references(owner_id,name,material,brand,source_url,pending_reasons,provenance)
      values ('${owner}','PLA','PLA','Marca','${url}',array['Peso neto sin confirmar'],'{"card":"source"}');`);
    const pendingId = sql(`select id from public.calc3d_supplier_references where owner_id='${owner}'`);
    sql(`insert into public.calc3d_members(email,role,active) values ('owner@example.test','member',true);
      insert into public.calc3d_member_identities(email,user_id,pending) values ('owner@example.test','${owner}',false);`);
    const countFor = actor => sql(`set role authenticated; set request.jwt.claim.sub='${actor}';
      select count(*) from public.calc3d_supplier_references;`);
    assert.equal(countFor(owner), '1');
    assert.equal(countFor(other), '0');
    sql(`update public.calc3d_members set active=false where email='owner@example.test'`);
    assert.equal(countFor(owner), '0');
    sql(`update public.calc3d_members set active=true where email='owner@example.test'`);
    assert.equal(sql(`select count(*) from public.calc3d_spool_profiles`), '10');
    assert.equal(sql(`select count(*) from public.calc3d_supplier_references`), '1');
    const rejected = text => {
      const result = spawnSync('psql', [...args, '-c', text], { encoding: 'utf8', timeout: 12000 });
      assert.notEqual(result.status, 0, `unexpected success: ${text}`);
      assert.equal(sql('select count(*) from public.calc3d_supplier_references'), '1');
      return result.stderr;
    };
    assert.match(rejected(`insert into public.calc3d_supplier_references(owner_id,name,material,source_url,pending_reasons,provenance)
      values ('${owner}','X','PLA','javascript:alert(1)',array['pending'],'{"card":"source"}');`), /violates check constraint/);
    assert.match(rejected(`insert into public.calc3d_supplier_references(owner_id,name,material,source_url,pending_reasons,provenance)
      values ('${owner}','X','PLA','${url}',array[]::text[],'{"card":"source"}');`), /violates check constraint/);
    assert.equal(sql(`select has_table_privilege('authenticated', 'public.calc3d_supplier_references', 'SELECT')`), 't');
    for (const privilege of ['INSERT','UPDATE','DELETE'])
      assert.equal(sql(`select has_table_privilege('authenticated', 'public.calc3d_supplier_references', '${privilege}')`), 'f');
    assert.equal(sql(`select has_table_privilege('anon', 'public.calc3d_supplier_references', 'SELECT')`), 'f');
    assert.equal(sql(`select count(*) from pg_policies where tablename='calc3d_supplier_references' and cmd='SELECT' and roles='{authenticated}'`), '1');
    const before = sql(`select (select count(*) from public.calc3d_quotes)::text || '/' ||
      (select count(*) from public.calc3d_quote_counters)::text || '/' ||
      (select count(*) from public.calc3d_spool_profiles)::text`);
    const error = rejected(`set role authenticated; set request.jwt.claim.sub='${owner}';
      select public.calc3d_save_quote('{"spoolId":"profile:${pendingId}"}'::jsonb);`);
    assert.match(error, /Pending supplier reference is not quotable/);
    assert.equal(sql(`select (select count(*) from public.calc3d_quotes)::text || '/' ||
      (select count(*) from public.calc3d_quote_counters)::text || '/' ||
      (select count(*) from public.calc3d_spool_profiles)::text`), before);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
