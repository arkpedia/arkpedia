import { defineConfig, devices } from '@playwright/test';
import config from './playwright.config';

// Real WebKit with an iPhone browser profile; physical iPhone listening is separate.
export default defineConfig({
  ...config,
  projects: [{
    name: 'iphone-webkit',
    testMatch: /music-(spectrum|versions|unified-player|queue-popup|volume-controls|now-playing-layout)\.spec\.ts$/,
    use: { ...devices['iPhone 13'], browserName: 'webkit' },
  }],
  workers: 1,
});
