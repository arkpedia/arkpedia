import { expect, test } from '@playwright/test';
import { openCensus, type CensusState } from './census-routes';
import { musicTabCheck } from './music-tab-checks';

/* The floating tile shares the desktop shape on phones and steps aside for dialogs. */

/** The goal list the maintainer named: /pulls with a banner planned (row-alignment.spec.ts
 *  plans one the same way, by address). */
const PULLS_GOAL: CensusState = {
  id: 'pulls with a banner goal', route: "/pull-planner",
  act: async (page) => {
    const name = await page.evaluate(() => {
      const odds = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { bannerOdds: Record<string, { type: string }> } } } }).__NEXT_DATA__.props.pageProps.bannerOdds;
      const names = Object.keys(odds);
      return names.find((n) => odds[n].type === 'limited') ?? names[0] ?? null;
    });
    expect(name, 'the schedule has a banner with odds').toBeTruthy();
    await page.goto(`/pulls?banner=${encodeURIComponent(name!)}`);
    await page.locator('article [class*="bannerRow"]').first().waitFor();
  },
};

test('the floating music tile on /pulls has the shared shape and page-end clearance', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone census widths');
  await openCensus(page, PULLS_GOAL);
  await musicTabCheck(page, '/pulls (pulls with a banner goal)', "/pull-planner");
});
