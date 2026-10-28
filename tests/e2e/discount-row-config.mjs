import rootConfig from '../../playwright.config.mjs';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...rootConfig,
  testDir: new URL('.', import.meta.url).pathname,
  testMatch: ['adjustment-alignment.pw.mjs', 'shared-rows.pw.mjs', 'field-pair-alignment.pw.mjs'],
  workers: 1,
  outputDir: new URL('../../test-results/discount-row/', import.meta.url).pathname,
  use: { ...rootConfig.use, baseURL: 'http://127.0.0.1:5225' },
  webServer: {
    ...rootConfig.webServer,
    command: 'python3 -m http.server 5225 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5225/',
    cwd: new URL('../../', import.meta.url).pathname,
  },
});
