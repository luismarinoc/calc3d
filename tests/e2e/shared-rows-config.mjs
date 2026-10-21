import { defineConfig } from '@playwright/test';
import root from '../../playwright.config.mjs';

export default defineConfig({
  ...root,
  testDir: new URL('./', import.meta.url).pathname,
  workers: 1,
  outputDir: new URL('../../test-results/shared-rows', import.meta.url).pathname,
  use: { ...root.use, baseURL: 'http://127.0.0.1:5219' },
  webServer: {
    ...root.webServer,
    command: 'python3 -m http.server 5219 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5219/',
    cwd: new URL('../../', import.meta.url).pathname,
  },
});
