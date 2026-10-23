import { expect, test, type Page } from '@playwright/test';

/*
 * The home page's Gacha Banners panel says which banner is live and which has not opened
 * (2026-10-15): the site's LIVE badge (.badge-live, as /gacha-simulator's sidebar shows LIVE NOW) on
 * a live banner's poster and thumbnail, its amber twin (.badge-upcoming) "Starts in ..." on
 * one not yet open, and neither on one that is over. A banner without published art shows
 * the site's art placeholder, where its thumbnail used to be a bare initial ("K").
 *
 * The bundled data/ is an old snapshot and the suite runs at the real clock, so whichever
 * banner is live today is not something to test against. The page is given its banners and
 * its request clock instead (in __NEXT_DATA__, as event-news.spec.ts gives its props), and
 * the browser's clock is fixed at that same instant: both clocks fixed, never one fixed and
 * one running.
 */

const NOW = Date.parse('2030-01-10T12:00:00Z');
const DAY = 86_400_000;

interface Banner {
  name: string; category: string; cn_date: null; global_date: string; global_window: { startAt: string; endAt: string };
  banner_image: string | null; six_stars: string[]; five_stars: string[]; pull_type: string; year: number; linked_event: null;
  start: string; end: string;
}

/** A Global banner open from `from` to `to` (exclusive), as the page's props carry one. */
function banner(name: string, from: number, to: number, art: string | null): Banner {
  const iso = (ms: number) => new Date(ms).toISOString();
  const day = (ms: number) => iso(ms).slice(0, 10).replace(/-/g, '/');
  return {
    name, category: 'standard_pool', cn_date: null, global_date: `${day(from)}–${day(to)}`, global_window: { startAt: iso(from), endAt: iso(to) },
    banner_image: art, six_stars: [], five_stars: [], pull_type: 'standard', year: 2030, linked_event: null, start: iso(from), end: iso(to),
  };
}

/** Live at NOW, opening in three days without art, and over (a tab left open past its end). */
const LIVE = 'Test Live Pool';
const NEXT = 'Test Next Pool';
const PAST = 'Test Past Pool';
const fixture = (art: string | null): Banner[] => [
  banner(LIVE, NOW - 2 * DAY, NOW + 5 * DAY, art),
  banner(NEXT, NOW + 3 * DAY, NOW + 17 * DAY, null),
  banner(PAST, NOW - 20 * DAY, NOW - DAY, art),
];

/** Opens the home page with these banners and this request clock, the browser's clock fixed at
 *  `clock`. Returns whether the page's props were found and given them (checked by the test,
 *  not in the handler, where a failure would leave the page unanswered and read as a timeout). */
async function openHome(page: Page, make: (real: Banner[]) => Banner[], clock = NOW): Promise<boolean> {
  let given = false;
  // The banners given below are not what the server rendered, so a development server lays its
  // error overlay over the page, which takes the clicks; a production build has none.
  await page.addInitScript(() => {
    const hide = () => document.head?.append(Object.assign(document.createElement('style'), { textContent: 'nextjs-portal { display: none !important; }' }));
    if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide, { once: true });
  });
  await page.route((url) => url.pathname === '/', async (route) => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      const props = data.props.pageProps;
      props.ongoingBanners = make(props.ongoingBanners ?? []);
      props.now = NOW;
      given = true;
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    // Its own headers, not the server's: the body is no longer the (compressed) one they describe.
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await page.clock.setFixedTime(new Date(clock));
  await page.goto('/');
  return given;
}

/** Art the asset index publishes, from a real banner on today's page; null leaves every
 *  fixture banner without art, which the placeholder covers just the same. */
const realArt = (real: Banner[]) => real.find((b) => b.banner_image)?.banner_image ?? null;

const panel = (page: Page) => page.locator('.front-gacha-panel');
const poster = (page: Page) => panel(page).locator('.front-gacha-poster-wrap');
const thumb = (page: Page, name: string) => panel(page).locator(`.front-gacha-thumb[title^="${name}"]`);
/** A layout box: the size the page lays out, not the picture-card lift's transform of it. */
const box = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => {
  const e = el as HTMLElement;
  return { width: e.offsetWidth, height: e.offsetHeight };
});
/** The panel as it will stay: its webfonts in (a late font moved its height 5px) and its
 *  countdown past the "--" it shows before mount. */
async function settled(page: Page) {
  await expect(panel(page).locator('.countdown-timer')).not.toHaveText('--');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
const sizes = async (page: Page) => {
  await settled(page);
  return { poster: await box(page, '.front-gacha-poster-wrap'), panel: await box(page, '.front-gacha-panel') };
};

test.describe('home page banners', () => {
  test.setTimeout(90_000);

  test('a live banner shows LIVE, one not open yet "Starts in", one that is over neither', async ({ page }) => {
    expect(await openHome(page, (real) => fixture(realArt(real))), 'the page carries its props in __NEXT_DATA__').toBe(true);
    await expect(thumb(page, NEXT)).toBeVisible();

    // The first banner is the one on the poster: live, with the site's LIVE badge.
    await expect(panel(page).locator('.front-gacha-name')).toHaveText(LIVE);
    await expect(poster(page).locator('.badge-live')).toHaveText('LIVE');
    await expect(poster(page).locator('.badge-upcoming')).toHaveCount(0);
    // Each thumbnail says the same of its own banner, in words too.
    await expect(thumb(page, LIVE).locator('.badge-live')).toHaveText('LIVE');
    await expect(thumb(page, LIVE)).toHaveAttribute('aria-label', `${LIVE}, live now`);
    await expect(thumb(page, NEXT).locator('.badge-upcoming')).toHaveText('in 3d');
    await expect(thumb(page, NEXT)).toHaveAttribute('aria-label', `${NEXT}, starts in 3d 0h`);
    await expect(thumb(page, NEXT).locator('.badge-live')).toHaveCount(0);
    await expect(thumb(page, PAST).locator('.badge-live, .badge-upcoming')).toHaveCount(0);

    // Not open yet: the poster counts down to its start, in amber.
    await thumb(page, NEXT).click();
    await expect(panel(page).locator('.front-gacha-name')).toHaveText(NEXT);
    await expect(poster(page).locator('.badge-upcoming')).toHaveText('Starts in 3d 0h');
    await expect(poster(page).locator('.badge-live')).toHaveCount(0);
    expect(await poster(page).locator('.badge-upcoming').evaluate((el) => getComputedStyle(el).textTransform), 'the LIVE badge\'s caps').toBe('uppercase');

    // Over: neither.
    await thumb(page, PAST).click();
    await expect(panel(page).locator('.front-gacha-name')).toHaveText(PAST);
    await expect(poster(page).locator('.badge-live, .badge-upcoming')).toHaveCount(0);
  });

  test('a banner without art shows the art placeholder, on its poster and its thumbnail', async ({ page }) => {
    expect(await openHome(page, (real) => fixture(realArt(real)))).toBe(true);
    const next = thumb(page, NEXT);
    await expect(next.locator('.art-placeholder')).toHaveText('No art');
    await expect(next.locator('img')).toHaveCount(0);
    await expect(next).not.toHaveText(/^N$/);
    await next.click();
    await expect(poster(page).locator('.art-placeholder')).toHaveText('No art yet');
    await expect(poster(page).locator('img')).toHaveCount(0);
    // It fills the poster's box: the frame the art will have.
    const [frame, fill] = await Promise.all([box(page, '.front-gacha-poster-wrap'), box(page, '.front-gacha-poster-wrap .art-placeholder')]);
    expect(Math.abs(frame.width - fill.width), 'the placeholder spans the poster').toBeLessThanOrEqual(2);
    expect(Math.abs(frame.height - fill.height)).toBeLessThanOrEqual(2);
    // And it reads: the placeholder's words are not the panel's own colour on the same ground.
    const colours = await poster(page).locator('.art-placeholder').evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    expect(colours[0]).not.toBe(colours[1]);
  });

  test('a badge changes no box: the poster, the thumbnails and the panel are one size with and without it', async ({ page }) => {
    expect(await openHome(page, (real) => fixture(realArt(real)))).toBe(true);
    await expect(poster(page).locator('.badge-live')).toBeVisible();
    const withBadge = await sizes(page);
    await thumb(page, PAST).click();
    await expect(poster(page).locator('.badge-live, .badge-upcoming')).toHaveCount(0);
    expect(await sizes(page), 'the poster and its panel with no badge, as with LIVE').toEqual(withBadge);
    await thumb(page, NEXT).click();
    await expect(poster(page).locator('.badge-upcoming')).toBeVisible();
    expect(await sizes(page), 'and with "Starts in"').toEqual(withBadge);

    // Every thumbnail is the same 56px square, badge or none, and its badge sits inside it.
    const thumbs = await panel(page).locator('.front-gacha-thumb').evaluateAll((els) => els.map((el) => {
      const e = el as HTMLElement;
      const b = el.querySelector<HTMLElement>('.badge-live, .badge-upcoming');
      // The badge's box in the thumbnail's own coordinates (it is the offset parent).
      const inside = !b || (b.offsetLeft >= 0 && b.offsetTop >= 0 && b.offsetLeft + b.offsetWidth <= e.clientWidth && b.offsetTop + b.offsetHeight <= e.clientHeight);
      return { width: e.offsetWidth, height: e.offsetHeight, inside };
    }));
    expect(thumbs).toEqual([0, 1, 2].map(() => ({ width: 56, height: 56, inside: true })));
  });

  test('once every banner is over, and with no banners at all, no badge shows', async ({ page }) => {
    // The reader's clock a month on, on the same page: everything given has ended.
    expect(await openHome(page, (real) => fixture(realArt(real)), NOW + 30 * DAY)).toBe(true);
    await expect(thumb(page, NEXT)).toBeVisible();
    await expect(panel(page).locator('.countdown-timer')).toHaveText('Ended');
    await expect(panel(page).locator('.badge-live, .badge-upcoming')).toHaveCount(0);

    await page.unrouteAll({ behavior: 'wait' });
    expect(await openHome(page, () => [])).toBe(true);
    await expect(panel(page).getByText('No banners to show right now.')).toBeVisible();
    await expect(panel(page).locator('.badge-live, .badge-upcoming, .art-placeholder')).toHaveCount(0);
  });
});
