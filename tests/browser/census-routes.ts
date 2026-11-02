import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

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
  'sitemap.xml': 'an XML document for crawlers, not a page (pages/sitemap.xml.tsx)',
};
/** Addresses beyond one per page file: a stage open in the browser, a second event. */
const EXTRA = ['/stages/browse?s=ta-1', '/events/%5BSide%20Story%5D%20People%2C%20A%20People'];

/** The simulator's Details button, on a banner that has one. The page opens on the current
 *  banner, and a choose-first banner (Kernel Locating #13 was current once Sealed With Time
 *  closed, 2026-10-28) shows its operator choice in place of the art and its Details: these
 *  states then go on to the first banner that has the button. */
export async function bannerWithDetails(page: Page) {
  const details = page.getByRole('button', { name: 'Details', exact: true }).first();
  const present = async () => { await details.waitFor({ timeout: 3000 }).catch(() => undefined); return (await details.count()) > 0; };
  if (await present()) return details;
  const names = await page.evaluate(() => (window as unknown as { __NEXT_DATA__: { props: { pageProps: { banners: { name: string }[] } } } }).__NEXT_DATA__.props.pageProps.banners.map((b) => b.name));
  for (const name of names) {
    await page.goto(`/gacha-simulator?banner=${encodeURIComponent(name)}`);
    if (await present()) return details;
  }
  throw new Error('no banner on the simulator has a Details button');
}

/** The simulator on a banner that pulls at once. It opens on the current banner, which can be a
 *  choose-first one with no pull button until its operators are chosen: the pulling tests go on
 *  to the first banner whose ten-pull is enabled. */
export async function openPullableSimulator(page: Page) {
  await page.goto('/gacha-simulator');
  const ten = page.getByRole('button', { name: 'Pull ten operators' });
  const pulls = async () => { await ten.waitFor({ timeout: 3000 }).catch(() => undefined); return (await ten.count()) > 0 && ten.isEnabled(); };
  if (await pulls()) return;
  const names = await page.evaluate(() => (window as unknown as { __NEXT_DATA__: { props: { pageProps: { banners: { name: string }[] } } } }).__NEXT_DATA__.props.pageProps.banners.map((b) => b.name));
  for (const name of names) {
    await page.goto(`/gacha-simulator?banner=${encodeURIComponent(name)}`);
    if (await pulls()) return;
  }
  throw new Error('no banner on the simulator pulls at once');
}

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

/** A game import's record (lib/account/accountStore) put in this browser, then the page as it
 *  loads with it. A made-up record, never a real account's. */
export async function seedAccountRecord(page: Page, record: object) {
  await page.evaluate((value) => localStorage.setItem('arkpediaAccount', value), JSON.stringify(record));
  await page.reload();
}

/** A game import's record (lib/account/accountStore), then the page as it loads with one. */
async function seedAccount(page: Page) {
  await seedAccountRecord(page, { version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null,
    operators: ['Surtr', 'Eyjafjalla', 'Amiya'], skins: ['char_002_amiya@winter#1'], cleared: [],
    profile: { level: 120, registeredAt: '2020-02-03T03:42:40.000Z', secretary: 'Nian', bio: 'yes',
      // The support tiles: one in an outfit's portrait, one from before outfits were kept (its icon).
      supports: [{ name: 'Surtr', rarity: 6, level: 90, elite: 2, potential: 1, skill: 3, skin: 'char_350_surtr@summer#9' },
        { name: 'Eyjafjalla', rarity: 6, level: 90, elite: 2, potential: 6, skill: 3 }] } });
}

/** An interaction that puts new controls on screen: a dialog, a tab, a disclosure. */
export interface CensusState { id: string; route: string; act: (page: Page) => Promise<void> }

const clickIn = (page: Page, scope: string, name: string) => page.locator(scope).getByRole('button', { name, exact: true }).first().click();
/** A tab (components/ui/Tabs renders role="tab"): a view switch, a section, a panel. */
const tabIn = (page: Page, scope: string, name: string) => page.locator(scope).getByRole('tab', { name, exact: true }).first().click();

/*
 * The planner with a plan in it (r10). "On operator planner page the clear button has
 * different size, than other UI elements, this is true for both simple and experimental.
 * add this also to the check you have to do" (maintainer, 2026-09-27): on 61f8409 each
 * Clear was 44px beside 33px ghosts and a 38px search, and the census never saw a panel
 * head, because an empty planner shows none -- Experimental's panels are headed by what
 * the plan holds, and Simple's operator tabs, dossier and Clear by who is in it. So these
 * states seed a realistic plan (four operators, part of the way there, a depot of the
 * usual clutter) into this browser's storage, as a reader's own would be, reload, and
 * wait until every operator is priced: every panel head, the search row, the shortfall's
 * toolbar and foot, the plan's operator rows, a dossier and the open depot.
 */
const goal = (elite: number, level: number, skillLevel: number, masteryTargets: Record<number, number> = {}) => ({
  elite, level, skillLevel, masteryTargets, moduleStageTargets: {},
  startingElite: 0, startingLevel: 1, startingSkillLevel: 1, startingMasteryLevels: {}, startingModuleStages: {},
});
/** What a reader's planner keeps, by localStorage key (pages/planner.tsx, lib/planner/). */
export type PlannerStorage = Record<string, unknown>;
export const PLANNER_PLAN: PlannerStorage = {
  plannerState: {
    selectedNames: ['Surtr', 'SilverAsh', 'Texas', 'Eyjafjalla'],
    builderStates: {
      Surtr: { ...goal(2, 90, 7, { 2: 3 }), startingElite: 1, startingLevel: 80, startingSkillLevel: 7 },
      SilverAsh: goal(2, 60, 7, { 2: 3 }),
      Texas: goal(2, 40, 7),
      Eyjafjalla: { ...goal(2, 90, 7, { 1: 3 }), startingElite: 2, startingLevel: 30, startingSkillLevel: 7 },
    },
  },
  plannerRoster: { Surtr: { elite: 1, level: 80, skillLevel: 7, masteries: {} }, Eyjafjalla: { elite: 2, level: 30, skillLevel: 7, masteries: {} } },
  plannerDepot: {
    LMD: 850000, 'Orirock Cube': 120, 'Orirock Cluster': 40, 'Sugar Pack': 25, Polyester: 30, 'Oriron Cluster': 12, Aketon: 18,
    'Manganese Ore': 9, Grindstone: 7, 'Skill Summary - 3': 30, 'Skill Summary - 2': 60, 'Guard Chip': 4, 'Guard Chip Pack': 2,
    'Strategic Battle Record': 40, 'Tactical Battle Record': 80, 'Loxic Kohl': 14, 'RMA70-12': 6, 'Integrated Device': 3,
  },
};

/** Writes `storage` into this origin's localStorage, reloads, and waits until the plan is
 *  priced: each operator's build data arrives on its own fetch, and until it does the
 *  rows say "counting..." and the panels "Working out..." or "Loading...". */
export async function seedPlanner(page: Page, storage: PlannerStorage) {
  await page.evaluate((s) => {
    const privacy = localStorage.getItem('arkpedia:privacy:v1');
    localStorage.clear();
    if (privacy) localStorage.setItem('arkpedia:privacy:v1', privacy);
    for (const [key, value] of Object.entries(s)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    // "edited 18 days ago", whatever day the test runs (lib/planner/depot.ts DEPOT_TOUCHED_KEY).
    if (s.plannerDepot) localStorage.setItem('plannerDepotTouched', String(Date.now() - 18 * 86400000));
  }, storage);
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await plannerPriced(page);
}
export async function plannerPriced(page: Page) {
  await page.waitForFunction(() => {
    const text = document.querySelector('main')?.textContent ?? '';
    return !!text && !/counting\.\.\.|Working out|Loading /.test(text);
  }, undefined, { timeout: 15000 });
}
/** A control by its exact name, a tab or a button: 61f8409 drew the mode switch and the
 *  operator strip as chips, so the same state reaches the old page too. */
const pick = (page: Page, scope: string, name: string) => page.locator(scope).getByRole('tab', { name, exact: true })
  .or(page.locator(scope).getByRole('button', { name, exact: true })).first().click();
/** Experimental with a plan: its three panels, headed by what the plan holds. */
export async function plannerExperimental(page: Page, storage: PlannerStorage) {
  await seedPlanner(page, storage);
  await pick(page, '.page-header-actions', 'Experimental');
  await plannerPriced(page);
}
const experimental = (page: Page) => plannerExperimental(page, PLANNER_PLAN);
const PLANNER_STATES: CensusState[] = [
  { id: 'planner simple with a plan', route: "/operator-planner", act: (page) => seedPlanner(page, PLANNER_PLAN) },
  { id: 'planner simple on an operator', route: "/operator-planner", act: async (page) => { await seedPlanner(page, PLANNER_PLAN); await pick(page, 'main', 'Surtr'); await page.locator('.simple-dossier').waitFor(); await plannerPriced(page); } },
  { id: 'planner experimental with a plan', route: "/operator-planner", act: experimental },
  { id: 'planner experimental, depot open', route: "/operator-planner", act: async (page) => { await experimental(page); await page.getByRole('button', { name: 'Open depot', exact: true }).click(); await page.locator('.plan-panel').last().getByRole('button', { name: 'Done', exact: true }).waitFor(); } },
  // The two windows a plan row and a panel head open: where an operator is (the roster
  // window, with Owned and Forget), and where they are going (the goal window, with the
  // operator's bill against the plan).
  { id: 'planner experimental, roster window', route: "/operator-planner", act: async (page) => {
    await experimental(page);
    await page.getByRole('button', { name: 'Your roster', exact: true }).click();
    await page.locator('.modal-box').getByRole('button', { name: /Surtr/ }).first().click();
    await page.locator('.modal-box').getByRole('button', { name: /^Forget / }).waitFor();
  } },
  { id: 'planner experimental, goal window', route: "/operator-planner", act: async (page) => {
    await experimental(page);
    await page.locator('.plan-row').first().getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.modal-box .wizard-bill').waitFor();
  } },
  // The row's third window, Build: its steps and the × that closes it. The x-buttons round
  // could not hold it, because behind it Experimental's Craft toggles sat 8.5px off their
  // tags and the plan-row actions overflowed their column, which this round fixed.
  { id: 'planner experimental, build window', route: "/operator-planner", act: async (page) => {
    await experimental(page);
    await page.locator('.plan-row').first().getByRole('button', { name: 'Build', exact: true }).click();
    await page.locator('.modal-box.build-box .build-body').waitFor();
  } },
];

export const CENSUS_STATES: CensusState[] = [
  { id: 'planner with Amiya (the level dialog)', route: "/operator-planner", act: async (page) => { await page.locator('#planner-search').fill('Amiya'); await page.locator('#planner-search').press('Enter'); await page.locator('.simple-wizard').waitFor(); } },
  // Experimental's own rows: "Your plan" (Clear, Your roster, Add a goal) and the depot's
  // (Clear, Open depot). The maintainer found Clear a size apart from its row on 2026-09-27
  // in both modes; Simple's search row is on the page load.
  { id: 'planner experimental', route: "/operator-planner", act: (page) => tabIn(page, '.page-header-actions', 'Experimental') },
  { id: 'event rewards tab', route: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', act: (page) => tabIn(page, '.event-detail-tabs', 'Rewards') },
  { id: 'gacha details', route: "/gacha-simulator", act: async (page) => { await (await bannerWithDetails(page)).click(); await page.locator('.gacha-details-modal').waitFor(); } },
  { id: 'gacha operator preview', route: "/gacha-simulator", act: async (page) => {
    await (await bannerWithDetails(page)).click();
    await page.locator('.gacha-details-modal button.gacha-details-featured, .gacha-details-modal .gacha-details-name-list button').first().click();
    await page.locator('.gacha-pull-preview-header').waitFor();
  } },
  // The banner guide on its last Basics page, its widest nav row: "‹ Previous", the page
  // count and "Continue ›" (or "Done", for a banner with no pages of its own). The count
  // sat 5px above the buttons' centre, lifted by a margin-bottom left from when it stood
  // above the row; at 390 it holds one line with 11px either side.
  { id: 'gacha guide', route: "/gacha-simulator", act: async (page) => {
    await page.getByRole('button', { name: 'How does this work?' }).first().click();
    const guide = page.locator('.gacha-guide-modal');
    await guide.waitFor();
    // A banner with its own pages asks first; one without opens on the Basics.
    if (await guide.locator('.gacha-tutorial-question').count()) await guide.getByRole('button', { name: 'No', exact: true }).click();
    for (let i = 0; i < 20 && await guide.getByRole('button', { name: /^Next/ }).count(); i += 1) await guide.getByRole('button', { name: /^Next/ }).click();
    await guide.getByRole('button', { name: /^(Continue|Done)/ }).waitFor();
  } },
  { id: 'schedule calendar', route: '/schedule?view=calendar', act: (page) => page.getByRole('heading', { name: 'Calendar', level: 1 }).waitFor() },
  { id: 'schedule past events', route: '/schedule?past=1', act: async (page) => { await page.getByRole('button', { name: 'Past', exact: true, pressed: true }).waitFor(); } },
  { id: 'recruitment with two tags', route: '/recruitment', act: async (page) => { const tags = page.locator('.recruit-tag-picker .filter-chip'); await tags.nth(1).click(); await tags.nth(6).click(); } },
  { id: 'stronghold alliances', route: "/game-modes/stronghold-protocol", act: (page) => tabIn(page, '.gm-lookup', 'Alliances') },
  { id: 'stronghold items', route: "/game-modes/stronghold-protocol", act: (page) => tabIn(page, '.gm-lookup', 'Items') },
  { id: 'stronghold enemies', route: "/game-modes/stronghold-protocol", act: (page) => tabIn(page, '.gm-lookup', 'Enemies') },
  { id: 'stage guesser custom list', route: '/games/stage-guesser', act: (page) => clickIn(page, 'main', 'Custom') },
  // The Income popup: the forecast banner and the condensed report (pages/pulls.tsx).
  { id: 'pulls income', route: "/pull-planner", act: async (page) => { await page.locator('#tab-income').click(); await page.locator('dialog.pulls-income-dialog .pulls-report').waitFor(); } },
  { id: 'enemies stages tab', route: '/enemies', act: (page) => tabIn(page, '.enemy-tabs', 'Stages') },
  // r10 x-buttons: dialogs whose close became the borderless × (XButton). The planner's goal
  // dialog had a 44px-wide glyph box stretched to its head's height; as a square it sat 6px
  // above the steps beside it until placed on the head's centre line.
  // The Owned / Not owned chips (components/account/OwnedFilter) lit, on an imported account
  // (lib/account/accountStore): drawn for everyone, enabled only with an import.
  // The Skin Planner (components/skins/SkinPlanner) with an outfit planned: its card lit and
  // the summary's shop deadline filled in.
  { id: 'skin planner with a plan', route: '/skin-planner', act: async (page) => { await page.locator('.skin-plan-card-foot').first().click(); await page.locator('.skin-plan-deadlines').waitFor(); } },
  { id: 'roster owned', route: '/operators', act: async (page) => { await seedAccount(page); await openFilters(page); await page.getByRole('group', { name: 'Operators you own' }).getByRole('button', { name: /^Owned\s*\d+$/ }).click(); await closeFilters(page); } },
  { id: 'skins not owned', route: '/skins', act: async (page) => { await seedAccount(page); await openFilters(page); await page.getByRole('group', { name: 'Outfits you own' }).getByRole('button', { name: /^Not owned\s*\d+$/ }).click(); await closeFilters(page); } },
  { id: 'planner goal dialog', route: "/operator-planner", act: async (page) => { await tabIn(page, '.page-header-actions', 'Experimental'); await page.getByRole('button', { name: /Add a goal/ }).first().click(); await page.locator('.wizard-head:visible').first().waitFor(); } },
  // The account page with an import (lib/account/accountStore): the profile and counts filled
  // in, and Import / export open.
  // The Pull Planner's Past events popup with an import (components/pulls/PastRewards): ticked
  // from the account's cleared stages, one chapter opened to the stages it has left.
  { id: 'pulls past events from an import', route: "/pull-planner", act: async (page) => {
    await seedAccount(page);
    await page.locator('#tab-past').click();
    await page.locator('dialog.pulls-past-dialog .pulls-past-row button.pulls-past-name').first().click();
    await page.locator('dialog.pulls-past-dialog .pulls-past-detail').first().waitFor();
  } },
  // The OP Tracker with an import: ticked from the account, one chapter opened to the
  // stages it has left.
  { id: 'op tracker from an import', route: "/reward-tracker", act: async (page) => {
    await seedAccount(page);
    await page.locator('.pulls-past-page .pulls-past-row button.pulls-past-name').first().click();
    await page.locator('.pulls-past-page .pulls-past-detail').first().waitFor();
  } },
  { id: 'account with an import', route: '/account', act: async (page) => {
    await seedAccount(page);
    // Import / export (components/account/DataDialog).
    await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
    await page.locator('dialog.data-dialog .import-forms').waitFor();
  } },
  { id: 'stronghold record', route: "/game-modes/stronghold-protocol", act: async (page) => { await tabIn(page, '.gm-lookup', 'Enemies'); await page.locator('.gm-row:visible').first().click(); await page.locator('.record-dialog').first().waitFor(); } },
  { id: 'stage enemy record', route: '/stages/browse?s=1-7', act: async (page) => { await page.locator('.stage-enemy-faces .enemy-face').first().click(); await page.locator('.record-dialog .enemy-hero').first().waitFor(); } },
  // The 2026-10-23 redesign: a card opens its record. Self-Sustain has branch-wide entries
  // and operator rows; Kjerag has givers with buff tags and other members.
  { id: 'technique record', route: '/techniques?t=Self-Sustain', act: async (page) => { await page.locator('.record-dialog .technique-row').first().waitFor(); } },
  { id: 'synergy record', route: '/synergies', act: async (page) => { await page.locator('main .technique-card', { hasText: 'Kjerag' }).click(); await page.locator('.record-dialog .synergy-members').waitFor(); } },
  ...PLANNER_STATES,
];

/**
 * The webfont files (pages/_app.tsx imports them from @fontsource): the build emits each
 * .woff2, and the .woff each @font-face names after it, under /_next/static/media. A test
 * that measures the first paint, or a visitor whose fonts never arrive, refuses these.
 * They are served from the site itself, so a route for other hosts alone does not catch them.
 */
export const WEBFONT_FILES = /\/_next\/static\/media\/[^/?#]+\.woff2?(?:[?#]|$)/;

/** Refuses the webfont files, so the page draws in its fallback faces throughout. */
export async function refuseWebfonts(target: Page | BrowserContext) {
  await target.route(WEBFONT_FILES, (route) => route.abort());
}

/**
 * document.fonts.ready, bounded. One stalled webfont fetch held two tests for their
 * whole 30s timeout in a Linux run of the suite (cards-and-headings, 2 of 1208, retries 0),
 * so a network stall turned the Check red. Every guard here is font-safe (box edges, and
 * ±2px where glyph metrics count), so after `ms` the test goes on in the face it has; a
 * test that needs Rajdhani itself checks for it (terminal-pages, the game switcher), and
 * fails there by name rather than on a timeout. Resolves false when the wait ran out.
 */
export async function fontsSettled(page: Page, ms = 8000): Promise<boolean> {
  return page.evaluate((limit) => Promise.race([
    document.fonts.ready.then(() => true),
    new Promise<boolean>((resolve) => { setTimeout(() => resolve(false), limit); }),
  ]), ms);
}

/** On a phone a list page's filters are in its Filters sheet (components/ui/FilterSheet):
 *  open it, if the page draws the button at this width. Over 720px this does nothing and the
 *  controls are in the toolbar as before. */
export async function openFilters(page: Page) {
  const button = page.locator('.filter-bar-open');
  await button.first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  if (!(await button.first().isVisible().catch(() => false))) return;
  await button.first().click();
  await page.locator('dialog.filter-sheet[open]').waitFor();
}

/** Closes the Filters sheet with Done, if one is open. */
export async function closeFilters(page: Page) {
  const sheet = page.locator('dialog.filter-sheet[open]');
  if (!(await sheet.count())) return;
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
}

/** Only reads go to other hosts: a YouTube embed's POSTs are dropped. */
export async function readOnly(page: Page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.fallback() : route.abort()));
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
  await fontsSettled(page);
}
