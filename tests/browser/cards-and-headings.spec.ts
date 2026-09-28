import { expect, test, type Page } from '@playwright/test';
import { CENSUS_STATES, censusRoutes, fontsSettled, openCensus } from './census-routes';
import { sectionCensus } from './section-census';

/*
 * Two maintainer decisions from 2026-09-26, after the site-wide restyle:
 *
 * - Section headings are teal-ish (--heading), not amber, and not the --teal that marks
 *   an on/current state either.
 * - Picture and content cards carry no resting frame: the art already says they can be
 *   clicked, and a grey box around every poster, portrait and tile was noise. They draw
 *   the teal edge on hover and keyboard focus. Real controls keep --control-border.
 */

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
 * says what it leaves out (a disclosure header, a board of panels) and why. */
const HEADING_ROUTES: Record<string, number> = {
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
const HEADING_GAP = 14;
const SECTION_GAP = 36;
/* --- end r9 headings and spacing ---------------------------------------------------- */
const HOME_CARDS = ['.front-events-main', '.front-gacha-poster-wrap', '.front-featured-op', '.front-skin-item', '.front-community-item'];

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
 * stopped finding them fails instead of passing on nothing.
 */
const PICTURE_ROUTES: Record<string, number> = {
  '/': 1, '/skins': 1, '/gacha': 1, '/enemies': 1, '/community': 1, '/community/videos': 1, '/results': 1,
  '/music/discover': 1, '/games': 0, '/stages': 1, '/stages/content/act51side': 1, '/stages/regular': 1, '/stages/supplies': 0,
  [`/events/${encodeURIComponent('[Rerun] Under Tides Rerun')}`]: 1,
  '/operators': 1, '/operators/Amiya': 1, '/operators/Exusiai': 1, '/stages/all': 1, '/stages/score': 1, '/stages/exploration': 1, '/synergies': 1,
};
/* Content cards whose art is under half the card, so the census above does not count
   them; they are cards, not controls, and carry no resting frame either. Only the top,
   right and bottom edges are checked: .regular-now keeps an amber leading edge while it
   is running. */
const CONTENT_CARDS: Record<string, string[]> = {
  '/stages/supplies': ['.supply-card'],
  '/stages/regular': ['a.regular-now', '.regular-tower'],
};

/* --- r11 picture-card states and rings (2026-09-28) ------------------------------------
 * The maintainer, 2026-09-28: the /pulls skin wishlist's outfit tiles and /gacha's banner
 * list kept a resting border; no resting border, the teal edge on hover and focus, like
 * every other picture card. Two gaps let them through:
 *
 * - The wishlist's tiles show only once its tab opens, so no route above ever drew them.
 *   PICTURE_STATES are routes with a #state the loop drives after the page loads (the
 *   drive is PICTURE_DRIVES[route]); the value is how many picture cards it shows at least.
 * - /gacha's banner cards had a transparent border and still drew a frame: their art is
 *   inset 0 in the padding box, and their --panel-2 background, painted under the border
 *   (background-clip: border-box), showed as a 1px ring round it (231 on the light
 *   sidebar's 251). ring() below finds that on the card or on any box round its art: a
 *   transparent resting border with the element's own background painted under it round
 *   art that fills its padding box (or, on an img or video, its own background under its
 *   own border). The r11 scan found the same ring on twelve other picture cards across
 *   the site (home, /enemies, /results, /music/discover, the Terminal, /stages, /operators
 *   and the video cards), all now clipped to the padding box. Box geometry and computed
 *   colours only, so the same on any font. */
const PICTURE_STATES: Record<string, number> = { '/pulls#skin-wishlist': 1 };
const PICTURE_DRIVES: Record<string, (page: Page) => Promise<void>> = {
  '/pulls#skin-wishlist': async (page) => {
    await page.getByRole('button', { name: /Skin wishlist/ }).click();
    // The shops on offer are the data's, dropped once they close (lib/pulls/currentPlan.ts),
    // as pulls.spec.ts's caption test has it: with none listed there are no tiles to measure.
    test.skip(await page.getByText('No upcoming shop rotations are listed.').count() > 0, 'no skin shop rotation is listed in this build');
    await page.locator('.pulls-skin-option').first().waitFor();
  },
};
/* --- end r11 picture-card states and rings --------------------------------------------- */

/** `edged`: the card or a box round its art has a border to paint (main's pattern, a
 *  transparent 1px border at rest). One with none at all -- the operator page's
 *  full-bleed artwork button -- has no edge to turn teal, and shows focus by the site's
 *  outline instead. */
interface PictureCard { id: number; name: string; size: string; on: boolean; edged: boolean; frames: string[] }

/** Every picture card on the page, each tagged data-picture-card=<id> and its picture
 *  data-picture-art=<id>, with the frames it draws at rest (empty when it has none). */
async function pictureCards(page: Page): Promise<PictureCard[]> {
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
    // r11: a transparent resting border that still shows a frame -- the element's own
    // background painted under it (background-clip: border-box) round art that fills its
    // padding box, or an img's own background under its own border.
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
      const ringed = ring(el, picture.node); // r11
      if (ringed) frames.push(`the card: ${ringed}`);
      const hasBorder = (node: Element) => { const cs = getComputedStyle(node); return parseFloat(cs.borderTopWidth) > 0 && !['none', 'hidden'].includes(cs.borderTopStyle); };
      let edged = hasBorder(el);
      const pictureBox = picture.node.getBoundingClientRect();
      for (let node: Element | null = picture.node; node && node !== el; node = node.parentElement) {
        const r = node.getBoundingClientRect();
        if (r.width * r.height < 0.9 * pictureBox.width * pictureBox.height) continue;
        const drawn = frame(node);
        if (drawn) frames.push(`${name(node)} round the art: ${drawn}`);
        const ringed = ring(node, picture.node); // r11
        if (ringed) frames.push(`${name(node)} round the art: ${ringed}`);
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
const themeOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'dark');

/** The colour a probe painted with the given custom property computes to. */
async function tokenColour(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* none */ } }, theme);
    });

    // r9: one test per route; the look in both themes, the geometry once (dark), and the
    // light theme on the desktop project only (colour does not change with the width).
    for (const [route, least] of Object.entries(HEADING_ROUTES)) {
      test(`section headings on ${decodeURIComponent(route)}: one look, --heading-gap under, --section-gap between`, async ({ page }, info) => {
        test.skip(theme === 'light' && info.project.name !== 'desktop', 'colour is width-independent: the light theme runs once');
        await page.goto(route);
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await fontsSettled(page);
        expect(await themeOf(page), `the page is in the ${theme} theme`).toBe(theme);
        const heading = await tokenColour(page, '--heading');
        const amber = await tokenColour(page, '--amber');
        const teal = await tokenColour(page, '--teal');
        expect(heading, 'the heading colour is its own token').not.toBe(teal);
        // A page that fetches its sections after it hydrates can go network-quiet before
        // the fetch starts: /stages/browse's rail comes from /stages-index.json on mount,
        // and in the Linux image the test measured "Loading the stage list..." with no
        // heading drawn. So the headings are awaited, then the network once more.
        await expect.poll(async () => (await page.evaluate(sectionCensus, { stacks: false })).headings.length, { message: `${route} draws at least ${least} section heading(s)`, timeout: 15000 }).toBeGreaterThanOrEqual(least);
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        const census = await page.evaluate(sectionCensus, { stacks: false });
        expect(census.headings.length, `${route} shows at least ${least} section heading(s)`).toBeGreaterThanOrEqual(least);
        for (const h of census.headings) {
          const at = `${route} "${h.text}"`;
          expect(h.colour, `${at} is not amber`).not.toBe(amber);
          expect(h.colour, `${at} uses --heading`).toBe(heading);
          expect(h.size, `${at} is 18px`).toBe(18);
          expect(h.weight, `${at} is 700`).toBe('700');
          expect(h.tracking, `${at} is tracked 0.03em`).toBeCloseTo(0.03, 3);
          expect(h.transform, `${at} is uppercase`).toBe('uppercase');
        }
        for (const e of census.entities) {
          expect(e.size, `${route} entity title "${e.text}" is 22px at most`).toBeLessThanOrEqual(22);
          if (e.sectionSize !== null) expect(e.size, `${route} entity title "${e.text}" is no larger than the section h2 "${e.sectionHeading}" above it`).toBeLessThanOrEqual(e.sectionSize);
        }
        if (theme !== 'dark') return;
        const gaps = census.headings.filter((h) => h.gap !== null && Math.abs(h.gap - HEADING_GAP) > 2).map((h) => `"${h.text}" -> ${h.next}: ${h.gap}px`);
        expect(gaps, `${route}: section headings not ${HEADING_GAP}px (+-2) above the first content under them`).toEqual([]);
        const stacked = census.sections.filter((g) => Math.abs(g.gap - SECTION_GAP) > 2).map((g) => `${g.a} -> ${g.b}: ${g.gap}px`);
        expect(stacked, `${route}: stacked .op-sections not ${SECTION_GAP}px (+-2) apart`).toEqual([]);
      });
    }

    for (const [route, least] of Object.entries({ ...PICTURE_ROUTES, ...PICTURE_STATES })) {
      test(`picture cards on ${decodeURIComponent(route)} have no resting frame, and a teal edge on hover`, async ({ page }, info) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await PICTURE_DRIVES[route]?.(page); // r11
        expect(await themeOf(page), `the page is in the ${theme} theme`).toBe(theme);
        const cards = await pictureCards(page);
        expect(cards.length, `${route} has at least ${least} picture card(s)`).toBeGreaterThanOrEqual(least);
        const framed = [...new Map(cards.filter((card) => !card.on && card.frames.length).map((card) => [card.name, `${card.name} (${card.size}): ${card.frames.join('; ')}`])).values()];
        expect(framed, `${route}: picture cards framed at rest`).toEqual([]);
        for (const selector of CONTENT_CARDS[route] ?? []) {
          const edges = await page.locator(selector).evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0)
            .map((el) => { const cs = getComputedStyle(el); return [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor]; }));
          expect(edges.length, `${route} shows ${selector}`).toBeGreaterThan(0);
          for (const colours of edges) {
            for (const edge of colours) expect(edge, `${selector} has no visible border at rest`).toMatch(/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/);
          }
        }
        if (info.project.name !== 'desktop') return;
        // Hover and keyboard focus draw the teal edge, round the card or round its art:
        // one card of each kind. Focus after a key press is :focus-visible.
        const teal = await tokenColour(page, '--teal');
        const kinds = [...new Map(cards.filter((card) => !card.on).map((card) => [card.name, card])).values()];
        for (const card of kinds) {
          const target = page.locator(`[data-picture-card="${card.id}"]`);
          if (!card.edged) {
            await page.keyboard.press('Shift');
            await target.focus();
            expect(await target.evaluate((el) => getComputedStyle(el).outlineStyle), `${card.name} has no edge to paint, so its keyboard focus shows the outline`).not.toBe('none');
            await target.blur();
            continue;
          }
          const edged = () => target.evaluate((el, [id, colour]) => {
            const edges: Element[] = [];
            for (let node = el.querySelector(`[data-picture-art="${id}"]`) ?? el; node && node !== el; node = node.parentElement!) edges.push(node);
            return [el, ...edges].some((node) => { const cs = getComputedStyle(node); return cs.borderTopColor === colour && parseFloat(cs.borderTopWidth) > 0 && !['none', 'hidden'].includes(cs.borderTopStyle); });
          }, [String(card.id), teal] as const);
          await target.hover();
          await expect.poll(edged, { message: `${card.name} turns teal on hover, round the card or its art` }).toBe(true);
          await page.mouse.move(0, 0);
          await expect.poll(edged, { message: `${card.name} has no teal edge once the pointer leaves` }).toBe(false);
          await page.keyboard.press('Shift');
          await target.focus();
          await expect.poll(edged, { message: `${card.name} turns teal on keyboard focus, round the card or its art` }).toBe(true);
          await target.blur();
        }
      });
    }

    test('home picture cards have no resting frame and a teal edge on hover', async ({ page }, info) => {
      await page.goto('/');
      expect(await themeOf(page), `the page is in the ${theme} theme`).toBe(theme);
      const teal = await tokenColour(page, '--teal');
      let checked = 0;
      for (const selector of HOME_CARDS) {
        const card = page.locator(selector).first();
        if (!(await card.count()) || !(await card.isVisible())) continue;
        const rest = await card.evaluate((el) => getComputedStyle(el).borderTopColor);
        expect(rest, `${selector} has no visible border at rest`).toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
        checked += 1;
        if (info.project.name === 'desktop') {
          await card.hover();
          await expect.poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor), { message: `${selector} turns teal on hover` }).toBe(teal);
          await page.mouse.move(0, 0);
        }
      }
      expect(checked, 'at least the event, banner and featured cards are on the page').toBeGreaterThanOrEqual(3);
    });
  });
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
for (const target of [...censusRoutes(), ...CENSUS_STATES]) {
  const name = typeof target === 'string' ? target : `${target.route} (${target.id})`;
  test(`buttons on ${decodeURIComponent(name)} keep the button voice off body and mono type`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'a button\'s face does not change with the width');
    await openCensus(page, target);
    const leaks = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], a.btn, a.ghost, a.primary, a.danger'))
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => {
        const cs = getComputedStyle(el);
        const face = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        const em = (parseFloat(cs.letterSpacing) || 0) / parseFloat(cs.fontSize);
        return { el: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, face, transform: cs.textTransform, em: Math.round(em * 1000) / 1000, text: (el.textContent ?? '').trim().slice(0, 30) };
      })
      .filter((b) => /^(?:Inter|JetBrains Mono)$/.test(b.face) && Math.abs(b.em - 0.09) < 0.006));
    expect([...new Map(leaks.map((b) => [b.el, b])).values()], `${name}: buttons in Inter or JetBrains Mono with the button tracking (a card takes .btn-bare)`).toEqual([]);
  });
}

/* ---- The class, branch and faction glyphs are ink, in both themes -------------------
 * The glyphs (/class-icons/, /branch-icons/, /faction-icons/) are white art on a
 * transparent ground. Drawn as an <img> they were white on the light theme's near-white:
 * /operators' class and branch chips and the class line under every card were blank
 * squares, and so were the operator page's synergy and technique glyphs and /techniques'
 * branch badges and branch tables; the planner's roster chips had an invert() filter of
 * their own. Every one is an OperatorGameIcon now,
 * a mask in the ink of the line it sits in (teal on a pressed chip). This visits every
 * place that draws one, in both themes, with each place's glyphs on screen (a class
 * picked, the operator page's disclosures open), and fails:
 * - a glyph drawn as an <img>, except over an operator's portrait on the stage deploy bar,
 *   where it is white with a shadow as the game draws it;
 * - a glyph whose ink is under 3:1 against what it sits on (WCAG 1.4.11), the nearest
 *   opaque background behind it, a disabled control aside;
 * - a place that shows no glyph, so a selector that stopped matching cannot pass on nothing.
 * Colours only: nothing here depends on the fonts. */
/** `glyph`: the glyphs this place is here for, which must be on screen (the rest of the
 *  page's are checked too): a place whose own glyph stopped rendering cannot pass on the
 *  class glyph in the page header. */
const GLYPH_PLACES: { name: string; route: string; glyph: string; act?: (page: Page) => Promise<void> }[] = [
  { name: '/operators (the class chips and every card\'s class line)', route: '/operators', glyph: '.roster-icon-chip [role="img"], .roster-class-branch [role="img"]' },
  { name: '/operators with Defender picked (the branch chips)', route: '/operators', glyph: '[role="group"][aria-label="Branch"] [role="img"]', act: async (page) => { await page.getByRole('button', { name: 'Defender', exact: true }).first().click(); await expect(page.getByRole('group', { name: 'Branch' })).toBeVisible(); } },
  { name: 'an operator with class forms', route: '/operators/Amiya', glyph: '.op-form-switch [role="img"]' },
  { name: 'an operator with branch and faction synergies', route: '/operators/SilverAsh', glyph: '.op-synergy-value [role="img"]' },
  // The technique is on Entelechia's S2 (the skill tabs show one skill at a time).
  { name: 'an operator whose technique names a branch', route: '/operators/Entelechia', glyph: '.op-skill-technique-icons-row [role="img"]', act: async (page) => {
    await page.getByRole('tablist', { name: 'Skill' }).first().getByRole('tab').nth(1).click();
  } },
  { name: '/techniques (the branch badges)', route: '/techniques', glyph: '.technique-entry-badge-branch [role="img"]' },
  { name: "/techniques with a branch's table shown", route: '/techniques', glyph: '.technique-table-branch-header [role="img"]', act: async (page) => {
    // The first technique that lists operators by branch: its table heads each branch
    // with the branch's glyph.
    const toggle = page.locator('.technique-group', { has: page.locator('.technique-entry-badge-branch') }).first().locator('.technique-table-toggle');
    await toggle.click();
    await expect(page.locator('.technique-table-branch-header').first()).toBeVisible();
  } },
  { name: "the planner's roster", route: '/planner', glyph: '.wizard-class-chip [role="img"]', act: async (page) => {
    await page.getByRole('tablist', { name: 'Planner mode' }).getByRole('tab', { name: 'Experimental' }).click();
    await page.getByRole('button', { name: 'Your roster', exact: true }).first().click();
    await expect(page.getByRole('group', { name: 'Class' }).first()).toBeVisible();
  } },
];
for (const theme of ['dark', 'light'] as const) {
  for (const place of GLYPH_PLACES) {
    test(`class, branch and faction glyphs are ink on ${place.name} (${theme} theme)`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'colour is width-independent');
      await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* none */ } }, theme);
      await openCensus(page, place.route);
      if (place.act) await place.act(page);
      await page.evaluate(() => { for (const d of Array.from(document.querySelectorAll('details'))) d.open = true; });
      await page.waitForTimeout(200);
      // The entrance animations end first: a card rising in after a filter is part-way
      // through its opacity ramp, and its glyphs read faint until it lands.
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined))));
      expect(await themeOf(page), `the page is in the ${theme} theme`).toBe(theme);
      const found = await page.evaluate(() => {
        const GLYPH = /\/(?:class|branch|faction)-icons\//;
        const rgba = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean); return [+r, +g, +b, +a]; };
        const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
        const ground = (el: Element) => {
          for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c && c[3] >= 0.5) return c;
          }
          return rgba(getComputedStyle(document.body).backgroundColor) ?? [0, 0, 0, 1];
        };
        const name = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''} in ${el.parentElement?.tagName.toLowerCase()}.${Array.from(el.parentElement?.classList ?? []).join('.')}`;
        const out = { shown: 0, images: [] as string[], faint: [] as string[] };
        for (const el of Array.from(document.querySelectorAll('*'))) {
          if (!el.getClientRects().length) continue;
          const cs = getComputedStyle(el);
          if (el instanceof HTMLImageElement) {
            if (!GLYPH.test(el.currentSrc || el.src)) continue;
            out.shown += 1;
            if (!el.closest('.stage-deploy-op')) out.images.push(name(el));
            continue;
          }
          const mask = cs.getPropertyValue('-webkit-mask-image') || cs.getPropertyValue('mask-image');
          if (!GLYPH.test(mask) || cs.visibility === 'hidden') continue;
          // The operator artwork's faction emblem is a 5.5% watermark behind the art, not a glyph.
          let opacity = 1;
          for (let n: Element | null = el; n; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity);
          if (opacity < 0.2) continue;
          out.shown += 1;
          if (el.closest(':disabled, [aria-disabled="true"]')) continue;
          const back = ground(el);
          const ink = rgba(cs.backgroundColor);
          if (!ink) { out.faint.push(`${name(el)}: no ink (${cs.backgroundColor})`); continue; }
          const drawn = over([...ink.slice(0, 3), ink[3] * opacity], back);
          const [a, b] = [lum(drawn), lum(back)].sort((x, y) => y - x);
          const ratio = (a + 0.05) / (b + 0.05);
          if (ratio < 3) out.faint.push(`${name(el)}: ${ratio.toFixed(2)}:1 (${cs.backgroundColor} on rgb(${back.slice(0, 3).join(', ')}))`);
        }
        return out;
      });
      expect(found.shown, `${place.name} shows a class, branch or faction glyph`).toBeGreaterThan(0);
      expect(found.images, 'glyphs drawn as white-art <img>, not as masks in ink (OperatorGameIcon)').toEqual([]);
      expect([...new Set(found.faint)], 'glyphs under 3:1 against what they sit on').toEqual([]);
      const own = await page.locator(place.glyph).evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0).length);
      expect(own, `${place.name}: its own glyphs (${place.glyph}) are on screen`).toBeGreaterThan(0);
    });
  }
}

/* ---- A numbered list's markers stay in its box ------------------------------------
 * The site's list reset gives the marker column 1.1em (shared.css), which holds "9." and
 * not "10.": a list of ten or more hung its markers past the column's edge. None does
 * today, so this puts a 12- and a 105-item list, and a 5-item one, into a real page's
 * running text and measures each item's marker (the text of "N. " in the item's own face,
 * the marker's advance) against the room its list gives it. It compares text with the
 * box reserved for it in whatever face draws it, to +-2px, so CI's fonts do not change
 * the verdict. */
test("a numbered list's markers stay inside the list", async ({ page }) => {
  await openCensus(page, '/operators/Amiya');
  const over = await page.evaluate(() => {
    const host = document.querySelector('main .op-section p')?.parentElement ?? document.querySelector('main')!;
    const out: string[] = [];
    for (const count of [5, 12, 105]) {
      const ol = document.createElement('ol');
      for (let i = 1; i <= count; i += 1) { const li = document.createElement('li'); li.textContent = `Item ${i}`; ol.appendChild(li); }
      host.appendChild(ol);
      const room = parseFloat(getComputedStyle(ol).paddingInlineStart);
      for (const li of Array.from(ol.children)) {
        const probe = document.createElement('span');
        const cs = getComputedStyle(li);
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
        probe.textContent = `${Array.from(ol.children).indexOf(li) + 1}. `;
        document.body.appendChild(probe);
        const marker = probe.getBoundingClientRect().width;
        probe.remove();
        const past = marker - (li.getBoundingClientRect().left - ol.getBoundingClientRect().left) ;
        if (past > 2) { out.push(`a ${count}-item list: "${probe.textContent.trim()}" is ${marker.toFixed(1)}px in a ${room.toFixed(1)}px column`); break; }
      }
      ol.remove();
    }
    return out;
  });
  expect(over, 'markers past their list\'s edge').toEqual([]);
});

/* ---- The gacha operator preview's panels share one inset ---------------------------
 * Stats, Trait, Talents, Skills, Modules and Base Skills are stacked panels in one column
 * of the preview dialog. Skills, Modules and Base Skills had an 18px inset against the
 * others' 12px, so their headings and text started 6px right of the panels above them.
 * Every panel's heading starts the same distance in from its panel's edge, within 1px, at
 * both widths: box edges and the start of text, nothing that depends on the fonts. */
test("the gacha operator preview's panels share one inset", async ({ page }) => {
  const state = CENSUS_STATES.find((s) => s.id === 'gacha operator preview')!;
  await openCensus(page, state);
  await expect(page.getByRole('tablist', { name: 'Skill' })).toBeVisible({ timeout: 15000 });
  const insets = await page.evaluate(() => Array.from(document.querySelectorAll('.gacha-preview-section')).filter((s) => s.getClientRects().length > 0).map((s) => {
    const h = s.querySelector('h3')!;
    const range = document.createRange();
    range.selectNodeContents(h);
    return { name: (h.firstChild?.textContent ?? h.textContent ?? '').trim(), inset: Math.round((range.getBoundingClientRect().left - s.getBoundingClientRect().left) * 10) / 10 };
  }));
  expect(insets.length, 'the preview shows its panels').toBeGreaterThanOrEqual(4);
  const first = insets[0].inset;
  expect(insets.filter((i) => Math.abs(i.inset - first) > 1).map((i) => `${i.name} ${i.inset}px in (${insets[0].name} ${first}px)`), 'panels whose heading starts at another inset').toEqual([]);
});
