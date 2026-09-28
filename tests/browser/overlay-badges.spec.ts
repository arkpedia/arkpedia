import { expect, test } from '@playwright/test';
import { openCensus, type CensusState } from './census-routes';
import { overlayText, setTheme } from './overlay-checks';

/* Text on an overlay reads in both themes (r11, 2026-09-28): the evaluator and why are in
 * overlay-checks.ts. The layout census runs it on every census address and driven state;
 * this adds the stage map with its legend open, and checks the census still finds the
 * /enemies badges it is for. */

/** The stage map with its legend open: the legend is a panel over the map (ta-1's
 *  lists counts beside its tiles and devices). */
const LEGEND: CensusState = {
  id: 'stage map legend open', route: '/stages/browse?s=ta-1',
  act: async (page) => {
    await page.getByRole('button', { name: /Legend/ }).click();
    await page.locator('.stage-legend-overlay.open').waitFor();
  },
};

test('text on overlays on the stage map with its legend open reads at 4.5:1 in both themes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'colour does not change with the width');
  await openCensus(page, LEGEND);
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    const found = await page.evaluate(overlayText);
    expect(found.offences, `the legend, ${theme} theme: text on an overlay under 4.5:1 (worst of the ground over black and over white)`).toEqual([]);
  }
});

test('the overlay census reads the badges it is for', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the /enemies grid of tiles is the desktop layout');
  // The /enemies tiles' codes are the case that started it: at least one badge is read
  // there in each theme, so an evaluator that stopped finding overlays fails here.
  await openCensus(page, '/enemies');
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    const found = await page.evaluate(overlayText);
    expect(found.checked, `/enemies, ${theme}: the tiles' handbook codes are read`).toBeGreaterThan(10);
  }
});
