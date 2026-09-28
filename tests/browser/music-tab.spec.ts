import { expect, test } from '@playwright/test';
import { openCensus, type CensusState } from './census-routes';
import { musicTabCheck } from './music-tab-checks';

/* The collapsed mini player never covers the page on a phone (r11, 2026-09-28): the check
 * and why are in music-tab-checks.ts. The layout census runs it on every census address and
 * driven state on the phone project; this adds /pulls with a banner goal, the goal list
 * the maintainer named. */

/** The goal list the maintainer named: /pulls with a banner planned (row-alignment.spec.ts
 *  plans one the same way, by address). */
const PULLS_GOAL: CensusState = {
  id: 'pulls with a banner goal', route: '/pulls',
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

test('the collapsed music tab on /pulls with a banner goal meets no text or control', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the tab is the phone layout (900px and under); over it the tile is unchanged');
  await openCensus(page, PULLS_GOAL);
  await musicTabCheck(page, '/pulls (pulls with a banner goal)', '/pulls');
});
