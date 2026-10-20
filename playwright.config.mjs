import { defineConfig, devices } from '@playwright/test';

// Browsers were installed locally for this prototype, not into a global cache.
process.env.PLAYWRIGHT_BROWSERS_PATH = '.cache/ms-playwright';

const tablet = devices['iPad (gen 7)'];
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.pw.mjs',
  retries: 0,
  workers: 2,
  timeout: 30000,
  reporter: [['line']],
  outputDir: 'test-results',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit-phone', use: { ...devices['iPhone 13'] } },
    { name: 'webkit-ipad-portrait', use: { ...tablet } },
    { name: 'webkit-ipad-landscape', use: { ...tablet, viewport: { width: tablet.viewport.height, height: tablet.viewport.width } } },
  ],
  webServer: {
    command: 'python3 -m http.server 5173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
