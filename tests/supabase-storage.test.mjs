import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { calculateReferenceQuote } from '../src/domain/reference-costs.mjs';

const migration = resolve('supabase/migrations/202610210001_calc3d_storage.sql');
const checks = resolve('supabase/tests/storage.sql');
const user = '11111111-1111-4111-8111-111111111111';
const referenceInput = { purpose: 'sale', spool: { purchasePrice: 22000, netWeightGrams: 1000 }, grams: 294,
  hours: 11, minutes: 0, watts: 130, electricityPricePerKwh: 230,
  replacementCost: 220000, replacementLifetimeHours: 4320, errorPercent: 5, multiplier: 2 };
const quote = JSON.stringify({ title: 'Pieza', spoolId: 's1', client: { name: '', phone: '', email: '' },
  form: { purpose: 'sale' }, input: { purpose: 'sale' }, result: {
    breakdown: { material: 0, electricity: 0, depreciation: 0, maintenance: 0, labor: 0, extras: 0 },
    totalCost: 0, internalCost: 0, basePrice: 0, discountAmount: 0, surchargeAmount: 0,
    finalPrice: 0, commercialProfit: 0,
  } });

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${program} ${args.join(' ')}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function psql(port, args, options = {}) {
  return command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', ...args], options);
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

function concurrent(port) {
  return new Promise((accept, reject) => {
    const clients = Array.from({ length: 2 }, () => {
      const child = spawn('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
        '-c', `set role authenticated; set request.jwt.claim.sub = '${user}'; select number from public.calc3d_save_quote('${quote}'::jsonb);`],
      { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      return new Promise((done, fail) => {
        child.on('error', fail);
        child.on('close', (code) => code === 0 ? done(stdout) : fail(Error(`parallel psql exited ${code}: ${stderr}`)));
      });
    });
    Promise.all(clients).then(accept, reject);
  });
}

test('isolated PostgreSQL foundation: RLS, atomic RPCs, and concurrent COT numbering', async () => {
  const root = mkdtempSync(join(tmpdir(), 'calc3d-pg-'));
  const data = join(root, 'data');
  const socket = join(root, 'socket');
  let started = false;
  try {
    command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-instructions']);
    const port = await freePort();
    command('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories=${root} -p ${port}`, '-w', 'start']);
    started = true;
    psql(port, ['-c', `create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values ('${user}'), ('22222222-2222-4222-8222-222222222222');`]);
    psql(port, ['-f', migration]);
    psql(port, ['-f', checks]);
    const outputs = await concurrent(port);
    assert.deepEqual(outputs.flatMap((output) => output.match(/COT-\d{6}/g) ?? []).sort(), ['COT-000003', 'COT-000004']);
    // Pass actual domain output through the public RPC, not a hand-maintained financial fixture.
    for (const purpose of ['sale', 'internal', 'gift']) {
      const input = { ...referenceInput, purpose };
      const result = calculateReferenceQuote(input);
      const payload = { title: 'Referencia', spoolId: 's1', client: { name: '', phone: '', email: '' },
        form: { purpose, calculationMode: 'reference' }, input, result };
      const sql = `set role authenticated; set request.jwt.claim.sub = '${user}'; select result::text from public.calc3d_save_quote('${JSON.stringify(payload)}'::jsonb);`;
      const actual = psql(port, ['-A', '-t', '-c', sql]).trim().split('\n').at(-1);
      assert.deepEqual(JSON.parse(actual), result, `reference ${purpose} result changed`);
    }
    // Privileged fixture changes only the isolated counter; exercise the boundary as authenticated.
    psql(port, ['-c', `update public.calc3d_quote_counters set next_number = 1000000 where owner_id = '${user}';`]);
    const boundary = psql(port, ['-A', '-t', '-c', `set role authenticated; set request.jwt.claim.sub = '${user}'; select number from public.calc3d_save_quote('${quote}'::jsonb);`]);
    assert.equal(boundary.trim().split('\n').at(-1), 'COT-1000000');
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
