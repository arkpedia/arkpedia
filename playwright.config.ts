import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3192', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run start -- -p 3192',
    env: { ARKPEDIA_CONTENT_DISABLED: '1' },
    url: 'http://127.0.0.1:3192',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
