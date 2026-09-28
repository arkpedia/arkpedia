import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { CENSUS_STATES, censusRoutes, fontsSettled, openCensus, readOnly, type CensusState } from './census-routes';
import { sectionCensus, type StackOffence } from './section-census';
import {
  baseline, BASELINE_FILE, boundsRoutes, buttonVoiceLeaks, census, censusWidth, CONTENT_CARDS, expectOnlyAllowed, FIRST_GAP, FIRST_GAP_OTHERS,
  HEADING_GAP, HEADING_ROUTES, HOME_CARDS, movingAnimations, PICTURE_DRIVES, PICTURE_ROUTES, PICTURE_STATES, pictureCards, SECTION_GAP, settled, stackBaseline, stackDir, tabAlignBothThemes,
  themeOf, tokenColour, UPDATE, type Baseline,
} from './layout-checks';
import { musicTabCheck } from './music-tab-checks';
import { overlayText, setTheme, themeStillOff } from './overlay-checks';

/*
 * The layout census (r11): every address and driven state the UI census visits, loaded
 * ONCE per theme per project, and every per-page layout check run on that one load.
 *
 * Until r11 three specs each loaded the same pages in tests of their own --
 * cards-and-headings.spec.ts 422 tests, page-bounds.spec.ts 266 and row-alignment.spec.ts
 * 154, over half of the browser suite's 1,212 and of its time -- so a route was loaded up to
 * a dozen times to be measured six ways. The checks, their code and every tolerance are
 * the same (layout-checks.ts, which says where each came from); only the loading changed.
 * The desktop project measures at 1440 and the mobile one at 390 (its Pixel 7 narrowed
 * to the census width, as row-alignment.spec.ts did). What each page gets:
 *
 *   check           where                                    themes      widths
 *   headings        HEADING_ROUTES (look, entity titles)     dark+light  1440+390 dark, 1440 light
 *   heading gaps    HEADING_ROUTES (--heading-gap, --section-gap)  dark  1440+390
 *   picture cards   PICTURE_ROUTES (+ CONTENT_CARDS)         dark+light  1440+390
 *   picture hover   PICTURE_ROUTES: the teal edge on hover and focus  both  1440
 *   home cards      /                                        dark+light  1440+390 (hover 1440)
 *   button voice    every census address and state           dark        1440
 *   page bounds     boundsRoutes(): no-h1, h1-align, frame, page-scroll-x, motion,
 *                   tab-align (both themes, flipped in place), first-gap, stack-align
 *                                                            dark        1440+390
 *   first-gap       every driven state                       dark        1440+390
 *   tab-align       every driven state (both themes, flipped in place; tabs.spec.ts
 *                   keeps the states the census does not drive)  dark    1440+390
 *   rows            every census address and state (row-census.ts)  dark  1440+390
 *
 * Page bounds and the states' first-gap were measured with prefers-reduced-motion:
 * reduce, the rest with motion on. So a page they measure loads with reduced motion,
 * is measured by them first (page bounds straight after the load event and the fonts,
 * as before, so the motion check still sees an entrance animation that runs), then has
 * motion turned back on, waits for the animations that starts to end, and gets the rest.
 * The rest waits for the network to go quiet first, as each of them did.
 *
 * Each check reports its own failures, prefixed "[check] <page> at <width>px, <theme>:",
 * with expect.soft, and an error inside one check is reported as that check's failure, so
 * one failing check never hides the others on the same load.
 *
 * The tests spread over every worker; the check that needs every page at both widths (a
 * stale stack-align entry) is layout-census-after.spec.ts, a project that runs after both.
 *
 * To add a per-page layout check, add it here (and its evaluator to layout-checks.ts), on
 * the load that already exists, rather than a spec that loads every page again.
 */

/* The census's tests share nothing but the files they write, so they spread over every
   worker (playwright.config.ts): a third of the suite in one file would otherwise hold one
   worker for most of the run. */
test.describe.configure({ mode: 'parallel' });

/** A page the census loads: an address, or an address and the interaction that drives it. */
interface Target {
  /** How failures name it: the address, or "address (state id)". */
  key: string;
  route: string;
  state?: CensusState;
  /** Drives a picture-only address after its load (PICTURE_DRIVES). */
  drive?: (page: Page) => Promise<void>;
  /** The row census and the button voice: every census address and state. */
  rows: boolean;
  /** Page bounds: an address in boundsRoutes(). */
  bounds: boolean;
  headings?: number;
  pictures?: number;
  home: boolean;
}

const ROUTES = censusRoutes();
const BOUNDS = new Set(boundsRoutes());
const has = (table: Record<string, number>, route: string) => (Object.prototype.hasOwnProperty.call(table, route) ? table[route] : undefined);
const TARGETS: Target[] = [
  ...ROUTES.map((route) => ({ key: route, route, rows: true, bounds: BOUNDS.has(route), headings: has(HEADING_ROUTES, route), pictures: has(PICTURE_ROUTES, route), home: route === '/' })),
  ...CENSUS_STATES.map((state) => ({ key: `${state.route} (${state.id})`, route: state.route, state, rows: true, bounds: false, home: false })),
  // The picture-card addresses that are not census routes, for that check alone.
  ...Object.keys(PICTURE_ROUTES).filter((route) => !ROUTES.includes(route)).map((route) => ({ key: route, route, rows: false, bounds: false, pictures: PICTURE_ROUTES[route], home: false })),
  // Picture cards that show only once the page is driven (the /pulls skin wishlist).
  ...Object.keys(PICTURE_STATES).map((route) => ({ key: route, route, drive: PICTURE_DRIVES[route], rows: false, bounds: false, pictures: PICTURE_STATES[route], home: false })),
];
// A table naming an address the census does not load would measure nothing and pass.
for (const route of [...BOUNDS, ...Object.keys(HEADING_ROUTES)]) {
  if (!ROUTES.includes(route)) throw new Error(`layout census: ${route} is measured (page bounds or headings) but is not a census address (census-routes.ts)`);
}

/* The accepted stack-align insets each run saw, one file per page and width, for the stale
   check (layout-census-after.spec.ts), which runs once both projects are done. */
/* UPDATE_BOUNDS_BASELINE=1: what each project's pages offended with. */
const measured: Baseline = {};

const at = (check: string, key: string, width: number, theme: string) => `[${check}] ${decodeURIComponent(key)} at ${width}px, ${theme}: `;

/** Runs one check as a step of its own (the report times each); an error inside it (a
 *  timeout, a detached node) is that check's failure, and the census goes on to the next. */
async function part(prefix: string, body: () => Promise<void>) {
  try {
    await test.step(prefix.replace(/:\s*$/, ''), body);
  } catch (error) {
    expect.soft(String(error instanceof Error ? error.message : error).split('\n').slice(0, 3).join(' '), `${prefix}stopped by an error`).toBe('');
  }
}

/** Motion back on after a reduced-motion measurement, and the animations that starts
 *  (an entrance, a dialog's rise) run to their end, so the checks that measured with
 *  motion on see the page at rest; an endless one (a spinner, the LIVE dot) is left
 *  running. Bounded, so a paused animation cannot hold the test. */
async function motionOn(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
      .map((a) => a.finished.catch(() => undefined))),
    new Promise((resolve) => { setTimeout(resolve, 5000); }),
  ]));
}

/* ---- The checks, each as it was in its own spec ------------------------------------ */

/** cards-and-headings.spec.ts, "section headings on <route>". */
async function headings(page: Page, t: Target, theme: 'dark' | 'light', p: string) {
  const route = t.route;
  const least = t.headings!;
  expect.soft(await themeOf(page), `${p}the page is in the ${theme} theme`).toBe(theme);
  const heading = await tokenColour(page, '--heading');
  const amber = await tokenColour(page, '--amber');
  const teal = await tokenColour(page, '--teal');
  expect.soft(heading, `${p}the heading colour is its own token`).not.toBe(teal);
  // A page that fetches its sections after it hydrates can go network-quiet before
  // the fetch starts: /stages/browse's rail comes from /stages-index.json on mount,
  // and in the Linux image the test measured "Loading the stage list..." with no
  // heading drawn. So the headings are awaited, then the network once more.
  await expect.soft.poll(async () => (await page.evaluate(sectionCensus, { stacks: false })).headings.length, { message: `${p}${route} draws at least ${least} section heading(s)`, timeout: 15000 }).toBeGreaterThanOrEqual(least);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const found = await page.evaluate(sectionCensus, { stacks: false });
  expect.soft(found.headings.length, `${p}${route} shows at least ${least} section heading(s)`).toBeGreaterThanOrEqual(least);
  for (const h of found.headings) {
    const where = `${p}${route} "${h.text}"`;
    expect.soft(h.colour, `${where} is not amber`).not.toBe(amber);
    expect.soft(h.colour, `${where} uses --heading`).toBe(heading);
    expect.soft(h.size, `${where} is 18px`).toBe(18);
    expect.soft(h.weight, `${where} is 700`).toBe('700');
    expect.soft(h.tracking, `${where} is tracked 0.03em`).toBeCloseTo(0.03, 3);
    expect.soft(h.transform, `${where} is uppercase`).toBe('uppercase');
  }
  for (const e of found.entities) {
    expect.soft(e.size, `${p}${route} entity title "${e.text}" is 22px at most`).toBeLessThanOrEqual(22);
    if (e.sectionSize !== null) expect.soft(e.size, `${p}${route} entity title "${e.text}" is no larger than the section h2 "${e.sectionHeading}" above it`).toBeLessThanOrEqual(e.sectionSize);
  }
  if (theme !== 'dark') return;
  const gaps = found.headings.filter((h) => h.gap !== null && Math.abs(h.gap - HEADING_GAP) > 2).map((h) => `"${h.text}" -> ${h.next}: ${h.gap}px`);
  expect.soft(gaps, `${p.replace('[headings]', '[heading-gap]')}${route}: section headings not ${HEADING_GAP}px (+-2) above the first content under them`).toEqual([]);
  const stacked = found.sections.filter((g) => Math.abs(g.gap - SECTION_GAP) > 2).map((g) => `${g.a} -> ${g.b}: ${g.gap}px`);
  expect.soft(stacked, `${p.replace('[headings]', '[section-gap]')}${route}: stacked .op-sections not ${SECTION_GAP}px (+-2) apart`).toEqual([]);
}

/** cards-and-headings.spec.ts, "picture cards on <route> have no resting frame" (the
 *  resting half; the hover half is pictureHover, after every check that reads a card at rest). */
async function pictures(page: Page, t: Target, theme: 'dark' | 'light', p: string) {
  const route = t.route;
  const least = t.pictures!;
  // As the picture test waited: for the network to go quiet, which failed it at its 30s
  // test timeout when a host stalled; bounded at 30s here, so a stall fails this check (as
  // an error, part()) and the checks after it still run.
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  expect.soft(await themeOf(page), `${p}the page is in the ${theme} theme`).toBe(theme);
  const cards = await pictureCards(page);
  expect.soft(cards.length, `${p}${route} has at least ${least} picture card(s)`).toBeGreaterThanOrEqual(least);
  const framed = [...new Map(cards.filter((card) => !card.on && card.frames.length).map((card) => [card.name, `${card.name} (${card.size}): ${card.frames.join('; ')}`])).values()];
  expect.soft(framed, `${p}${route}: picture cards framed at rest`).toEqual([]);
  for (const selector of CONTENT_CARDS[route] ?? []) {
    const edges = await page.locator(selector).evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0)
      .map((el) => { const cs = getComputedStyle(el); return [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor]; }));
    expect.soft(edges.length, `${p}${route} shows ${selector}`).toBeGreaterThan(0);
    for (const colours of edges) {
      for (const edge of colours) expect.soft(edge, `${p}${selector} has no visible border at rest`).toMatch(/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/);
    }
  }
  return cards;
}

/* A hover edge is a 150ms colour transition: looking every 25-100ms at first, not
   Playwright's default 100-250-500ms, gets the same verdict (the same 10s limit) about
   a quarter of a second sooner per poll, three polls per kind of card. */
const POLL = [25, 50, 100, 250, 500, 1000];

/** The hover half of the picture test: hover and keyboard focus draw the teal edge, round
 *  the card or round its art, one card of each kind. Focus after a key press is
 *  :focus-visible. Desktop only, as before. */
async function pictureHover(page: Page, cards: Awaited<ReturnType<typeof pictureCards>>, p: string) {
  const teal = await tokenColour(page, '--teal');
  const kinds = [...new Map(cards.filter((card) => !card.on).map((card) => [card.name, card])).values()];
  for (const card of kinds) {
    const target = page.locator(`[data-picture-card="${card.id}"]`);
    if (!card.edged) {
      await page.keyboard.press('Shift');
      await target.focus();
      expect.soft(await target.evaluate((el) => getComputedStyle(el).outlineStyle), `${p}${card.name} has no edge to paint, so its keyboard focus shows the outline`).not.toBe('none');
      await target.blur();
      continue;
    }
    const edged = () => target.evaluate((el, [id, colour]) => {
      const edges: Element[] = [];
      for (let node = el.querySelector(`[data-picture-art="${id}"]`) ?? el; node && node !== el; node = node.parentElement!) edges.push(node);
      return [el, ...edges].some((node) => { const cs = getComputedStyle(node); return cs.borderTopColor === colour && parseFloat(cs.borderTopWidth) > 0 && !['none', 'hidden'].includes(cs.borderTopStyle); });
    }, [String(card.id), teal] as const);
    await target.hover();
    await expect.soft.poll(edged, { message: `${p}${card.name} turns teal on hover, round the card or its art`, intervals: POLL }).toBe(true);
    await page.mouse.move(0, 0);
    await expect.soft.poll(edged, { message: `${p}${card.name} has no teal edge once the pointer leaves`, intervals: POLL }).toBe(false);
    await page.keyboard.press('Shift');
    await target.focus();
    await expect.soft.poll(edged, { message: `${p}${card.name} turns teal on keyboard focus, round the card or its art`, intervals: POLL }).toBe(true);
    await target.blur();
  }
}

/** cards-and-headings.spec.ts, "home picture cards have no resting frame and a teal edge on hover". */
async function homeCards(page: Page, theme: 'dark' | 'light', desktop: boolean, p: string) {
  expect.soft(await themeOf(page), `${p}the page is in the ${theme} theme`).toBe(theme);
  const teal = await tokenColour(page, '--teal');
  let checked = 0;
  for (const selector of HOME_CARDS) {
    const card = page.locator(selector).first();
    if (!(await card.count()) || !(await card.isVisible())) continue;
    const rest = await card.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect.soft(rest, `${p}${selector} has no visible border at rest`).toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
    checked += 1;
    if (desktop) {
      await card.hover();
      await expect.soft.poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor), { message: `${p}${selector} turns teal on hover`, intervals: POLL }).toBe(teal);
      await page.mouse.move(0, 0);
    }
  }
  expect.soft(checked, `${p}at least the event, banner and featured cards are on the page`).toBeGreaterThanOrEqual(3);
}

/** page-bounds.spec.ts, "page bounds at <width>px > <route>": straight after the load
 *  event and the fonts, under reduced motion. Returns the accepted stack-align insets seen. */
async function pageBounds(page: Page, t: Target, width: 1440 | 390, p: string): Promise<string[]> {
  const route = t.route;
  const key = width === 1440 ? 'd1440' : 'd390';
  const moving = await movingAnimations(page);
  const { offences, detail } = await settled(page);
  if (moving.length) { offences.push('motion'); detail.push(`moves under prefers-reduced-motion: ${moving.join(', ')}`); }
  // --- tab-align (r9): measured in both themes, flipping data-theme in place ---
  const tabs = await tabAlignBothThemes(page);
  if (tabs.length) { offences.push('tab-align'); detail.push(...tabs); }
  // r9: the header hairline to the first content, and the stack edges.
  const found = await page.evaluate(sectionCensus, { stacks: true });
  const narrow = width <= 700;
  const expected = FIRST_GAP_OTHERS[route]?.gap ?? (found.firstGap.terminalScene && narrow ? 14 : FIRST_GAP);
  if (found.firstGap.gap !== null && Math.abs(found.firstGap.gap - expected) > 2) {
    offences.push('first-gap');
    detail.push(`the first content (${found.firstGap.first}) is ${found.firstGap.gap}px under the header hairline, not ${expected}px`);
  }
  const inset = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-inset')));
  const strays: StackOffence[] = [];
  const seen: string[] = [];
  for (const stack of found.stacks ?? []) {
    const accepted = stackBaseline.accepted.find((a) => a.parent === stack.parent && a.child === stack.child);
    // Held to --card-inset by the content box (layout, exact), not by the glyph.
    if (accepted && Math.abs(stack.boxDx - inset) <= 1) { seen.push(`${accepted.parent} > ${accepted.child}`); continue; }
    strays.push(stack);
  }
  const known = baseline[key]?.[route] ?? [];
  if (offences.length) (measured[key] ??= {})[route] = offences;
  if (UPDATE) return seen;
  const fresh = offences.filter(o => !known.includes(o));
  const stale = known.filter(o => !offences.includes(o));
  expect.soft(fresh, `${p}${route} at ${key}: new bounds offences. ${detail.join('; ')}`).toEqual([]);
  expect.soft(stale, `${p}${route} at ${key}: fixed -- remove ${stale.join(', ')} from page-bounds-baseline.json (UPDATE_BOUNDS_BASELINE=1)`).toEqual([]);
  expect.soft(strays.map((x) => `${x.parent} > ${x.child} starts ${x.dx}px right of the parent's edge (led by ${x.by}; ${x.flush} starts on it)`),
    `${p.replace('[page-bounds]', '[stack-align]')}${route} at ${key}: stack-align -- a first line set in from its section's edge (docs/development/ui-primitives.md rule 17)`).toEqual([]);
  return seen;
}

/** page-bounds.spec.ts, "first-gap on <route> (<state>) at <width>px" (r10): first-gap on
 *  every driven state, not only on a page load. A view switch puts other content first
 *  under the header, and the route list only ever sees the view a page opens on: the
 *  planner opens on Simple (its search 24px under the hairline) and Experimental's first
 *  panel sat 40px under it, from the 16px top margin that spaces the panels from each
 *  other, so the page moved 16px on every switch between the two. A dialog state
 *  measures the page behind it, which the dialog does not move. The page is put back
 *  where the state left it for the checks after this one. */
async function stateFirstGap(page: Page, t: Target, width: 1440 | 390, p: string) {
  const where = await page.evaluate(() => [window.scrollX, window.scrollY]);
  await page.evaluate(() => window.scrollTo(0, 0));
  const found = await page.evaluate(sectionCensus, { stacks: false });
  const narrow = width <= 700;
  const expected = FIRST_GAP_OTHERS[t.route]?.gap ?? (found.firstGap.terminalScene && narrow ? 14 : FIRST_GAP);
  expect.soft(found.firstGap.gap, `${p}the page has a header and a first content`).not.toBeNull();
  if (found.firstGap.gap !== null) expect.soft(Math.abs(found.firstGap.gap - expected), `${p}the first content (${found.firstGap.first}) is ${found.firstGap.gap}px under the header hairline, not ${expected}px (rule 15)`).toBeLessThanOrEqual(2);
  await page.evaluate(([x, y]) => window.scrollTo({ left: x, top: y, behavior: 'instant' }), where);
}

/* ---- The census ---------------------------------------------------------------------- */

async function run(page: Page, info: TestInfo, t: Target, theme: 'dark' | 'light') {
  // Merged from up to six tests of 30s each (the default timeout), so up to 3 minutes.
  test.setTimeout(180_000);
  const desktop = info.project.name === 'desktop';
  const width = await censusWidth(page);
  const p = (check: string) => at(check, t.key, width, theme);
  await page.addInitScript((mode) => { try { localStorage.setItem('theme', mode); } catch { /* none */ } }, theme);
  const dark = theme === 'dark';
  // Page bounds and the states' first-gap measured with reduced motion from the first paint.
  const reduced = dark && (t.bounds || !!t.state);
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  if (dark && t.bounds) {
    await test.step('load (the load event, the fonts)', async () => {
      await readOnly(page);
      await page.goto(t.route, { waitUntil: 'load' });
      await fontsSettled(page);
    });
    let seen: string[] = [];
    await part(p('page-bounds'), async () => { seen = await pageBounds(page, t, width, p('page-bounds')); });
    fs.mkdirSync(stackDir(info), { recursive: true });
    fs.writeFileSync(path.join(stackDir(info), `${info.project.name}-${TARGETS.indexOf(t)}.json`), JSON.stringify({ width, route: t.route, seen }));
    // The rest waited for the network, as openCensus does.
    await test.step('the network goes quiet', async () => {
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await fontsSettled(page);
    });
  } else {
    await test.step(t.state ? `load and drive (${t.state.id})` : 'load (the network quiet, the fonts)', () => openCensus(page, t.state ?? t.route));
    if (t.drive) await test.step('drive', () => t.drive!(page));
    if (dark && t.state) await part(p('first-gap'), () => stateFirstGap(page, t, width, p('first-gap')));
  }
  if (reduced) await test.step('motion back on, animations ended', () => motionOn(page));

  if (dark && t.state) {
    // tabs.spec.ts, "tab strips and pick-one rows start on the section edge: <state>": the
    // tab census on the states a page load does not reach, in both themes, with motion on.
    await part(p('tab-align'), async () => { expect.soft(await tabAlignBothThemes(page), `${p('tab-align')}tab strips and pick-one rows off the section edge (rule 13)`).toEqual([]); });
  }
  if (t.headings !== undefined && (dark || desktop)) await part(p('headings'), () => headings(page, t, theme, p('headings')));
  if (dark && t.rows) await part(p('rows'), async () => expectOnlyAllowed(expect.soft, p('rows'), await census(page), t.state ? t.state.id : t.route, width));
  if (dark && t.rows && desktop) {
    await part(p('button-voice'), async () => {
      expect.soft(await buttonVoiceLeaks(page), `${p('button-voice')}${decodeURIComponent(t.key)}: buttons in Inter or JetBrains Mono with the button tracking (a card takes .btn-bare)`).toEqual([]);
    });
  }
  let cards: Awaited<ReturnType<typeof pictureCards>> = [];
  if (t.pictures !== undefined) await part(p('picture-cards'), async () => { cards = await pictures(page, t, theme, p('picture-cards')); });
  if (t.home) await part(p('home-cards'), () => homeCards(page, theme, desktop, p('home-cards')));
  if (t.pictures !== undefined && desktop) await part(p('picture-hover'), () => pictureHover(page, cards, p('picture-hover')));
  // overlay-badges.spec.ts, "text on overlays on <page> reads at 4.5:1 in both themes": the
  // theme flipped on the root in place, the states once (desktop), colour being width-free.
  if (dark && t.rows && (!t.state || desktop)) {
    await part(p('overlay-text'), async () => {
      for (const flip of ['dark', 'light'] as const) {
        await setTheme(page, flip);
        const found = await page.evaluate(overlayText);
        expect.soft(found.offences, `${p('overlay-text')}${flip} theme: text on an overlay under 4.5:1 (worst of the ground over black and over white)`).toEqual([]);
      }
      await setTheme(page, 'dark');
      await themeStillOff(page);
    });
  }
  // music-tab.spec.ts, "the collapsed music tab on <page> meets no text or control": the
  // phone project only, and last, because it resizes the viewport.
  if (dark && t.rows && !desktop) await part(p('music-tab'), () => musicTabCheck(page, decodeURIComponent(t.key), t.route));
}

for (const t of TARGETS) {
  const name = decodeURIComponent(t.key);
  test(`${name}, dark theme`, async ({ page }, info) => run(page, info, t, 'dark'));
  // The light theme: the heading look on the desktop project, the picture and home cards
  // on both (colour does not change with the width).
  if (t.headings !== undefined || t.pictures !== undefined || t.home) {
    test(`${name}, light theme`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop' && t.pictures === undefined && !t.home, 'only the heading look runs in the light theme here, and colour is width-independent: it runs once, on desktop');
      await run(page, info, t, 'light');
    });
  }
}

test.afterAll(() => {
  if (!UPDATE) return;
  if (Object.keys(measured).length) {
    throw new Error(`page bounds are strict; nothing written. Fix these pages instead: ${JSON.stringify(measured)}`);
  }
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({}, null, 2)}\n`);
});
