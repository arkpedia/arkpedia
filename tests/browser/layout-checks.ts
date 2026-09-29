import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fontsSettled } from './census-routes';
import { rowCensus, type RowOffence, type RowTolerance } from './row-census';
import { tabAlign } from './tab-align';

/*
 * What the layout census (layout-census.spec.ts) holds each page to, and the tables that
 * say which page gets which check. Until r11 these were three specs, each loading the same
 * ~45 addresses in its own tests: cards-and-headings.spec.ts (headings, picture cards, the
 * button voice), page-bounds.spec.ts (the frame, tab-align, first-gap, stack-align) and
 * row-alignment.spec.ts (the row census). The code and every tolerance moved here as they
 * were; each block below says where it came from. The three specs keep their dedicated
 * tests (a driven page, a flip of a token or of the webfonts), which import from here.
 */

/* ======================================================================================
 * From cards-and-headings.spec.ts
 * ==================================================================================== */

/* --- r9 headings and spacing (headings-spacing) ------------------------------------
 * Every census route (the 2026-09-26 census: 45 addresses less the Stronghold companion,
 * full-bleed by design, and the 404), with how many section headings each shows at
 * least, so a selector that stopped matching fails rather than passing on nothing. The
 * counts are what a page always shows, not what it showed on the day: a panel that
 * depends on the clock (a banner, an open event, a live feed) is not counted.
 * On each: every section heading (.op-section h2, .section-title, .waiting-box h2) is
 * the canonical look -- Rajdhani 18px, 700, 0.03em, uppercase, --heading (never amber,
 * never the on-state --teal) -- and, in the dark theme, sits --heading-gap (14px) above
 * the first content under it, consecutive stacked .op-sections are --section-gap (36px)
 * apart, and every .entity-title is 22px at most and no larger than the section h2
 * above it (docs/development/ui-primitives.md rules 15 and 16). Gaps are box geometry,
 * so +-2px holds on CI's Linux fonts. tests/browser/section-census.ts measures, and
 * says what it leaves out (a disclosure header, a board of panels) and why.
 * The look runs in both themes, the gaps once (dark), and the light theme on the desktop
 * project only (colour does not change with the width). */
export const HEADING_ROUTES: Record<string, number> = {
  '/': 2, '/base': 0, '/community': 1, '/community/twitch': 0, '/community/videos': 0,
  '/community/youtube-live': 0, '/enemies': 0, '/events/Duel%20Channel%3A%20Ivy%20Vine': 0, '/farming': 3,
  '/gacha': 1, '/gamemodes': 0, '/gamemodes/stronghold-protocol': 1, '/games': 0, '/games/color-palette': 1,
  '/games/music-guesser': 0, '/games/operator-guesser': 1, '/games/recruitment-guesser': 1,
  '/games/stage-guesser': 1, '/music': 1, '/music/discover': 1, '/obtain-method': 0, '/operators': 0,
  '/operators/Amiya': 10, '/planner': 1, '/pulls': 3, '/recruitment': 2, '/results': 0, '/schedule': 0,
  '/skins': 1, '/stages': 1, '/stages/all': 0, '/stages/browse?s=ta-1': 2, '/stages/content/act49side': 1,
  '/stages/exploration': 2, '/stages/regular': 2, '/stages/score': 2, '/stages/seasonal': 2,
  '/stages/supplies': 0, '/support': 1, '/synergies': 10, '/techniques': 10,
};
export const HEADING_GAP = 14;
export const SECTION_GAP = 36;
/* --- end r9 headings and spacing ---------------------------------------------------- */

/* The home page's cards: no visible border at rest, the teal edge on hover (desktop). */
export const HOME_CARDS = ['.front-events-main', '.front-gacha-poster-wrap', '.front-featured-op', '.front-skin-item', '.front-community-item'];

/*
 * The picture-card census. #65 took the frame off the cards it named and left seventeen
 * classes framed at rest across the site (skin cards, banner items, enemy tiles, video
 * cards, the results page's portraits, the Terminal's stage cards...), so this does not
 * name cards: on each route it finds every visible link or button whose main content is
 * a picture -- an img, picture, video, canvas or svg image, or url() art on it, inside
 * it, or on their ::before/::after, at least 40x40 and covering at least half of the
 * control's box -- and requires no resting frame on the control or on any box that
 * frames the picture itself (the picture and its wrappers up to the control, where one
 * is the picture's size: a frame round the art inside a borderless link is the same grey
 * box). A frame is a visible border on three sides or more, so a divider, a status edge
 * or a rarity bar is not one; nor is a border in a rarity colour, which is data. A card
 * in an on state (pressed, selected, current, .active) keeps its teal edge. Controls
 * that only carry a small icon are not picture cards and keep --control-border.
 * The value is how many picture cards each route has at least, so an evaluator that
 * stopped finding them fails instead of passing on nothing. Three of these addresses are
 * not census routes (a second stage content page, a second operator, a rerun event): the
 * census loads them for this check alone.
 */
export const PICTURE_ROUTES: Record<string, number> = {
  '/': 1, '/skins': 1, '/gacha': 1, '/enemies': 1, '/community': 1, '/community/videos': 1, '/results': 1,
  '/music/discover': 1, '/games': 0, '/stages': 1, '/stages/content/act51side': 1, '/stages/regular': 1, '/stages/supplies': 0,
  [`/events/${encodeURIComponent('[Rerun] Under Tides Rerun')}`]: 1,
  '/operators': 1, '/operators/Amiya': 1, '/operators/Exusiai': 1, '/stages/all': 1, '/stages/score': 1, '/stages/exploration': 1, '/synergies': 1,
};
/* Content cards whose art is under half the card, so the census above does not count
   them; they are cards, not controls, and carry no resting frame either. Only the top,
   right and bottom edges are checked: .regular-now keeps an amber leading edge while it
   is running. */
export const CONTENT_CARDS: Record<string, string[]> = {
  '/stages/supplies': ['.supply-card'],
  '/stages/regular': ['a.regular-now', '.regular-tower'],
};

/** `edged`: the card or a box round its art has a border to paint (main's pattern, a
 *  transparent 1px border at rest). One with none at all -- the operator page's
 *  full-bleed artwork button -- has no edge to turn teal, and shows focus by the site's
 *  outline instead. */
/* --- picture-card states and rings (PR #69, 2026-09-28) --------------------------------
 * The maintainer, 2026-09-28: the /pulls skin wishlist's outfit tiles and /gacha's banner
 * list kept a resting border; no resting border, the teal edge on hover and focus, like
 * every other picture card. Two gaps let them through:
 *
 * - The wishlist's tiles show only once its tab opens, so no route above ever drew them.
 *   PICTURE_STATES are addresses the census drives after the load (PICTURE_DRIVES) for the
 *   picture check alone; the value is how many picture cards it shows at least.
 * - /gacha's banner cards had a transparent border and still drew a frame: their --panel-2
 *   background, painted under the border (background-clip: border-box), showed as a 1px
 *   ring round art that fills the padding box. ring() in pictureCards finds that on the
 *   card or on any box round its art. Box geometry and computed colours only. */
export const PICTURE_STATES: Record<string, number> = { '/pulls#skin-wishlist': 1 };
export const PICTURE_DRIVES: Record<string, (page: Page) => Promise<void>> = {
  '/pulls#skin-wishlist': async (page) => {
    await page.getByRole('button', { name: /Skin wishlist/ }).click();
    // The shops on offer are the data's, dropped once they close (lib/pulls/currentPlan.ts),
    // as pulls.spec.ts's caption test has it: with none listed there are no tiles to measure.
    test.skip(await page.getByText('No upcoming shop rotations are listed.').count() > 0, 'no skin shop rotation is listed in this build');
    await page.locator('.pulls-skin-option').first().waitFor();
  },
};

export interface PictureCard { id: number; name: string; size: string; on: boolean; edged: boolean; frames: string[] }

/** Every picture card on the page, each tagged data-picture-card=<id> and its picture
 *  data-picture-art=<id>, with the frames it draws at rest (empty when it has none). */
export async function pictureCards(page: Page): Promise<PictureCard[]> {
  return page.evaluate(() => {
    const ON = '[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"], [aria-current]:not([aria-current="false"]), .active, .current, .is-selected, .is-on';
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const colour = (value: string) => { probe.style.color = value; return getComputedStyle(probe).color; };
    const data = new Set([1, 2, 3, 4, 5, 6].flatMap((n) => [colour(`var(--rarity-${n})`), colour(`var(--rarity-fill-${n})`)]));
    probe.remove();
    const clear = (value: string) => value === 'transparent' || /^rgba\(\d+, \d+, \d+, 0\)$/.test(value);
    const frame = (el: Element) => {
      const cs = getComputedStyle(el);
      const drawn = ['top', 'right', 'bottom', 'left'].filter((side) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0
        && !['none', 'hidden'].includes(cs.getPropertyValue(`border-${side}-style`))
        && !clear(cs.getPropertyValue(`border-${side}-color`)) && !data.has(cs.getPropertyValue(`border-${side}-color`)));
      return drawn.length >= 3 ? `${cs.borderTopWidth} ${cs.borderTopColor}` : null;
    };
    // A transparent resting border that still shows a frame: the element's own background
    // painted under it (background-clip: border-box) round art that fills its padding box,
    // or an img's own background under its own border (PR #69).
    const ring = (el: Element, art: Element) => {
      const cs = getComputedStyle(el);
      const sides = ['top', 'right', 'bottom', 'left'];
      const widths = sides.map((side) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
      const open = sides.filter((side, i) => widths[i] > 0 && !['none', 'hidden'].includes(cs.getPropertyValue(`border-${side}-style`)) && clear(cs.getPropertyValue(`border-${side}-color`)));
      if (open.length < 3 || cs.backgroundClip.split(',')[0].trim() !== 'border-box') return null;
      const fill = !clear(cs.backgroundColor) ? cs.backgroundColor : (cs.backgroundImage.match(/gradient/) ? 'a gradient' : null);
      if (!fill) return null;
      if (el !== art) {
        const r = el.getBoundingClientRect(), a = art.getBoundingClientRect();
        const inner = { top: r.top + widths[0], right: r.right - widths[1], bottom: r.bottom - widths[2], left: r.left + widths[3] };
        if (a.top > inner.top + 1 || a.right < inner.right - 1 || a.bottom < inner.bottom - 1 || a.left > inner.left + 1) return null;
      } else if (!['img', 'video', 'canvas'].includes(el.tagName.toLowerCase())) return null;
      return `its ${fill} background shows through the transparent border (background-clip: border-box)`;
    };
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1 && getComputedStyle(el).visibility !== 'hidden' && el.checkVisibility();
    };
    const name = (el: Element) => el.tagName.toLowerCase() + [...el.classList].map((c) => `.${c}`).join('');
    const art = (value: string) => value.includes('url(');
    const cards: PictureCard[] = [];
    for (const el of Array.from(document.querySelectorAll('a[href], button, [role="button"]'))) {
      if (!shown(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 40 || box.height < 40) continue;
      let picture: { node: Element; area: number } | null = null;
      for (const node of [el, ...Array.from(el.querySelectorAll('*'))]) {
        if (node !== el && !shown(node)) continue;
        const cs = getComputedStyle(node);
        const isPicture = ['img', 'picture', 'video', 'canvas', 'image'].includes(node.tagName.toLowerCase()) || art(cs.backgroundImage)
          || ['::before', '::after'].some((at) => { const ps = getComputedStyle(node, at); return ps.content !== 'none' && art(ps.backgroundImage); });
        if (!isPicture) continue;
        const r = node.getBoundingClientRect();
        const w = Math.min(r.right, box.right) - Math.max(r.left, box.left), h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
        if (w < 40 || h < 40 || w * h < 0.5 * box.width * box.height) continue;
        if (!picture || w * h > picture.area) picture = { node, area: w * h };
      }
      if (!picture) {
        // Not a picture card (its art is under half the box), so the control keeps its own
        // border; but a frame round the art inside it is still the grey box this rule
        // removes (the operator page's guide video thumbnails, 2026-09-26). Any link or
        // button of 100x60 or more with a picture of 40x40 or more is checked for that.
        if (box.width < 100 || box.height < 60) continue;
        let inner: { node: Element; area: number } | null = null;
        for (const node of Array.from(el.querySelectorAll('img, picture, video, canvas, image'))) {
          if (!shown(node)) continue;
          const r = node.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) continue;
          if (!inner || r.width * r.height > inner.area) inner = { node, area: r.width * r.height };
        }
        if (!inner) continue;
        const innerBox = inner.node.getBoundingClientRect();
        const innerFrames: string[] = [];
        for (let node: Element | null = inner.node; node && node !== el; node = node.parentElement) {
          const r = node.getBoundingClientRect();
          if (r.width * r.height > 1.6 * innerBox.width * innerBox.height) break;
          const drawn = frame(node);
          if (drawn) innerFrames.push(`${name(node)} round the art: ${drawn}`);
        }
        if (innerFrames.length) {
          const id = cards.length;
          el.setAttribute('data-picture-card', String(id));
          inner.node.setAttribute('data-picture-art', String(id));
          cards.push({ id, name: name(el), size: `${Math.round(box.width)}x${Math.round(box.height)}`, on: el.matches(ON), edged: true, frames: innerFrames });
        }
        continue;
      }
      const frames: string[] = [];
      const own = frame(el);
      if (own) frames.push(`the card: ${own}`);
      const ringed = ring(el, picture.node);
      if (ringed) frames.push(`the card: ${ringed}`);
      const hasBorder = (node: Element) => { const cs = getComputedStyle(node); return parseFloat(cs.borderTopWidth) > 0 && !['none', 'hidden'].includes(cs.borderTopStyle); };
      let edged = hasBorder(el);
      const pictureBox = picture.node.getBoundingClientRect();
      for (let node: Element | null = picture.node; node && node !== el; node = node.parentElement) {
        const r = node.getBoundingClientRect();
        if (r.width * r.height < 0.9 * pictureBox.width * pictureBox.height) continue;
        const drawn = frame(node);
        if (drawn) frames.push(`${name(node)} round the art: ${drawn}`);
        const ringedArt = ring(node, picture.node);
        if (ringedArt) frames.push(`${name(node)} round the art: ${ringedArt}`);
        edged ||= hasBorder(node);
      }
      const id = cards.length;
      el.setAttribute('data-picture-card', String(id));
      picture.node.setAttribute('data-picture-art', String(id));
      cards.push({ id, name: name(el), size: `${Math.round(box.width)}x${Math.round(box.height)}`, on: el.matches(ON), edged, frames });
    }
    return cards;
  });
}

/** The theme the page is in: no data-theme attribute means the default, dark. */
export const themeOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'dark');

/** The colour a probe painted with the given custom property computes to. */
export async function tokenColour(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

/* ---- The button voice stays on buttons (r9 controls) --------------------------------
 * Buttons are Rajdhani, uppercase, 0.09em (ui-primitives). A card that is a <button>
 * takes .btn-bare, which skips the base button rule; without it the card inherits the
 * rule's uppercase and tracking onto its own font. The 2026-09-26 census found the
 * Stronghold enemy rows (.gm-row) and the Isomorph row (.gm-opwho) in Inter 16,
 * uppercase at 0.09em, and the /gacha featured-operator chips in Inter 11 at 0.09em
 * (they reset the case, not the tracking). The signature is the base rule's 0.09em
 * tracking computed on Inter or JetBrains Mono, with or without its uppercase: no
 * page sets 0.09em on those faces on purpose. Every address and driven state the
 * census visited; desktop only, since no page switches a button's face by width.
 * It reads computed styles, not glyph metrics, so CI's fonts do not change it. */
export async function buttonVoiceLeaks(page: Page) {
  const leaks = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], a.btn, a.ghost, a.primary, a.danger'))
    .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
    .map((el) => {
      const cs = getComputedStyle(el);
      const face = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const em = (parseFloat(cs.letterSpacing) || 0) / parseFloat(cs.fontSize);
      return { el: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, face, transform: cs.textTransform, em: Math.round(em * 1000) / 1000, text: (el.textContent ?? '').trim().slice(0, 30) };
    })
    .filter((b) => /^(?:Inter|JetBrains Mono)$/.test(b.face) && Math.abs(b.em - 0.09) < 0.006));
  return [...new Map(leaks.map((b) => [b.el, b])).values()];
}

/* ======================================================================================
 * From page-bounds.spec.ts
 * ==================================================================================== */

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
 *   tab-align      a tab strip or pick-one row that leads its line starts off the
 *                  section's edge, or stretches its items (tests/browser/tab-align.ts),
 *                  in either theme
 *   first-gap      (r9) the first content in <main> is not 24px (+-2) under the page
 *                  header's hairline; see FIRST_GAP below for the two documented others
 *   motion         an animation that moves content (its keyframes change transform,
 *                  translate, scale, rotate or an inset) runs under prefers-reduced-motion:
 *                  reduce. The page is measured with reduced motion so nothing is caught
 *                  mid-flight; the /operators cards rose 24px in anyway, because their
 *                  override lost the cascade, and first-gap read 26.5px under load
 *
 * and, against its own baseline (stack-align-baseline.json, below), stack-align: a
 * child whose first line starts 3-120px right of its parent's content edge while a
 * sibling starts on it (tests/browser/section-census.ts).
 *
 * STRICT since the page families landed (2026-09-25): every measured page passes at
 * both widths, so tests/browser/page-bounds-baseline.json is {} and must stay so. Any
 * offence fails, and regenerating the baseline cannot accept one either:
 *
 *   UPDATE_BOUNDS_BASELINE=1 npx playwright test layout-census.spec
 *
 * still measures every page, but fails instead of writing if any page has an offence.
 * (It was a ratchet while the migrations shrank that file to {}.)
 *
 * Every page file under pages/ is either measured here or excluded below with a
 * reason, and a new page with neither fails the coverage test in page-bounds.spec.ts.
 */
export const BASELINE_FILE = path.join(__dirname, 'page-bounds-baseline.json');
export const UPDATE = process.env.UPDATE_BOUNDS_BASELINE === '1';

/** One real address for each dynamic page. */
export const BOUNDS_SAMPLES: Record<string, string> = {
  'operators/[name]': '/operators/Amiya',
  'events/[slug]': '/events/Duel%20Channel%3A%20Ivy%20Vine',
  'stages/content/[id]': '/stages/content/act49side',
};

/** Page files that are not measured, and why. */
export const BOUNDS_EXCLUDED: Record<string, string> = {
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
export function boundsRoutes(): string[] {
  const dir = path.join(__dirname, '../../pages');
  const files = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(file => file.endsWith('.tsx'))
    .map(file => file.replace(/\.tsx$/, '').split(path.sep).join('/'));
  const out: string[] = [];
  for (const file of files.sort()) {
    if (BOUNDS_EXCLUDED[file]) continue;
    if (file === '404') { out.push('/this-page-does-not-exist'); continue; }
    if (file.includes('[')) { if (BOUNDS_SAMPLES[file]) out.push(BOUNDS_SAMPLES[file]); continue; }
    out.push('/' + file.replace(/(^|\/)index$/, ''));
  }
  return out.map(route => (route === '/' ? route : route.replace(/\/$/, '')));
}

export type Offence = 'no-h1' | 'h1-align' | 'frame' | 'page-scroll-x' | 'tab-align' | 'first-gap' | 'motion';
export type Baseline = Record<string, Record<string, Offence[]>>;

export const baseline: Baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};

export interface Measurement {
  offences: Offence[];
  detail: string[];
}

/** Everything is measured in the page, in one pass, after the fonts are in. */
export async function measure(page: Page): Promise<Measurement> {
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

/** Every CSS animation the page holds, running or finished (a fill keeps a finished
 *  one), whose keyframes move content: none may exist under reduced motion. */
export async function movingAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() => [...new Set(document.getAnimations()
    .filter((a) => (a as CSSAnimation).animationName && (a.effect as KeyframeEffect | null)?.getKeyframes().some((k) => ['transform', 'translate', 'scale', 'rotate', 'top', 'left', 'right', 'bottom'].some((p) => p in k)))
    .map((a) => { const t = (a.effect as KeyframeEffect).target as Element | null; return `${(a as CSSAnimation).animationName} on ${t ? `${t.tagName.toLowerCase()}.${String(t.className).trim().split(/\s+/)[0]}` : '?'}`; }))]);
}

/** The tab census (tab-align.ts) in the dark theme and again in the light one. The
 *  theme is the data-theme attribute on <html>, so it is flipped in place rather than
 *  by a second load, and put back as it was. Tolerance 2px: the heading edge is a text
 *  node's inline start. */
export async function tabAlignBothThemes(page: Page): Promise<string[]> {
  const out: string[] = [];
  const was = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => {
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
    }, theme);
    for (const o of await page.evaluate(tabAlign, { tolerance: 2 })) out.push(`tab-align (${theme}) ${o.kind}: ${o.group}: ${o.detail}`);
  }
  await page.evaluate((t) => { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }, was);
  return [...new Set(out)];
}
/* --- r9 first-gap and stack-align (headings-spacing) --------------------------------
 * first-gap: every page starts its content 24px under the header hairline (main's
 * padding-top; docs/development/ui-primitives.md rule 15). The census measured 24px on
 * 43 views and 12-44px on 13: a section h2's inherited 18px top margin (/community 42),
 * a first paragraph's own margin (/support 40, /base 35), an empty state's 20px margin
 * (Twitch, YouTube live 44), /farming's own 12px. Two documented others:
 *   - a Terminal scene (main.terminal-scene) at 700px and under is 14px: the slim
 *     Terminal pages give their first screen to the tool (stages-terminal.css)
 *   - the operator page is 16px: a workspace bounded to the viewport under a slim
 *     header, every pixel of which comes out of the artwork (OperatorPage.module.css)
 * The gap is box geometry (margins and padding), +-2px. */
export const FIRST_GAP = 24;
export const FIRST_GAP_OTHERS: Record<string, { gap: number; why: string }> = {
  '/operators/Amiya': { gap: 16, why: 'a viewport-bounded workspace under a slim header' },
};
/* stack-align: the accepted cases are the picture cards whose text keeps --card-inset from
 * their flush art (the card's teal hover edge boxes it; maintainer, 2026-09-26). Each is
 * accepted only where its content box starts at --card-inset (+-1px; layout, not glyphs),
 * so the baseline holds them to ONE inset; everything else is strict, and an accepted
 * entry that no page shows any more is stale and fails. */
export const STACK_BASELINE_FILE = path.join(__dirname, 'stack-align-baseline.json');
/* The census writes the accepted insets each page bounds run saw here, one file per page and
   width; the stale check (layout-census-after.spec.ts) reads them once both projects are done.
   Playwright empties the output directory at the start of every run. */
export const stackDir = (info: TestInfo) => path.join(info.project.outputDir, 'layout-census-stack-align');
/* `optional`: an entry that shows only on some days (a card in a date window, a stage
   open by weekday), so the stale check leaves it alone; it is still held to the inset. */
export const stackBaseline: { accepted: { parent: string; child: string; why: string; optional?: boolean }[] } = JSON.parse(fs.readFileSync(STACK_BASELINE_FILE, 'utf8'));
/* --- end r9 first-gap and stack-align ----------------------------------------------- */

/** Measures until two readings 300ms apart agree (up to ~4s): some pages open a
 *  panel on a timer after load (/farming did, at 650ms), and a ratchet that also
 *  fails on a STALE entry cannot afford to catch a page halfway through settling. */
export async function settled(page: Page): Promise<Measurement> {
  let last = await measure(page);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(300);
    const next = await measure(page);
    if (JSON.stringify(next) === JSON.stringify(last)) return next;
    last = next;
  }
  return last;
}

/* ======================================================================================
 * Images load as the reader nears them (lazy-images, 2026-09-29)
 * ==================================================================================== */

/*
 * "can you implement lazy loading for all, like operators don't have lazy loading"
 * (maintainer, 2026-09-29). On 2026-09-29 /operators/Amiya fetched eight icons at load
 * from one to five screens down its panel (ContentImg was eager unless each caller said
 * otherwise), /pulls four more, and the pages' heroes -- /gacha's banner, the home
 * page's posters -- were lazy like any icon. ContentImg and ContentImage are lazy now,
 * and eager only through `priority` (components/content/ContentImage.tsx).
 *
 * On the census's page load (the page-bounds load: the load event, at the top), every
 * <img> the page will fetch is held to it:
 *   - an eager image that EAGER_ALLOWED does not name for the page fails, wherever it is;
 *   - a named hero more than LAZY_FOLD screens below the top fails too (a hero is on the
 *     first screen, or it is not one);
 *   - a named hero drawn lazy fails (its `priority` was dropped), and one the page does not
 *     show at all fails as stale unless it is `optional` (a panel that shows only while an
 *     event or banner runs).
 * A data: or blob: image fetches nothing (next/image makes those eager) and is left out.
 * The static half is scripts/tests/test-image-loading.ts: ContentImg's default, and every
 * `priority` in the source, each with its reason.
 */
/** How far below the top of the screen, in screen heights, an image may be eager at all. */
export const LAZY_FOLD = 1.25;
export interface EagerAllowed { selector: string; why: string; optional?: boolean }
export const EAGER_ALLOWED: Record<string, EagerAllowed[]> = {
  '/operators/Amiya': [{ selector: '.op-carousel-img-enter img', why: 'the outfit on screen: the page\'s hero, its LCP at 1440 and 390' }],
  '/': [
    { selector: '.front-events-poster-wrap img', why: 'the first event\'s poster: the home page\'s LCP at 1440', optional: true },
    { selector: '.front-gacha-poster-wrap img', why: 'the first banner\'s art: the home page\'s LCP at 390', optional: true },
  ],
  '/gacha': [{ selector: 'img.gacha-banner-main-image', why: 'the chosen banner\'s art: the page\'s LCP at 1440 and 390 (none until the art is published)', optional: true }],
  '/stages': [{ selector: '.terminal-lead-art img', why: 'the event the Terminal leads with: the page\'s LCP (none between events)', optional: true }],
};

/** Runs in the page: the load's offences against EAGER_ALLOWED[route], as sentences. */
export function imageLoading({ allowed, fold }: { allowed: EagerAllowed[]; fold: number }): string[] {
  const name = (img: HTMLImageElement) => {
    const where = img.closest('[class]');
    const cls = (typeof where?.className === 'string' ? where.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const src = decodeURIComponent((img.currentSrc || img.getAttribute('src') || img.srcset || '').split('/').pop() ?? '').slice(0, 48);
    return `${img === where ? 'img' : `${where?.tagName.toLowerCase() ?? ''}${cls ? `.${cls}` : ''} img`} "${src}" at ${(img.getBoundingClientRect().top / innerHeight).toFixed(2)} screens`;
  };
  const fetched = Array.from(document.images).filter((img) => {
    const src = img.getAttribute('src') ?? '';
    return !!(src || img.srcset || img.closest('picture')) && !/^(data|blob):/.test(src);
  });
  const eager = (img: HTMLImageElement) => img.loading !== 'lazy';
  const out: string[] = [];
  for (const img of fetched) {
    const hero = allowed.find((a) => img.matches(a.selector));
    const far = img.getBoundingClientRect().top > innerHeight * fold;
    if (eager(img) && !hero) out.push(`${name(img)} is eager (loading="${img.getAttribute('loading') ?? 'auto'}"): a picture that is not the page's hero waits for the reader (ContentImg / ContentImage, no priority)`);
    else if (eager(img) && far) out.push(`${name(img)} is a hero more than ${fold} screens down: ${hero!.why}`);
  }
  for (const a of allowed) {
    const matches = fetched.filter((img) => img.matches(a.selector));
    if (!matches.length) { if (!a.optional) out.push(`the hero ${a.selector} is not on the page (${a.why}): stale in EAGER_ALLOWED, or its selector drifted`); continue; }
    if (!matches.some(eager)) out.push(`the hero ${a.selector} is lazy (${a.why}): it lost its priority`);
    else if (!matches.filter(eager).some((img) => img.getAttribute('fetchpriority') === 'high')) out.push(`the hero ${a.selector} is eager but not fetchpriority="high"`);
  }
  return out;
}

/* ======================================================================================
 * From row-alignment.spec.ts
 * ==================================================================================== */

/*
 * One line (docs/development/ui-primitives.md rule 4): in a row, a button, input or
 * select and the text beside it share one vertical centre, and the controls in it
 * share one height, --control-h.
 *
 * The census (row-census.ts) went over 41 routes and seven driven states (the /pulls
 * panels, /recruitment with tags and its cheat sheet, the stage guesser's own list) at
 * 1440 and 390 on 2026-09-26 and found five: the /pulls goal row (Until, Available,
 * All goals and Left 9px above the Pulls input and the remove button, lifted by the
 * space reserved for an empty caption), the /pulls forecast date (9px above the picked
 * banner's taller dropdown, both top-aligned), the /skins result count (9px above
 * Reset filters, lifted by .hint's bottom margin), the operator page credits (the
 * language label 4px above the voice actor's button, both top-aligned at different
 * heights) and the /planner search row (Clear 5px below the search field's centre).
 * The r9 census (2026-09-26, 45 addresses and twelve driven states) added the control
 * heights: six primitive heights side by side (tgl 32, ghost 33, chip 32/36, select 38,
 * search 38/40, button 44) and the rows pages had patched by hand, and three more rows
 * off their centre (the /operators/Amiya name row 15px, the /gacha dialogs' close 18px
 * and 7px, the planner level dialog's title 5.7px). One token, --control-h, fixed the
 * heights; each row is fixed at its source.
 *
 * STRICT on every page and state the census visited, at 1440 and 390: centres within
 * CENTRE px (glyph boxes come from the font, and CI's Linux fonts are not the Mac's,
 * so 2, not 1) and heights within HEIGHT px (a control's height is --control-h, a
 * min-height, whatever the font). A new page is measured without being listed here:
 * the addresses and states are census-routes.ts's, from pages/ as in page-bounds.spec.ts.
 *
 * What is not a failure is in ALLOWED, each with its reason, and an entry that matches
 * nothing on its page fails as stale, so the list only shrinks.
 */
export const TOLERANCE: RowTolerance = { centre: 2, height: 1 };

/** An accepted offence: `route` (as the test names it) and the width (1440 or 390),
 *  then the offence's fields as regular expressions. Every entry says why. */
interface Allowed { route: string; width?: 1440 | 390; kind: RowOffence['kind']; container: RegExp; control?: RegExp; beside?: RegExp; why: string }

export const ALLOWED: Allowed[] = [
];

/** The census's two widths: the desktop project is 1440 wide, and the mobile one (a
 *  Pixel 7, 412 wide) is narrowed to the census's 390. */
export async function censusWidth(page: Page): Promise<1440 | 390> {
  if (page.viewportSize()!.width >= 1000) return 1440;
  await page.setViewportSize({ width: 390, height: 844 });
  return 390;
}

export async function census(page: Page): Promise<RowOffence[]> {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await fontsSettled(page);
  return page.evaluate(rowCensus, TOLERANCE);
}

/** Fails on an offence ALLOWED does not name, and on an entry for this page that
 *  matched nothing (it is stale: delete it). `check` is expect (a dedicated test) or
 *  expect.soft (the layout census, which goes on to its other checks); `at` prefixes the
 *  messages (the census names the check, the width and the theme; a dedicated test ''). */
export function expectOnlyAllowed(check: typeof expect, at: string, offences: RowOffence[], route: string, width: number) {
  const mine = ALLOWED.filter((a) => a.route === route && (!a.width || a.width === width));
  const used = new Set<Allowed>();
  const fresh = offences.filter((o) => {
    const hit = mine.find((a) => a.kind === o.kind && a.container.test(o.container) && (!a.control || a.control.test(o.control)) && (!a.beside || a.beside.test(o.beside)));
    if (hit) used.add(hit);
    return !hit;
  });
  check(fresh, `${at}rows off one line or one height on ${route} at ${width}`).toEqual([]);
  check(mine.filter((a) => !used.has(a)).map((a) => a.why), `${at}stale ALLOWED entries for ${route} at ${width}`).toEqual([]);
}
