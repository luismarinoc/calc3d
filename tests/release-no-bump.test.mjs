import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runRelease } from '../scripts/release.mjs';

const sha = 'a'.repeat(40);
const before = 'b'.repeat(40);
const repo = 'luismarinoc/calc3d';
const event = { ref: 'refs/heads/main', created: false, before, after: sha, repository: { full_name: repo } };
const path = `repos/${repo}/contents/package.json?ref=${before}`;
const body = { encoding: 'base64', content: Buffer.from('{"version":"1.0.0"}').toString('base64') };
const message = 'Version unchanged (1.0.0); no release';

for (const dryRun of [false, true]) {
  test(`unchanged stable version is a successful read-only ${dryRun ? 'dry-run' : 'ordinary push'} skip`, async () => {
    const input = structuredClone(event);
    const calls = [];
    const gh = async args => { calls.push(args); return { status: 200, body }; };
    assert.equal(await runRelease({ event: input, sha, version: '1.0.0', dryRun, gh }), message);
    assert.deepEqual(calls, [['api', path]]);
    assert.deepEqual(input, event);
  });
}

test('public dependency-injected command prints exact no-bump result and exits successfully without credentials', () => {
  // The exported runner is the public DI entrypoint; no gh executable or remote API is used.
  const script = `import { runRelease } from './scripts/release.mjs';
const event = ${JSON.stringify(event)};
const gh = async args => {
  if (JSON.stringify(args) !== ${JSON.stringify(JSON.stringify(['api', path]))}) throw Error('unexpected remote call');
  return { status: 200, body: ${JSON.stringify(body)} };
};
console.log(await runRelease({ event, sha: ${JSON.stringify(sha)}, version: '1.0.0', gh }));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '' },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, message + '\n');
  assert.equal(result.stderr, '');
});
