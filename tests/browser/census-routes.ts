import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

/*
 * The addresses and driven states the 2026-09-26 UI census visited, for the browser
 * checks that hold every page to a rule rather than a sample (row-alignment.spec.ts,
 * the button-voice check in cards-and-headings.spec.ts). The addresses come from the
 * page files, as in page-bounds.spec.ts, so a new page is measured without being
 * listed; a dynamic page needs a sample address in SAMPLES.
 */

/** One real address for each dynamic page (page-bounds.spec.ts measures the same). */
const SAMPLES: Record<string, string> = {
  'operators/[name]': '/operators/Amiya',
  'events/[slug]': '/events/Duel%20Channel%3A%20Ivy%20Vine',
  'stages/content/[id]': '/stages/content/act49side',
};
/** Page files not measured, and why. */
const EXCLUDED: Record<string, string> = {
  '_app': 'the app shell', '_document': 'the document shell', '500': 'only rendered when a page throws',
  'home': 'redirects to /', 'events/index': 'redirects to /schedule', 'music/[albumId]': 'redirects to /music',
  'dev/index': 'development only', 'dev/ui': 'development only', 'optimizer': 'development only',
  'bases/whole-base-optimizer': 'development only',
  'recruitment/popout': 'the same RecruitmentTool as /recruitment, without the site chrome',
};
/** Addresses beyond one per page file: a stage open in the browser, a second event. */
const EXTRA = ['/stages/browse?s=ta-1', '/events/%5BSide%20Story%5D%20People%2C%20A%20People'];

/** Every address the census visited: one per page file, the 404 page at an address
 *  that does not exist, and EXTRA. */
export function censusRoutes(): string[] {
  const dir = path.join(__dirname, '../../pages');
  const files = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => file.replace(/\.tsx$/, '').split(path.sep).join('/'));
  const out: string[] = [];
  for (const file of files.sort()) {
    if (EXCLUDED[file]) continue;
    if (file === '404') { out.push('/this-page-does-not-exist'); continue; }
    if (file.includes('[')) { if (SAMPLES[file]) out.push(SAMPLES[file]); continue; }
    out.push(('/' + file.replace(/(^|\/)index$/, '')).replace(/(.)\/$/, '$1'));
  }
  return [...out, ...EXTRA];
}

/** An interaction that puts new controls on screen: a dialog, a tab, a disclosure. */
export interface CensusState { id: string; route: string; act: (page: Page) => Promise<void> }

const clickIn = (page: Page, scope: string, name: string) => page.locator(scope).getByRole('button', { name, exact: true }).first().click();
/** A tab (components/ui/Tabs renders role="tab"): a view switch, a section, a panel. */
const tabIn = (page: Page, scope: string, name: string) => page.locator(scope).getByRole('tab', { name, exact: true }).first().click();

export const CENSUS_STATES: CensusState[] = [
  { id: 'planner with Amiya (the level dialog)', route: '/planner', act: async (page) => { await page.locator('#planner-search').fill('Amiya'); await page.locator('#planner-search').press('Enter'); await page.locator('.simple-wizard').waitFor(); } },
  { id: 'event rewards tab', route: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', act: (page) => tabIn(page, '.event-detail-tabs', 'Rewards') },
  { id: 'gacha details', route: '/gacha', act: async (page) => { await page.getByRole('button', { name: 'Details', exact: true }).first().click(); await page.locator('.gacha-details-modal').waitFor(); } },
  { id: 'gacha operator preview', route: '/gacha', act: async (page) => {
    await page.getByRole('button', { name: 'Details', exact: true }).first().click();
    await page.locator('.gacha-details-modal button.gacha-details-featured, .gacha-details-modal .gacha-details-name-list button').first().click();
    await page.locator('.gacha-pull-preview-header').waitFor();
  } },
  { id: 'schedule calendar', route: '/schedule', act: (page) => tabIn(page, '.page-header-actions', 'Calendar') },
  { id: 'recruitment with two tags', route: '/recruitment', act: async (page) => { const tags = page.locator('.recruit-tag-picker .filter-chip'); await tags.nth(1).click(); await tags.nth(6).click(); } },
  { id: 'stronghold alliances', route: '/gamemodes/stronghold-protocol', act: (page) => tabIn(page, '.gm-lookup', 'Alliances') },
  { id: 'stronghold items', route: '/gamemodes/stronghold-protocol', act: (page) => tabIn(page, '.gm-lookup', 'Items') },
  { id: 'stronghold enemies', route: '/gamemodes/stronghold-protocol', act: (page) => tabIn(page, '.gm-lookup', 'Enemies') },
  { id: 'stage guesser custom list', route: '/games/stage-guesser', act: (page) => clickIn(page, 'main', 'Custom') },
  { id: 'pulls disclosures open', route: '/pulls', act: async (page) => { for (const name of [/^Income & events/i, /^Past events/i]) await page.getByRole('button', { name }).first().click(); } },
  { id: 'enemies stages tab', route: '/enemies', act: (page) => tabIn(page, '.enemy-tabs', 'Stages') },
];

/** Only reads go to other hosts: a YouTube embed's POSTs are dropped. */
export async function readOnly(page: Page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort()));
}

/** Opens an address, or opens a state's page and drives it, then waits for the page to
 *  settle (network quiet, fonts in). */
export async function openCensus(page: Page, target: string | CensusState) {
  await readOnly(page);
  await page.goto(typeof target === 'string' ? target : target.route);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  if (typeof target !== 'string') {
    await target.act(page);
    await page.waitForTimeout(600);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  }
  await page.evaluate(() => document.fonts.ready);
}
