import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { calculateQuote } from '../src/domain/costs.mjs';
import { calculateReferenceQuote } from '../src/domain/reference-costs.mjs';

const paths = ['202610210001_calc3d_storage.sql', '202610210002_calc3d_invitations.sql', '202610260002_calc3d_quote_integrity.sql']
  .map(name => resolve('supabase/migrations', name));
const owner = 'ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6';
const member = '11111111-1111-4111-8111-111111111111';
function call(program, args) {
  const output = spawnSync(program, args, { encoding: 'utf8' });
  assert.equal(output.status, 0, `${program} exit=${output.status} stdout=${output.stdout} stderr=${output.stderr}`);
  return output.stdout;
}
const portAvailable = () => new Promise((resolvePort, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolvePort(port)); });
});
const input = { purpose: 'sale', spool: { purchasePrice: 22000, netWeightGrams: 1000 }, grams: 294,
  hours: 11, minutes: 0, watts: 130, electricityPricePerKwh: 230, depreciationPerHour: 3,
  maintenancePerHour: 2, laborMinutes: 24, laborRatePerHour: 200, extraProductionCost: 0.5,
  markupPercent: 35, discount: { type: 'percent', value: 5 }, surcharge: { type: 'amount', value: 100 } };
const reference = { ...input, replacementCost: 220000, replacementLifetimeHours: 4320, errorPercent: 5,
  multiplier: 2, discount: { type: 'percent', value: 10 }, surcharge: { type: 'percent', value: 5 } };
function expected(mode, source) {
  if (mode === 'reference') return calculateReferenceQuote(source);
  const result = calculateQuote(source.purpose === 'gift' ? { ...source, purpose: 'internal' } : source);
  return source.purpose === 'gift' ? { ...result, internalCost: 0, giftCost: result.totalCost } : result;
}
function payload(mode, source, result = expected(mode, source)) {
  return { title: 'Pieza', spoolId: 's1', client: { name: '', phone: '', email: '' },
    form: { purpose: source.purpose, ...(mode === 'reference' ? { calculationMode: mode } : {}) }, input: source, result };
}
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

test('public admission derives new quote totals from input and preserves historical snapshots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-integrity-'));
  const data = join(root, 'data'); let started = false;
  try {
    call('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await portAvailable();
    call('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, '-w', 'start']);
    started = true;
    const psql = (sql, flags = []) => spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...flags, '-c', sql], { encoding: 'utf8' });
    const ok = (sql, flags) => { const r = psql(sql, flags); assert.equal(r.status, 0, `exit=${r.status} stdout=${r.stdout} stderr=${r.stderr}`); assert.equal(r.stderr, ''); return r.stdout.trim().split('\n').at(-1); };
    ok(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values ('${owner}','admin@example.com',now()),('${member}','member@example.com',now());`);
    for (const migration of paths.slice(0, 2)) call('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', migration]);
    const auth = (id, sql) => `set role authenticated; set request.jwt.claim.sub = '${id}'; ${sql}`;
    ok(auth(owner, `select public.calc3d_invite_user('member@example.com');`));
    const historical = payload('legacy', { ...input, purpose: 'sale' }, { ...expected('legacy', input), totalCost: 12345 });
    // An existing result remains unchanged even though a later new-save path must derive its own values.
    ok(`insert into public.calc3d_quotes (owner_id,number,client,title,spool_id,form,input,result)
      values ('${owner}','COT-000099',${literal(historical.client)},'Old','s1',${literal(historical.form)},${literal(historical.input)},${literal(historical.result)});`);
    const baseline = ok(`select result::text from public.calc3d_quotes where number='COT-000099'`);
    const originalValid = payload('legacy', input);
    const previousCall = psql(auth(owner, `select result::text from public.calc3d_save_quote(${literal(originalValid)});`));
    assert.equal(previousCall.status, 0); assert.equal(previousCall.stderr, '');
    const previousResult = JSON.parse(previousCall.stdout.trim().split('\n').at(-1));
    const firstForged = payload('legacy', input, { ...expected('legacy', input),
      breakdown: { ...expected('legacy', input).breakdown, material: expected('legacy', input).breakdown.material + 1000 },
      totalCost: expected('legacy', input).totalCost + 1000,
      basePrice: expected('legacy', input).basePrice + 1000,
      finalPrice: expected('legacy', input).finalPrice + 1000 });
    call('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', paths[2]]);
    assert.equal(ok(`select result::text from public.calc3d_quotes where number='COT-000099'`), baseline);
    const currentCall = psql(auth(owner, `select result::text from public.calc3d_save_quote(${literal(originalValid)});`));
    assert.equal(currentCall.status, previousCall.status);
    assert.equal(currentCall.stdout, previousCall.stdout);
    assert.equal(currentCall.stderr, previousCall.stderr);
    assert.deepEqual(previousResult, expected('legacy', input));
    assert.deepEqual(JSON.parse(ok(auth(owner, `select result::text from public.calc3d_save_quote(${literal(firstForged)});`))), expected('legacy', input),
      'public RPC must not store a forged yet internally consistent quote');
    const check = resolve('supabase/tests/quote-integrity.sql');
    call('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', check]);
    for (const mode of ['legacy', 'reference']) for (const purpose of ['sale', 'internal', 'gift']) {
      const source = { ...(mode === 'legacy' ? input : reference), purpose };
      if (purpose !== 'sale') { delete source.discount; delete source.surcharge; delete source.multiplier; }
      if (mode === 'legacy') { delete source.replacementCost; delete source.replacementLifetimeHours; delete source.errorPercent; }
      const correct = expected(mode, source);
      const forged = { ...correct, totalCost: Number((correct.totalCost + 1000).toFixed(2)),
        breakdown: { ...correct.breakdown, material: Number((correct.breakdown.material + 1000).toFixed(2)) } };
      const saved = JSON.parse(ok(auth(owner, `select result::text from public.calc3d_save_quote(${literal(payload(mode, source, forged))});`)));
      assert.deepEqual(saved, correct, `${mode}/${purpose} must ignore forged result`);
      assert.equal(ok(auth(owner, `select result::text from public.calc3d_quotes where number='COT-000099'`)), baseline);
    }
    // Existing method with omitted mode, accepted by original clients, remains unchanged.
    const valid = payload('legacy', input);
    assert.deepEqual(JSON.parse(ok(auth(member, `select result::text from public.calc3d_save_quote(${literal(valid)});`))), valid.result);
    assert.equal(ok(auth(owner, 'select next_number from public.calc3d_quote_counters')), '11');
    assert.equal(ok(auth(member, 'select next_number from public.calc3d_quote_counters')), '2');
  } finally {
    if (started) call('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
