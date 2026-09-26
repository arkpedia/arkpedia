import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/*
 * Every page sits in the same frame as the nav: 1040px wide with a 24px gutter, so its
 * content spans 224-1216 at 1440 and 24-366 at 390, and its title starts where its
 * content starts. The 2026-09-25 UI review measured that on 47 routes and found six
 * frames (1320px bodies under a 1040px search row, a 950px calendar, a 900px setup
 * view, a 631px column), four phone gutters (24/16/12/10px), headers nested inside
 * <main> so the title started 24px right of the grid, and two pages that scrolled
 * sideways at 390 after an interaction. Nothing failed for any of them.
 *
 * Per route and width this measures, on the rendered page:
 *   no-h1          the page has no h1 at all (a visually-hidden one is fine)
 *   h1-align       the visible h1's left edge is not the content's left edge
 *   frame          text, media or a drawn box lies outside the frame
 *                  (224-1216 at 1440; 24-366 at 390)
 *   page-scroll-x  the page itself scrolls sideways
 *
 * STRICT since the page families landed (2026-09-25): every measured page passes at
 * both widths, so tests/browser/page-bounds-baseline.json is {} and must stay so. Any
 * offence fails, and regenerating the baseline cannot accept one either:
 *
 *   UPDATE_BOUNDS_BASELINE=1 npx playwright test tests/browser/page-bounds.spec.ts --project=desktop
 *
 * still measures every page, but fails instead of writing if any page has an offence.
 * (It was a ratchet while the migrations shrank that file to {}.)
 *
 * Every page file under pages/ is either measured here or excluded below with a
 * reason, and a new page with neither fails the coverage test at the bottom.
 */
const BASELINE_FILE = path.join(__dirname, 'page-bounds-baseline.json');
const UPDATE = process.env.UPDATE_BOUNDS_BASELINE === '1';

/** One real address for each dynamic page. */
const SAMPLES: Record<string, string> = {
  'operators/[name]': '/operators/Amiya',
  'events/[slug]': '/events/Duel%20Channel%3A%20Ivy%20Vine',
  'stages/content/[id]': '/stages/content/act49side',
};

/** Page files that are not measured, and why. */
const EXCLUDED: Record<string, string> = {
  '_app': 'the app shell', '_document': 'the document shell',
  'gamemodes/stronghold-protocol/stronghold-companion': 'full-bleed by design: a play-beside-the-game tool',
  'recruitment/popout': 'full-bleed by design: hides the site chrome for a pop-out window',
  'home': 'redirects to /', 'events/index': 'redirects to /schedule', 'music/[albumId]': 'redirects to /music',
  'dev/index': 'development only (404 in production: measured through /404 below)',
  'dev/ui': 'development only: the primitives gallery (docs/development/ui-primitives.md)',
  'optimizer': 'development only (404 in production)',
  'bases/whole-base-optimizer': 'development only (404 in production)',
  '500': 'only rendered when a page throws; the same PageHeader markup as 404',
};

/** Page files -> the address measured for each. The 404 page is measured at an
 *  address that does not exist, which is how a reader reaches it. */
function routes(): string[] {
  const dir = path.join(__dirname, '../../pages');
  const files = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(file => file.endsWith('.tsx'))
    .map(file => file.replace(/\.tsx$/, '').split(path.sep).join('/'));
  const out: string[] = [];
  for (const file of files.sort()) {
    if (EXCLUDED[file]) continue;
    if (file === '404') { out.push('/this-page-does-not-exist'); continue; }
    if (file.includes('[')) { if (SAMPLES[file]) out.push(SAMPLES[file]); continue; }
    out.push('/' + file.replace(/(^|\/)index$/, ''));
  }
  return out.map(route => (route === '/' ? route : route.replace(/\/$/, '')));
}

type Offence = 'no-h1' | 'h1-align' | 'frame' | 'page-scroll-x';
type Baseline = Record<string, Record<string, Offence[]>>;

const baseline: Baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
const measured: Baseline = {};

interface Measurement {
  offences: Offence[];
  detail: string[];
}

/** Everything is measured in the page, in one pass, after the fonts are in. */
async function measure(page: Page): Promise<Measurement> {
  return page.evaluate(() => {
    const de = document.documentElement;
    // The width the page lays out in. html has scrollbar-gutter: stable, so where the
    // scrollbar is drawn (Linux and Windows Chromium) the frame centres in 1425 of 1440px,
    // nav and content alike; on macOS the scrollbar overlays and the width is the full 1440.
    const cw = Math.min(de.clientWidth, document.body.getBoundingClientRect().width);
    const frameLeft = cw >= 1040 ? (cw - 1040) / 2 + 24 : 24;
    const frameRight = cw >= 1040 ? (cw - 1040) / 2 + 1040 - 24 : cw - 24;
    const root = document.getElementById('page-content') || document.body;
    const styles = new Map<Element, CSSStyleDeclaration>();
    const cs = (el: Element) => { let s = styles.get(el); if (!s) { s = getComputedStyle(el); styles.set(el, s); } return s; };
    const fixedCache = new Map<Element, boolean>();
    const fixed = (el: Element | null): boolean => {
      if (!el || el === de) return false;
      let v = fixedCache.get(el);
      if (v === undefined) { v = cs(el).position === 'fixed' || fixed(el.parentElement); fixedCache.set(el, v); }
      return v;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('class') ? '.' + el.getAttribute('class')!.split(/\s+/)[0] : ''}`;
    const visible = (el: Element) => {
      const s = cs(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width >= 2 && r.height >= 2;
    };
    /** The horizontal window an element can be seen through: every clipping
     *  ancestor narrows it, so a row scrolled inside its own box is measured by the
     *  box, not by the content it scrolls. */
    const clip = (el: Element | null): [number, number] => {
      let l = -1e9;
      let r = 1e9;
      for (let e = el; e && e !== de && e !== document.body; e = e.parentElement) {
        const s = cs(e);
        if (s.position === 'fixed') break;
        if (s.display !== 'contents' && s.display !== 'inline' && (s.overflowX !== 'visible' || (s.clipPath && s.clipPath !== 'none'))) {
          const b = e.getBoundingClientRect();
          l = Math.max(l, b.left);
          r = Math.min(r, b.right);
        }
      }
      return [l, r];
    };

    const h1s = Array.from(root.querySelectorAll('h1')).filter(h => !fixed(h) && cs(h).display !== 'none');
    const shown = h1s.find(h => visible(h) && h.getBoundingClientRect().width > 2 && cs(h).clip === 'auto'
      && !h.classList.contains('visually-hidden'));
    const header = shown?.closest('header') ?? null;
    const skip = (el: Element) => !!(shown && (header ? header.contains(el) : shown.contains(el)));

    let left = Infinity;
    let right = -Infinity;
    let where = '';
    const take = (l: number, r: number, el: Element) => {
      if (l < left) { left = l; if (l < frameLeft - 1) where = where || `${name(el)} at x=${Math.round(l)}`; }
      if (r > right) { right = r; if (r > frameRight + 1) where = where || `${name(el)} to x=${Math.round(r)}`; }
    };
    /* Text: the rendered glyph boxes, clipped to their scrolling containers. */
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let headerLeft = Infinity;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || !n.nodeValue?.trim() || fixed(parent)) continue;
      const s = cs(parent);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      range.selectNodeContents(n);
      const rect = range.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const [cl, cr] = clip(parent);
      const l = Math.max(rect.left, cl);
      const r = Math.min(rect.right, cr);
      if (r - l < 1) continue;
      if (shown && shown.contains(parent)) { headerLeft = Math.min(headerLeft, l); }
      if (skip(parent)) {
        // The header's own text still has to be inside the frame.
        if (l < frameLeft - 1 || r > frameRight + 1) take(l, r, parent);
        continue;
      }
      take(l, r, parent);
    }
    /* Media, controls and drawn boxes (a background or a side border); a band as wide
       as the viewport is full-bleed decoration, not content. */
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (fixed(el) || !visible(el)) continue;
      const s = cs(el);
      const media = /^(IMG|SVG|CANVAS|VIDEO|INPUT|SELECT|BUTTON|TEXTAREA)$/i.test(el.tagName);
      const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
      const box = bg || (s.backgroundImage !== 'none') || parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0;
      if (!media && !box) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width >= cw - 2) continue;
      const [cl, cr] = clip(el.parentElement);
      const l = Math.max(rect.left, cl);
      const r = Math.min(rect.right, cr);
      if (r - l < 2) continue;
      if (skip(el)) {
        if (l < frameLeft - 1 || r > frameRight + 1) take(l, r, el);
        continue;
      }
      take(l, r, el);
    }

    const offences: string[] = [];
    const detail: string[] = [];
    if (!h1s.length) offences.push('no-h1');
    if (shown && isFinite(left) && isFinite(headerLeft) && Math.abs(headerLeft - left) > 1) {
      offences.push('h1-align');
      detail.push(`h1 starts at x=${Math.round(headerLeft)}, content at x=${Math.round(left)}`);
    }
    if (isFinite(left) && (left < frameLeft - 1 || right > frameRight + 1)) {
      offences.push('frame');
      detail.push(`content spans ${Math.round(left)}-${Math.round(right)}, frame is ${frameLeft}-${frameRight}${where ? ` (${where})` : ''}`);
    }
    if (de.scrollWidth > cw + 1) {
      offences.push('page-scroll-x');
      detail.push(`page is ${de.scrollWidth}px wide in a ${cw}px window`);
    }
    return { offences, detail } as { offences: never[]; detail: string[] };
  });
}

/* Reduced motion, so an entrance animation mid-flight is not measured as layout. */
const WIDTHS = [
  { key: 'd1440', use: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' } },
  { key: 'd390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' } },
] as const;

/** Measures until two readings 300ms apart agree (up to ~4s): some pages open a
 *  panel on a timer after load (/farming did, at 650ms), and a ratchet that also
 *  fails on a STALE entry cannot afford to catch a page halfway through settling. */
async function settled(page: Page): Promise<Measurement> {
  let last = await measure(page);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(300);
    const next = await measure(page);
    if (JSON.stringify(next) === JSON.stringify(last)) return next;
    last = next;
  }
  return last;
}

for (const width of WIDTHS) {
  test.describe(`page bounds at ${width.use.viewport.width}px`, () => {
    test.use(width.use);

    for (const route of routes()) {
      test(route, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'sets its own viewports, so it runs in one project');
        await page.goto(route, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const { offences, detail } = await settled(page);
        const known = baseline[width.key]?.[route] ?? [];
        if (offences.length) (measured[width.key] ??= {})[route] = offences;
        if (UPDATE) return;
        const fresh = offences.filter(o => !known.includes(o));
        const stale = known.filter(o => !offences.includes(o));
        expect(fresh, `${route} at ${width.key}: new bounds offences. ${detail.join('; ')}`).toEqual([]);
        expect(stale, `${route} at ${width.key}: fixed -- remove ${stale.join(', ')} from page-bounds-baseline.json (UPDATE_BOUNDS_BASELINE=1)`).toEqual([]);
      });
    }
  });
}

test.afterAll(() => {
  if (!UPDATE) return;
  if (Object.keys(measured).length) {
    throw new Error(`page bounds are strict; nothing written. Fix these pages instead: ${JSON.stringify(measured)}`);
  }
  const ordered: Baseline = {};
  for (const key of Object.keys(measured).sort()) {
    ordered[key] = Object.fromEntries(Object.entries(measured[key]).sort(([a], [b]) => a.localeCompare(b)));
  }
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
});

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
