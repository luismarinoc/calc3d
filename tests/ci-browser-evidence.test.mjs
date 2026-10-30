import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const [header, nodeJob, browserJob, releaseJob] = workflow.split(/^  (?=node-tests:|browser-tests:|release:)/m);

// Anchor each assertion to a job rather than accepting a matching step in another job.
test('failed Browser tests retain only Playwright traces and error context without masking failure', () => {
  assert.ok(browserJob?.startsWith('browser-tests:\n'));
  const run = '      - run: npm run test:e2e\n        env:\n          PLAYWRIGHT_BROWSERS_PATH: .cache/ms-playwright\n';
  const capture = `      - name: Retain failed browser diagnostics
        if: \${{ failure() }}
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: browser-failure-\${{ github.run_id }}-\${{ github.run_attempt }}
          path: |
            test-results/**/trace.zip
            test-results/**/error-context.md
          if-no-files-found: warn
          retention-days: 7
`;
  assert.ok(browserJob.includes(run + capture), 'capture must immediately follow the unchanged E2E step');
  assert.equal((workflow.match(/actions\/upload-artifact@/g) ?? []).length, 1);
  assert.doesNotMatch(browserJob, /continue-on-error:|always\(\)|success\(\)|\b(?:retry|retries):/);
});

test('existing checks, triggers, read-only defaults and gated release remain intact', () => {
  assert.equal(header, `name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
`);
  assert.match(nodeJob, /^node-tests:\n    name: Node tests\n    runs-on: ubuntu-latest\n    steps:/);
  assert.match(nodeJob, /      - run: npm ci\n[\s\S]*      - run: npm test\n$/);
  assert.match(browserJob, /^browser-tests:\n    name: Browser tests\n    runs-on: ubuntu-latest\n    steps:/);
  assert.match(browserJob, /      - run: npm ci\n      - run: PLAYWRIGHT_BROWSERS_PATH=\.cache\/ms-playwright npx playwright install --with-deps chromium webkit\n      - run: npm run test:e2e\n/);
  assert.match(releaseJob, /^release:\n    name: Version release\n    if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && !github\.event\.created\n    needs: \[node-tests, browser-tests\]\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n      pull-requests: read\n/);
  for (const job of [nodeJob, browserJob, releaseJob]) {
    assert.match(job, /uses: actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6\n        with:\n          persist-credentials: false/);
    assert.match(job, /uses: actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/);
  }
  assert.match(nodeJob, /node-version: '24'/);
  assert.match(browserJob, /node-version: '24'/);
  assert.doesNotMatch(nodeJob + browserJob, /permissions:|continue-on-error:/);
});
