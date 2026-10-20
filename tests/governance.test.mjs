import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

test('version manifest and lock remain consistent and private', () => {
  assert.equal(manifest.version, '0.1.0');
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
  assert.equal(manifest.private, true);
  assert.equal(manifest.scripts.test, 'node --test tests/*.test.mjs');
});

test('CI jobs have stable checks and release alone receives write permission', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n    branches: \[main\]/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /name: Node tests/);
  assert.match(workflow, /name: Browser tests/);
  assert.match(workflow, /needs: \[node-tests, browser-tests\]/);
  assert.match(workflow, /    permissions:\n      contents: write\n      pull-requests: read/);
  assert.doesNotMatch(workflow, /pull_request_target:|npm publish|persist-credentials: true/);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 3);
  assert.match(workflow, /PLAYWRIGHT_BROWSERS_PATH=\.cache\/ms-playwright npx playwright install --with-deps chromium webkit/);
});
