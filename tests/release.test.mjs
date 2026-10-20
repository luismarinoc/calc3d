import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runRelease } from '../scripts/release.mjs';

const sha = 'a'.repeat(40);
const before = 'b'.repeat(40);
const repo = 'luismarinoc/calc3d';
const event = { ref: 'refs/heads/main', created: false, before, after: sha, repository: { full_name: repo } };
const pr = { title: 'chore(release): v0.1.1', merged_at: '2026-01-01T00:00:00Z', merge_commit_sha: sha,
  base: { ref: 'main', repo: { full_name: repo } }, head: { repo: { full_name: repo } } };
function fixture({ previous = '0.1.0', current = '0.1.1', prs = [pr], release = null, tag = null, failures = {} } = {}) {
  const writes = [];
  const calls = [];
  const gh = async (args) => {
    calls.push(args);
    const path = args[1];
    if (args[0] === 'release') { writes.push(args); return { status: 0, stdout: '' }; }
    if (args[0] !== 'api') throw Error('Unexpected command');
    if (path in failures) throw Error(failures[path]);
    if (path.includes('/contents/package.json')) return { status: 200, body: { content: Buffer.from(JSON.stringify({ version: previous })).toString('base64'), encoding: 'base64' } };
    if (path.includes('/commits/') && path.includes('/pulls?')) return { status: 200, body: prs };
    if (path.includes('/releases/tags/')) return { status: release ? 200 : 404, body: release };
    if (path.includes('/git/ref/tags/')) return { status: tag ? 200 : 404, body: tag };
    if (path.includes('/git/tags/')) return { status: 200, body: { object: { type: 'commit', sha } } };
    throw Error(`Unexpected API path ${path}`);
  };
  return { gh, writes, calls, current };
}
const run = (f, changes = {}) => runRelease({ event, sha, version: f.current, gh: f.gh, ...changes });

 test('merged version PR releases immutable reviewed SHA exactly once', async () => {
  const f = fixture();
  assert.equal(await run(f), 'Created release v0.1.1 at ' + sha);
  assert.deepEqual(f.writes, [['release', 'create', 'v0.1.1', '--repo', repo, '--target', sha, '--title', 'v0.1.1', '--generate-notes']]);
});

test('ordinary version-bump PR, unmerged, wrong base/repo/SHA and bootstrap reject without remote writes', async () => {
  for (const changes of [
    { prs: [{ ...pr, title: 'fix: ordinary' }] }, { prs: [{ ...pr, merged_at: null }] },
    { prs: [{ ...pr, base: { ...pr.base, ref: 'dev' } }] },
    { prs: [{ ...pr, head: { repo: { full_name: 'other/fork' } } }] },
    { prs: [{ ...pr, merge_commit_sha: before }] },
    { prs: [pr, pr] }, { prs: [] },
  ]) {
    const f = fixture(changes);
    await assert.rejects(run(f), /Not an eligible merged version PR|Version must increase/);
    assert.equal(f.writes.length, 0);
  }
  for (const changed of [{ event: { ...event, before: '0'.repeat(40), created: true } }, { event: { ...event, ref: 'refs/heads/dev' } }, { sha: before }, { event: { ...event, repository: { full_name: 'other/repo' } } }]) {
    const f = fixture();
    await assert.rejects(run(f, changed), /Invalid main push|Bootstrap/);
    assert.equal(f.calls.length, 0);
  }
});

test('invalid, prerelease and decreasing semver reject with no writes', async () => {
  for (const current of ['1.0.0-beta.1', '01.2.3', '0.0.9', 'nope']) {
    const f = fixture({ current });
    await assert.rejects(run(f), /stable semver|Version must increase/);
    assert.equal(f.writes.length, 0);
  }
});

test('dry-run proves eligibility but never publishes', async () => {
  const f = fixture();
  assert.equal(await run(f, { dryRun: true }), 'Would create release v0.1.1 at ' + sha);
  assert.equal(f.writes.length, 0);
});

test('matching existing release and tag are no-ops, conflicts reject', async () => {
  const matchingTag = { object: { type: 'commit', sha } };
  for (const tag of [matchingTag, { object: { type: 'tag', sha: before } }]) {
    const f = fixture({ tag, release: { tag_name: 'v0.1.1', target_commitish: sha } });
    assert.match(await run(f), /already exists/);
    assert.equal(f.writes.length, 0);
  }
  for (const change of [{ tag: { object: { type: 'commit', sha: before } } },
    { release: { tag_name: 'v0.1.1', target_commitish: before }, tag: matchingTag },
    { release: { tag_name: 'v0.1.1', target_commitish: sha } }]) {
    const f = fixture(change);
    await assert.rejects(run(f), /conflict|missing tag/i);
    assert.equal(f.writes.length, 0);
  }
});

test('API permission and network failures propagate; no write', async () => {
  for (const message of ['HTTP 403: Forbidden', 'network unavailable']) {
    const path = `repos/${repo}/releases/tags/v0.1.1`;
    const f = fixture({ failures: { [path]: message } });
    await assert.rejects(run(f), new RegExp(message));
    assert.equal(f.writes.length, 0);
  }
});

test('CLI help and invalid options have exact exit/stdout/stderr without publishing', () => {
  const help = spawnSync(process.execPath, ['scripts/release.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.equal(help.stdout, 'Usage: node scripts/release.mjs [--dry-run | --help]\n');
  assert.equal(help.stderr, '');
  const bad = spawnSync(process.execPath, ['scripts/release.mjs', '--unknown'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  assert.equal(bad.stderr, 'Unknown option: --unknown\n');
});
