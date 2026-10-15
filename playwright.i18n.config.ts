import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/localization',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:18347',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run build && node scripts/serve-localization-test.cjs',
    url: 'http://127.0.0.1:18347/api/config',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
