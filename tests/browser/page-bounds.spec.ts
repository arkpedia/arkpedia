import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { sectionCensus } from './section-census';
import { fontsSettled } from './census-routes';
import { baseline, BOUNDS_EXCLUDED as EXCLUDED, BOUNDS_SAMPLES as SAMPLES, boundsRoutes as routes, settled } from './layout-checks';

/*
 * Every page sits in the same frame as the nav: 1040px wide with a 24px gutter, so its
 * content spans 224-1216 at 1440 and 24-366 at 390, and its title starts where its
 * content starts (no-h1, h1-align, frame, page-scroll-x), its tab strips start on the
 * section edge (tab-align), its first content is 24px under the header hairline
 * (first-gap), nothing moves under prefers-reduced-motion (motion), and its first lines
 * start on their section's edge (stack-align, against stack-align-baseline.json). Since
 * r11 those are measured on every page by the layout census (layout-census.spec.ts), on
 * its one load of the page per width; the measurement and the route list are in
 * layout-checks.ts, and page-bounds-baseline.json stays {} (strict).
 *
 * What stays here: a driven state the census does not reach at these widths (the
 * planner dossier), the coverage test (every page file is measured or excluded with a
 * reason) and the 404 page in both themes.
 */

/* Reduced motion, so an entrance animation mid-flight is not measured as layout. */
const WIDTHS = [
  { key: 'd1440', use: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' } },
  { key: 'd390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' } },
] as const;

test('an artwork header keeps real text and controls inside the content frame', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/events/Duel%20Channel%3A%20Ivy%20Vine');
  await fontsSettled(page);
  await expect(page.locator('.page-header.artwork-heading')).toBeVisible();
  expect((await settled(page)).offences).toEqual([]);
  // The bare artwork header must keep its actual controls in the frame.
  await page.addStyleTag({content: '.page-header .back-btn { transform: translateX(-500px) !important; }'});
  expect((await settled(page)).offences).toContain('frame');
});

/* r9: a state the route list never shows -- the planner's operator dossier, which stacks
   its portrait band above the build at 640px and under (its content sat 16px in from the
   band). Strict: no card inset is accepted here. */
for (const width of WIDTHS) {
  test(`stack-align on the planner dossier at ${width.use.viewport.width}px`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewports, so it runs in one project');
    const context = await browser.newContext({ ...width.use, baseURL: info.project.use.baseURL });
    const page = await context.newPage();
    await page.goto("/operator-planner", { waitUntil: 'load' });
    await page.locator('#planner-search').fill('Amiya');
    await page.locator('#planner-search').press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('.simple-dossier')).toBeVisible();
    await fontsSettled(page);
    const census = await page.evaluate(sectionCensus, { stacks: true });
    const strays = (census.stacks ?? []).filter((x) => /simple-dossier|simple-portrait/.test(`${x.parent} ${x.child}`));
    expect(strays.map((x) => `${x.parent} > ${x.child} starts ${x.dx}px in (led by ${x.by}; ${x.flush} starts on it)`), 'the dossier starts every block on one edge').toEqual([]);
    await context.close();
  });
}

test('every page file is measured or excluded with a reason', ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'file system only');
  const dir = path.join(__dirname, '../../pages');
  const files = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(file => file.endsWith('.tsx'))
    .map(file => file.replace(/\.tsx$/, '').split(path.sep).join('/'));
  const unmeasured = files.filter(file => !EXCLUDED[file] && file.includes('[') && !SAMPLES[file]);
  expect(unmeasured, 'a dynamic page needs a sample address in SAMPLES, or a reason in EXCLUDED').toEqual([]);
  expect(baseline, 'page bounds are strict: page-bounds-baseline.json stays {}; fix the page instead of listing it').toEqual({});
  const baselineRoutes = new Set(Object.values(baseline).flatMap(entry => Object.keys(entry)));
  const known = new Set(routes());
  expect([...baselineRoutes].filter(route => !known.has(route)), 'baseline lists a route that is no longer measured').toEqual([]);
});

test('the 404 page is the site page, on the theme background, in both themes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  for (const theme of ['dark', 'light'] as const) {
    await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* none */ } }, theme);
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    const colours = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      theme: document.documentElement.getAttribute('data-theme') ?? 'dark',
    }));
    expect(colours.theme).toBe(theme);
    const probe = await page.evaluate((value) => {
      const el = document.createElement('div');
      el.style.backgroundColor = value;
      document.body.appendChild(el);
      const out = getComputedStyle(el).backgroundColor;
      el.remove();
      return out;
    }, colours.bg);
    expect(colours.body, `${theme}: the 404 body must be --bg`).toBe(probe);
  }
});
