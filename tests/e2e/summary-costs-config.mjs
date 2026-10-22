import { defineConfig } from '@playwright/test';
import root from '../../playwright.config.mjs';

export default defineConfig({
  ...root,
  testDir: './',
  workers: 1,
  outputDir: new URL('../../test-results/summary-costs', import.meta.url).pathname,
  use: { ...root.use, baseURL: 'http://127.0.0.1:5224' },
  webServer: {
    ...root.webServer,
    command: 'python3 -m http.server 5224 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5224/',
    cwd: new URL('../../', import.meta.url).pathname,
  },
});
