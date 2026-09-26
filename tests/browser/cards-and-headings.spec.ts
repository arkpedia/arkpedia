import { expect, test, type Page } from '@playwright/test';
import { CENSUS_STATES, censusRoutes, openCensus } from './census-routes';

/*
 * Two maintainer decisions from 2026-09-26, after the site-wide restyle:
 *
 * - Section headings are teal-ish (--heading), not amber, and not the --teal that marks
 *   an on/current state either.
 * - Picture and content cards carry no resting frame: the art already says they can be
 *   clicked, and a grey box around every poster, portrait and tile was noise. They draw
 *   the teal edge on hover and keyboard focus. Real controls keep --control-border.
 */

// Routes whose sections use the site heading (.op-section h2 or the home panels).
const HEADING_ROUTES = ['/', '/operators/Amiya', '/gacha', '/planner', '/skins'];
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
      const hasBorder = (node: Element) => { const cs = getComputedStyle(node); return parseFloat(cs.borderTopWidth) > 0 && !['none', 'hidden'].includes(cs.borderTopStyle); };
      let edged = hasBorder(el);
      const pictureBox = picture.node.getBoundingClientRect();
      for (let node: Element | null = picture.node; node && node !== el; node = node.parentElement) {
        const r = node.getBoundingClientRect();
        if (r.width * r.height < 0.9 * pictureBox.width * pictureBox.height) continue;
        const drawn = frame(node);
        if (drawn) frames.push(`${name(node)} round the art: ${drawn}`);
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

    test('section headings use --heading, never amber or the on-state teal', async ({ page }) => {
      for (const route of HEADING_ROUTES) {
        await page.goto(route);
        expect(await themeOf(page), `the page is in the ${theme} theme`).toBe(theme);
        const heading = await tokenColour(page, '--heading');
        const amber = await tokenColour(page, '--amber');
        const teal = await tokenColour(page, '--teal');
        expect(heading, 'the heading colour is its own token').not.toBe(teal);
        const colours = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.op-section h2, .front-home-panel h2, .simple-all h2, .simple-empty h2, .plan-panel-head .label-pair > h2, .waiting-box h2'))
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 40), colour: getComputedStyle(el).color })));
        expect(colours.length, `${route} has section headings`).toBeGreaterThan(0);
        for (const { text, colour } of colours) {
          expect(colour, `${route} "${text}" is not amber`).not.toBe(amber);
          expect(colour, `${route} "${text}" uses --heading`).toBe(heading);
        }
      }
    });

    for (const [route, least] of Object.entries(PICTURE_ROUTES)) {
      test(`picture cards on ${decodeURIComponent(route)} have no resting frame, and a teal edge on hover`, async ({ page }, info) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
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
