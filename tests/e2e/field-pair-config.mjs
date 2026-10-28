import { defineConfig } from '@playwright/test';
import root from '../../playwright.config.mjs';

export default defineConfig({
  ...root,
  testDir: './',
  workers: 1,
  outputDir: new URL('../../test-results/field-pair', import.meta.url).pathname,
  use: { ...root.use, baseURL: 'http://127.0.0.1:5217' },
  webServer: {
    ...root.webServer,
    command: 'python3 -m http.server 5217 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5217/',
    cwd: new URL('../../', import.meta.url).pathname,
  },
});
