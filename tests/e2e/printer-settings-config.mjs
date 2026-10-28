import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = '.cache/ms-playwright';
const tablet = devices['iPad (gen 7)'];
export default defineConfig({
  testDir: `${root}/tests/e2e`, testMatch: ['printer-settings.pw.mjs', 'compact-calculator.pw.mjs', 'shared-rows.pw.mjs', 'field-pair-alignment.pw.mjs'], retries: 0, workers: 1,
  timeout: 60000, reporter: [['line']], outputDir: `${root}/test-results/printer-settings`,
  use: { baseURL: 'http://127.0.0.1:5220', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit-phone', use: { ...devices['iPhone 13'] } },
    { name: 'webkit-ipad-portrait', use: { ...tablet } },
    { name: 'webkit-ipad-landscape', use: { ...tablet, viewport: { width: tablet.viewport.height, height: tablet.viewport.width } } },
  ],
  webServer: { command: 'python3 -m http.server 5220 --bind 127.0.0.1', cwd: root, url: 'http://127.0.0.1:5220/', reuseExistingServer: false, timeout: 10000 },
});
