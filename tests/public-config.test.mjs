import test from 'node:test';
import assert from 'node:assert/strict';
import { publicConfig, validatePublicConfig } from '../src/auth/config.mjs';
import viteConfig from '../vite.config.mjs';
import { build, createServer } from 'vite';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const jwt = role => [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({ role, marker: '~~~' })).toString('base64url'),
  Buffer.from('fake-signature').toString('base64url'),
].join('.');
const url = 'https://example.supabase.co';

test('only exact public values are selected, and only anon JWT or publishable keys are accepted', () => {
  const input = { SUPABASE_URL: url, SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_URL_SECRET: 'not-public', PRIVATE_VALUE: 'not-public' };
  assert.deepEqual(publicConfig(input), { SUPABASE_URL: url, SUPABASE_ANON_KEY: jwt('anon') });
  assert.deepEqual(validatePublicConfig(input), { url, key: jwt('anon') });
  assert.deepEqual(validatePublicConfig({ ...input, SUPABASE_ANON_KEY: 'sb_publishable_fake_test' }), { url, key: 'sb_publishable_fake_test' });
  for (const key of [jwt('authenticated'), jwt('service_role'), jwt('admin'),
    ` ${jwt('anon')}`, ` ${jwt('service_role')}`, 'sb_secret_abc', 'service_role',
    'anon-public', 'a.b.c', `${jwt('anon')}.extra`, 'sb_publishable_', 'sb_publishable_bad key']) {
    assert.throws(() => validatePublicConfig({ ...input, SUPABASE_ANON_KEY: key }), error =>
      error.message === 'Se requiere una clave pública anon, no una clave privada.' && !error.message.includes(key));
  }
  assert.throws(() => validatePublicConfig({ ...input, SUPABASE_URL: 'javascript:evil' }), /configuración/i);
});

test('real Vite config does not expose environment variables that merely share a public prefix', () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_URL_SECRET', 'SUPABASE_ANON_KEY_EXTRA'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'sb_publishable_fake_test',
      SUPABASE_URL_SECRET: 'suffix-secret-sentinel', SUPABASE_ANON_KEY_EXTRA: 'suffix-key-sentinel' });
    const config = viteConfig({ mode: 'test', command: 'build' });
    assert.deepEqual(config.envPrefix, []);
    assert.deepEqual(Object.keys(config.define).sort(), ['import.meta.env.SUPABASE_ANON_KEY', 'import.meta.env.SUPABASE_URL']);
    assert.equal(config.define['import.meta.env.SUPABASE_URL'], JSON.stringify(url));
    assert.equal(config.define['import.meta.env.SUPABASE_ANON_KEY'], JSON.stringify('sb_publishable_fake_test'));
    assert.ok(config.server.fs.deny.includes('.env.*'));
    assert.ok(config.server.fs.deny.includes('**/.pi/**'));
    assert.ok(config.server.fs.deny.includes('**/.engram*/**'));
    assert.ok(config.server.fs.deny.includes('**/.cache/**'));
    assert.ok(config.server.fs.deny.includes('**/.git/**'));
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('actual Vite server denies fake private paths under its isolated root', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'calc3d-private-paths-'));
  const paths = ['/.env.local', '/.pi/canary.txt', '/.git/canary.txt', '/.cache/canary.txt',
    '/.engram-test/canary.txt', '/nested/.pi/canary.txt'];
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let server;
  try {
    for (const path of [...paths, '/public-canary.txt']) {
      const target = join(directory, path.slice(1));
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, 'NON_SECRET_CANARY');
    }
    Object.assign(process.env, { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'sb_publishable_fake_test' });
    const config = viteConfig({ mode: 'test', command: 'serve' });
    server = await createServer({ ...config, configFile: false, publicDir: false, root: directory,
      logLevel: 'silent', server: { ...config.server, port: 0, strictPort: false } });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const statuses = Object.fromEntries(await Promise.all(paths.map(async path =>
      [path, (await fetch(`${origin}${path}`, { method: 'HEAD' })).status])));
    t.diagnostic(JSON.stringify(statuses));
    for (const path of paths) assert.ok([403, 404].includes(statuses[path]), `${path} returned ${statuses[path]}`);
    assert.equal((await fetch(`${origin}/public-canary.txt`, { method: 'HEAD' })).status, 200);
  } finally {
    if (server) await server.close();
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('production JS assets contain only exact public configuration, not suffix sentinels', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calc3d-public-config-'));
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_URL_SECRET', 'SUPABASE_ANON_KEY_EXTRA'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'sb_publishable_fake_test',
      SUPABASE_URL_SECRET: 'suffix-secret-sentinel', SUPABASE_ANON_KEY_EXTRA: 'suffix-key-sentinel' });
    await build({ ...viteConfig({ mode: 'test', command: 'build' }), configFile: false, logLevel: 'silent', build: {
      ...viteConfig({ mode: 'test', command: 'build' }).build, outDir: directory, emptyOutDir: true,
    } });
    const assets = await readdir(join(directory, 'assets'));
    const js = (await Promise.all(assets.filter(name => name.endsWith('.js')).map(name => readFile(join(directory, 'assets', name), 'utf8')))).join('\n');
    assert.ok(js.includes('sb_publishable_fake_test'));
    assert.ok(!js.includes('suffix-secret-sentinel'));
    assert.ok(!js.includes('suffix-key-sentinel'));
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
