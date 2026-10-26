import os from 'node:os';
import { defineConfig, devices } from '@playwright/test';

/* r11: the checks that need every census page at both widths, which run in two projects. */
const AFTER_CENSUS = /layout-census-after\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  /* Browsers in parallel (r11): one per two CPUs, at least two and at most three, and one
     per 2 GB of memory. Measured in a Linux container, the whole suite took 843s on one
     worker and 530s on two with 2 CPUs, and 414s on two with 4; it passed at four workers
     on 4 CPUs too. So two on a 2- or 4-vCPU runner (GitHub's hosted one, where Dependabot's
     pull requests run under a 20-minute limit), three on the NAS, and one on a machine with
     under 4 GB (the VPS), as before. Each spec file keeps its tests in one worker, in order;
     the layout census, a third of the suite, spreads its pages over all of them
     (layout-census.spec.ts). PW_WORKERS=1 runs the suite serially. */
  workers: Number(process.env.PW_WORKERS) || Math.max(1, Math.min(3, Math.max(2, Math.floor(os.availableParallelism() / 2)), Math.floor(os.totalmem() / 2 ** 31))),
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3192', trace: 'off', screenshot: process.env.CI ? 'only-on-failure' : 'off', video: 'off' },
  projects: [
    { name: 'desktop', testIgnore: AFTER_CENSUS, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', testIgnore: AFTER_CENSUS, use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
    // After both (so it runs with the whole suite; `layout-census.spec` alone leaves it out):
    // the stale stack-align check reads what every census page load wrote.
    { name: 'after-census', testMatch: AFTER_CENSUS, dependencies: ['desktop', 'mobile'] },
  ],
  webServer: {
    command: 'npm run start -- -p 3192',
    // The same checked-in feed check.yml's Build step prerenders the community pages from
    // (lib/music/youtubeFeedsServer.ts), for their regenerations during a run: build with it
    // too, or /community shows whatever the live feeds had.
    env: { ARKPEDIA_CONTENT_DISABLED: '1', ARKPEDIA_YOUTUBE_FEED_FIXTURE: 'tests/fixtures/youtube-feeds.xml' },
    url: 'http://127.0.0.1:3192',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
