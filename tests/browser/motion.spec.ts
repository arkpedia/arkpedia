import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { fontsSettled, openFilters, openPullableSimulator, plannerExperimental, PLANNER_PLAN, readOnly, refuseWebfonts } from './census-routes';

/*
 * Motion: option C, "Quiet polish" (maintainer, 2026-09-26), and the LIVE badge's
 * blinking dot (docs/development/ui-primitives.md rule 23). Every transition and
 * animation the site adds is in styles/core/motion.css under prefers-reduced-motion:
 * no-preference (audit:styles, motionScope, holds the stylesheets to that); this holds
 * the rendered page to what that is for:
 *
 *   - with reduced motion, nothing runs: on every census address, after hovering its
 *     cards, pressing a button, switching a tab and scrolling its lazy images in,
 *     document.getAnimations() is empty (the transitions written before motion.css each
 *     needed an override and most had none, so shared.css stops them all);
 *   - motion never moves the layout: every element's layout box and the document's
 *     height are the same with motion on as with it off, the load's layout shift is no
 *     worse (the worse of two loads each way, +0.01), a lifted card's box does not move,
 *     and nothing is left faded once the images have arrived; the /community carousel
 *     changes page under reduced motion without blanking its cards;
 *   - every picture card and pressable tile rises on hover and on keyboard focus (found
 *     on the page the way cards-and-headings.spec.ts finds them, so a new card that
 *     does not lift fails), is not cut by a box that clips it (its top edge, its shadow),
 *     and none of them shrinks as a button does when pressed;
 *   - a boxed panel on the page ground carries the soft depth (--shadow-panel);
 *   - the <Tabs> underline sits under the current tab (1px) at first paint, after
 *     clicks, keyboard moves and a resize, and never slides in on its first placement;
 *   - every LIVE badge has its dot, blinking with motion and still without, drawn by
 *     the stylesheet so the badge is its final width before any script runs;
 *   - an image put in after hydration, having drawn nothing, is held until it arrives
 *     and then fades in; one that errors, or has not come 1.5s after it is on screen, is
 *     shown as it is; nothing already in (or drawing) at hydration fades, and without
 *     scripts nothing is held.
 * Box edges and computed styles only, no text widths, so CI's Linux fonts change nothing.
 */

/** A context like this test's project, with the motion preference given. */
async function contextFor(browser: Browser, info: TestInfo, reducedMotion: 'reduce' | 'no-preference', extra: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const use = info.project.use;
  return browser.newContext({
    viewport: use.viewport, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
    baseURL: use.baseURL, reducedMotion, ...extra,
  });
}

/** Load, and wait for the page to be still: network quiet, fonts in, and every animation
 *  that ends (an entrance, a fade) finished. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await fontsSettled(page);
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => null))),
    new Promise((resolve) => { setTimeout(resolve, 3000); }),
  ]));
  await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
}

/** Records layout shift from the first paint (buffered), for the load's CLS, with what
 *  moved in each, for the failure message. */
const CLS_PROBE = () => {
  const w = window as unknown as { __cls: number; __shifts: string[] };
  w.__cls = 0;
  w.__shifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
      if (entry.hadRecentInput) continue;
      w.__cls += entry.value;
      w.__shifts.push(`${entry.value.toFixed(4)} at ${Math.round(entry.startTime)}ms: ${(entry.sources ?? []).slice(0, 3).map((source) => {
        const node = source.node as Element | undefined;
        const name = node ? `${node.nodeName.toLowerCase()}${typeof node.className === 'string' && node.className ? `.${node.className.split(/\s+/)[0]}` : ''}` : '?';
        return `${name} y ${Math.round(source.previousRect.y)}->${Math.round(source.currentRect.y)} h ${Math.round(source.previousRect.height)}->${Math.round(source.currentRect.height)}`;
      }).join(', ')}`);
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

/** Every element's layout box, in the document's coordinates, keyed by its path: offsetLeft
 *  and offsetTop summed up the offsetParent chain (with each parent's border), which is
 *  layout and not paint, so a transform does not count -- nor does a transform making an
 *  ancestor the offsetParent (an entrance animation's filled transform does, with motion
 *  on only). Also each element's own opacity, which elements are animating, which images
 *  are still held for their fade (lib/ui/imageArrival.ts: not arrived, so at opacity 0)
 *  and whether each of those has in fact finished loading, and the document's height. */
const layoutOf = (page: Page) => page.evaluate(() => {
  const boxes: Record<string, string> = {};
  const opacity: Record<string, number> = {};
  const animating: string[] = [];
  const held: Record<string, boolean> = {};
  const holding = document.documentElement.hasAttribute('data-image-arrivals');
  const at = new Map<Element, [number, number]>();
  const abs = (el: HTMLElement): [number, number] => {
    const known = at.get(el);
    if (known) return known;
    let x = el.offsetLeft;
    let y = el.offsetTop;
    const parent = el.offsetParent;
    if (parent instanceof HTMLElement) { const [px, py] = abs(parent); x += px + parent.clientLeft; y += py + parent.clientTop; }
    at.set(el, [x, y]);
    return [x, y];
  };
  const walk = (el: Element, path: string) => {
    let i = 0;
    for (const child of Array.from(el.children)) {
      const key = `${path}/${child.tagName.toLowerCase()}${i}`;
      i += 1;
      if (child instanceof HTMLElement && child.offsetParent !== null) {
        const [x, y] = abs(child);
        boxes[key] = `${x},${y},${child.offsetWidth},${child.offsetHeight} ${child.className && typeof child.className === 'string' ? child.className.split(/\s+/)[0] : child.tagName.toLowerCase()}`;
        opacity[key] = Number(getComputedStyle(child).opacity);
        if (child.getAnimations().length) animating.push(key);
        if (holding && child instanceof HTMLImageElement && !child.hasAttribute('data-shown')) held[key] = child.complete;
      }
      walk(child, key);
    }
  };
  walk(document.body, 'body');
  return { height: document.documentElement.scrollHeight, boxes, opacity, animating, held };
});

/** The same game on every load: the games pick their answer with Math.random, and two
 *  answers are two layouts. */
const SEEDED_RANDOM = () => {
  let state = 0x2545f491;
  Math.random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
};

/** Waits (10s at most) until every image the page has asked for is in or has failed:
 *  the art is on another origin, and a load's layout shift read while it still arrives
 *  depends on how much of it came. Lazy images far below the screen are not asked for,
 *  nor is a lazy one that is not rendered (the phone drawer's and the player's, in a
 *  display: none box, whose rect reads top 0: waiting for those spent the whole 10s on
 *  every load). */
const imagesIn = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  const started = performance.now();
  const tick = () => {
    const waiting = Array.from(document.images).filter((img) => !img.complete
      && (img.loading !== 'lazy' || (img.getClientRects().length > 0 && img.getBoundingClientRect().top < innerHeight * 2)));
    if (!waiting.length || performance.now() - started > 10000) resolve(); else setTimeout(tick, 100);
  };
  tick();
}));

/** What runs on the page now: every animation and transition, named. */
const running = (page: Page) => page.evaluate(() => document.getAnimations().map((a) => {
  const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
  const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.constructor.name;
  const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
  return `${name} on ${target ? `${target.tagName.toLowerCase()}.${Array.from(target.classList).join('.')}` : '?'}${pseudo}`;
}));

/*
 * The picture-card finder of cards-and-headings.spec.ts: a visible link or button whose
 * main content is a picture (an img, picture, video, canvas or svg image, or url() art on
 * it, inside it or on a ::before/::after) of 40x40 or more covering half its box or more.
 * Tags each data-motion-card=<n> and returns them by kind (tag and classes).
 */
interface Card { id: number; kind: string }
async function pictureCards(page: Page): Promise<Card[]> {
  return page.evaluate(() => {
    const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1 && getComputedStyle(el).visibility !== 'hidden' && el.checkVisibility(); };
    const art = (value: string) => value.includes('url(');
    const out: { id: number; kind: string }[] = [];
    let id = 0;
    for (const el of Array.from(document.querySelectorAll('a[href], button, [role="button"]'))) {
      // The home Community panel's slides turn on a timer, so which one shows depends on when the
      // test reaches it: tests/browser/home-community-fader.spec.ts checks its card lifts.
      if (!shown(el) || el.closest('[role="dialog"], .modal-box, .front-community-slide')) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 40 || box.height < 40) continue;
      const picture = [el, ...Array.from(el.querySelectorAll('*'))].some((node) => {
        if (node !== el && !shown(node)) return false;
        const cs = getComputedStyle(node);
        const isPicture = ['img', 'picture', 'video', 'canvas', 'image'].includes(node.tagName.toLowerCase()) || art(cs.backgroundImage)
          || ['::before', '::after'].some((at) => { const ps = getComputedStyle(node, at); return ps.content !== 'none' && art(ps.backgroundImage); });
        if (!isPicture) return false;
        const r = node.getBoundingClientRect();
        const w = Math.min(r.right, box.right) - Math.max(r.left, box.left), h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
        return w >= 40 && h >= 40 && w * h >= 0.5 * box.width * box.height;
      });
      if (!picture) continue;
      id += 1;
      el.setAttribute('data-motion-card', String(id));
      out.push({ id, kind: el.tagName.toLowerCase() + Array.from(el.classList).filter((c) => !/^(active|current|live|is-|roster-card-enter|skin-card-enter)/.test(c)).map((c) => `.${c}`).join('') });
    }
    return out;
  });
}
/* Picture cards that do not lift, and why. */
const NO_LIFT: Record<string, string> = {
  'button.op-carousel-main-btn': 'the operator artwork: it fills its pane, has no edge to lift, and opens the zoom',
};
/* The addresses whose picture cards are checked, with how many kinds each shows at least
   (the cards-and-headings list, and /games, whose cards are .lift, and /obtain-method). */
const LIFT_ROUTES: Record<string, number> = {
  '/': 3, '/skins': 1, "/gacha-simulator": 1, '/enemies': 1, "/world": 1, "/polls/power-scale": 1, '/music/discover': 2, '/stages': 1,
  '/stages/content/act51side': 1, '/stages/regular': 1, '/stages/all': 1, '/stages/exploration': 1, '/operators': 1,
  '/operators/Amiya': 1, [`/events/${encodeURIComponent('[Rerun] Under Tides Rerun')}#skins`]: 1,
};
/* Content cards whose art is under half the card: they lift too. */
const LIFT_CONTENT_CARDS: Record<string, string[]> = {
  '/games': ['a.lift'], '/synergies': ['button.technique-card'], '/techniques': ['button.technique-card'], '/stages': ['a.terminal-mode'], '/stages/supplies': ['.supply-card'], '/stages/regular': ['a.regular-now', '.regular-tower'],
};

const HOVER_LIFT = '0px -3px';

/** Where a lifted card is cut: for every ancestor that clips (overflow not visible), the
 *  room the lifted box has inside its padding box against what the rise and the card's
 *  computed shadow need. A shadow's reach is its offset, spread and 0.75 of its blur:
 *  past that less than 7% of its strength is left, and a cut there does not show; the
 *  first lift shadow reached 26px under the card, and a .scroll-row (4-6px) or the score
 *  rail (10px) cut it into a grey band with a hard edge, and clipped the 3px rise off a
 *  card's top edge. An axis on which the card was not wholly inside the scroller at rest
 *  (scrolled partly out of view) is not judged. */
const clipCuts = (el: ReturnType<Page['locator']>, rest: { top: number; bottom: number; left: number; right: number }) => el.evaluate((e, at) => {
  const need = { top: 0, bottom: 0, side: 0 };
  const shadow = getComputedStyle(e).boxShadow;
  if (shadow !== 'none') {
    for (const part of shadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(part)) continue;
      const [x = 0, y = 0, blur = 0, spread = 0] = part.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(parseFloat);
      const reach = 0.75 * blur + spread;
      need.top = Math.max(need.top, reach - y);
      need.bottom = Math.max(need.bottom, reach + y);
      need.side = Math.max(need.side, reach + Math.abs(x));
    }
  }
  const box = e.getBoundingClientRect();
  const cuts: string[] = [];
  for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const c = a.getBoundingClientRect();
    const top = c.top + a.clientTop;
    const left = c.left + a.clientLeft;
    const bottom = top + a.clientHeight;
    const right = left + a.clientWidth;
    const name = `${a.tagName.toLowerCase()}.${a.className.toString().split(' ')[0]}`;
    if (at.top >= top - 0.5 && at.bottom <= bottom + 0.5) {
      if (box.top - top < -0.5) cuts.push(`${name} cuts ${(top - box.top).toFixed(1)}px off its top`);
      else if (box.top - top < need.top - 0.5) cuts.push(`${name} leaves ${(box.top - top).toFixed(1)}px above, its shadow needs ${need.top.toFixed(1)}`);
      if (bottom - box.bottom < need.bottom - 0.5) cuts.push(`${name} leaves ${(bottom - box.bottom).toFixed(1)}px under it, its shadow needs ${need.bottom.toFixed(1)}`);
    }
    if (at.left >= left - 0.5 && at.right <= right + 0.5) {
      const side = Math.min(box.left - left, right - box.right);
      if (side < need.side - 0.5) cuts.push(`${name} leaves ${side.toFixed(1)}px beside it, its shadow needs ${need.side.toFixed(1)}`);
    }
  }
  return cuts;
}, rest);

/** Holds `:active` on the element tagged `selector` (a press without a click: nothing is
 *  opened, followed or dragged), through the DevTools protocol, or lets it go. */
async function forceActive(page: Page, selector: string, on: boolean) {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  await cdp.send('CSS.enable');
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: on ? ['active'] : [] });
  if (!on) await cdp.detach();
}

/* The pages the two whole-page motion checks load: one of each kind of motion (the home
   carousel and its cards, the operator list's cards, an operator page's skill tabs and
   artwork, /gacha's LIVE badge, /community's carousel, /skins' cards, the
   planner's tabs and dialogs, the Terminal). Motion is one stylesheet inside
   prefers-reduced-motion: no-preference, held there by audit:styles' motionScope, and it
   moves only transform, opacity and shadow, so these pages stand for the rest: the census
   pages once cost 4 loads each here, 360 in all. */
const MOTION_ROUTES = ['/', '/operators', '/operators/Amiya', "/gacha-simulator", '/schedule', "/world", '/skins', "/operator-planner", '/stages'];

test.describe('reduced motion: nothing moves', () => {
  for (const route of MOTION_ROUTES) {
    test(`${route}: no animation or transition runs, after hovering, pressing, switching and scrolling`, async ({ browser }, info) => {
      const context = await contextFor(browser, info, 'reduce');
      const page = await context.newPage();
      await readOnly(page);
      await page.goto(route);
      await settle(page);
      const seen: string[] = [];
      const check = async (after: string) => { for (const a of await running(page)) seen.push(`${a} (after ${after})`); };
      await check('the load');
      // Hover the first cards of each kind, where there is a pointer that hovers.
      if (!info.project.use.isMobile) {
        const cards = await pictureCards(page);
        const kinds = [...new Map(cards.map((c) => [c.kind, c])).values()].slice(0, 6);
        for (const card of kinds) {
          const el = page.locator(`[data-motion-card="${card.id}"]`);
          await el.scrollIntoViewIfNeeded();
          await el.hover({ timeout: 3000 }).catch(() => null);
          await check(`hovering ${card.kind}`);
          expect(await el.evaluate((e) => getComputedStyle(e).translate), `${card.kind} does not lift under reduced motion`).toBe('none');
        }
        await page.mouse.move(0, 0);
      }
      // Press a button in the page (held :active, so nothing is clicked).
      const button = page.locator('main button:not(.btn-bare):visible').first();
      if (await button.count()) {
        await button.evaluate((e) => e.setAttribute('data-motion-press', ''));
        await forceActive(page, '[data-motion-press]', true);
        await check('pressing a button');
        expect(await button.evaluate((e) => getComputedStyle(e).scale), 'a pressed button keeps its size under reduced motion').toBe('none');
        await forceActive(page, '[data-motion-press]', false);
      }
      // Switch a tab.
      const other = page.locator('[role="tablist"] > [role="tab"][aria-selected="false"]:not([disabled]):visible').first();
      if (await other.count()) {
        await other.click();
        await check('switching a tab');
      }
      // Open the site's menu: a nav group's menu at 1440, the drawer and its overlay on a
      // phone (their stops once sat above the rules they stop, and lost the cascade).
      await page.evaluate(() => window.scrollTo(0, 0));
      const menu = info.project.use.isMobile
        ? page.getByRole('button', { name: 'Open navigation menu' })
        : page.locator('.site-nav-trigger:visible').first();
      if (await menu.count()) {
        await menu.click();
        await check('opening the site menu');
        await page.keyboard.press('Escape');
        await check('closing it');
      }
      // Bring the lazy images in.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await check('scrolling to the end');
      expect([...new Set(seen)], `${route} runs motion under prefers-reduced-motion: reduce`).toEqual([]);
      expect(await page.evaluate(() => document.querySelectorAll('img[data-arrived]').length), 'no image is marked to fade under reduced motion').toBe(0);
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-image-arrivals')), 'nor is any image held for a fade').toBe(false);
      await context.close();
    });
  }
});

test('reduced motion: the World video gallery stays drawn and keeps its cards', async ({ browser }, info) => {
  const context = await contextFor(browser, info, 'reduce');
  const page = await context.newPage();
  await page.clock.install();
  await readOnly(page);
  await page.goto("/world");
  await page.getByRole('tab', { name: 'YouTube', exact: true }).click();
  const gallery = page.locator('.youtube-topic-list');
  await expect(gallery.locator('a[href]').first()).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const look = () => gallery.evaluate(el => ({
    cards: Array.from(el.querySelectorAll('a[href]')).map(a => a.getAttribute('href')),
    opacity: getComputedStyle(el).opacity,
  }));
  const before = await look();
  expect(before.opacity, 'the gallery is visible after opening the tab').toBe('1');
  for (let t = 0; t < 7; t++) {
    await page.clock.runFor(1000);
    const now = await look();
    expect(now.opacity, 'no timed fade hides the gallery').toBe('1');
    // Lazy loading may append a batch; the cards already drawn must stay in place.
    expect(now.cards.slice(0, before.cards.length), 'no automatic replacement of existing cards').toEqual(before.cards);
  }
  await context.close();
});

/* Routes whose load shift is the frames' luck, on 957d76b as here and with either
   preference, so its score cannot tell motion apart: their boxes, height and opacity are
   still compared, their load CLS is not. Measured 2026-09-28, the same build, one load at a
   time: /music read 0.2035 and 0.3899 (the player growing in one frame or two), and 0.06
   to 0.21 with the CPU slowed 4x, on both builds, both preferences. */
const CLS_NOISY: Record<string, string> = {
  '/music': 'the player and its queue grow at load in one frame or two, 0.06 to 0.39 on the same build either way',
};
test.describe('motion never moves the layout', () => {
  // Four loads (two with motion, two without), each waiting for its images.
  test.describe.configure({ timeout: 120_000 });
  for (const route of MOTION_ROUTES) {
    test(`${route}: the same boxes, height and opacity with motion on and off, and no more layout shift`, async ({ browser }, info) => {
      const result: Record<string, { layout: Awaited<ReturnType<typeof layoutOf>>; cls: number; shifts: string[]; marked: string[] }> = {};
      // Each preference loads twice, each time fresh, and its worse layout shift is the one
      // compared: one movement scores differently by the frames it lands in (the /music
      // player grows in one frame or two, 0.39 or 0.20, on either build and either
      // preference), so one load against one load compares luck. Worst against worst.
      const loads = [['no-preference', 0], ['reduce', 0], ['no-preference', 1], ['reduce', 1]] as const;
      // One instant for every load, timers still running (setFixedTime): a countdown shows
      // seconds once its event ends within a day, so two loads seconds apart drew
      // "41m 5s" and "41m 11s", and the box of the text read as moved by motion
      // (/, 2026-09-30, Stronghold Protocol's last 22 hours).
      const instant = Date.now();
      for (const [motion, again] of loads) {
        const context = await contextFor(browser, info, motion);
        await context.addInitScript(CLS_PROBE);
        await context.addInitScript(SEEDED_RANDOM);
        const page = await context.newPage();
        await page.clock.setFixedTime(instant);
        await readOnly(page);
        // The webfonts refused in both: when the webfont lands against hydration decides
        // whether two shifts share a frame, and one frame scores more than two (/gacha read
        // 0.071 and 0.094 on one build, either way round), which is not motion's doing.
        await refuseWebfonts(page);
        await page.goto(route);
        await settle(page);
        await imagesIn(page);
        await settle(page);
        // A fade still playing (an image that came in during the last settle) takes its mark
        // off when it ends; one still marked after that is a fade that never ran.
        await page.waitForFunction(() => !document.querySelector('img[data-arrived]'), undefined, { timeout: 3000 }).catch(() => {});
        if (again) {
          const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
          if (cls > result[motion].cls) {
            result[motion].cls = cls;
            result[motion].shifts = await page.evaluate(() => (window as unknown as { __shifts: string[] }).__shifts);
          }
          await context.close();
          continue;
        }
        result[motion] = {
          layout: await layoutOf(page),
          cls: await page.evaluate(() => (window as unknown as { __cls: number }).__cls),
          shifts: await page.evaluate(() => (window as unknown as { __shifts: string[] }).__shifts),
          // The fade takes its mark off when it ends: one still on is a fade that never did.
          marked: await page.evaluate(() => Array.from(document.querySelectorAll('img[data-arrived]')).map((img) => `${img.getAttribute('src')} (${img.getClientRects().length ? 'drawn' : 'not drawn'}, ${img.getAnimations().length} animations)`)),
        };
        await context.close();
      }
      const on = result['no-preference'];
      const off = result.reduce;
      expect(on.marked, 'every image that faded in has finished, and kept nothing').toEqual([]);
      expect(off.marked, 'nothing fades under reduced motion').toEqual([]);
      expect(on.layout.height, 'the document is as tall with motion as without').toBe(off.layout.height);
      // offsetLeft and offsetTop are whole pixels, one rounding per link of the chain, so a
      // chain that runs through another offsetParent may sum 1px apart: positions agree
      // to 1px, sizes exactly.
      const nums = (box: string) => box.split(' ')[0].split(',').map(Number);
      const differs = (a: string, b: string) => { const [ax, ay, aw, ah] = nums(a); const [bx, by, bw, bh] = nums(b); return Math.abs(ax - bx) > 1 || Math.abs(ay - by) > 1 || aw !== bw || ah !== bh; };
      const moved = Object.keys(off.layout.boxes).filter((key) => key in on.layout.boxes && differs(on.layout.boxes[key], off.layout.boxes[key]))
        .map((key) => `${off.layout.boxes[key]} -> ${on.layout.boxes[key].split(' ')[0]}`);
      expect(moved.slice(0, 12), 'no element\'s layout box differs with motion on').toEqual([]);
      // Nothing is left faded: with reduced motion, nothing that shows with motion on (an
      // entrance that ends at full strength, stopped at its start) is dimmer; with motion
      // on, every image is at the opacity it has without the fade. Elements still in a
      // loop or a timer's cross-fade are not compared.
      const stuck = Object.entries(on.layout.held).filter(([, complete]) => complete).map(([key]) => on.layout.boxes[key]);
      expect(stuck, 'no image that has loaded (or failed) is still held at opacity 0').toEqual([]);
      // Held and not loaded: a lazy image the browser has not asked for yet, at 0 until it arrives.
      const moving = new Set([...on.layout.animating, ...off.layout.animating, ...Object.keys(on.layout.held)]);
      const dim = Object.keys(on.layout.opacity).filter((key) => key in off.layout.opacity && !moving.has(key)
        && (off.layout.opacity[key] < on.layout.opacity[key] - 0.01 || (/\/img\d+$/.test(key) && Math.abs(off.layout.opacity[key] - on.layout.opacity[key]) > 0.01)))
        .map((key) => `${on.layout.boxes[key]} at ${on.layout.opacity[key]} with motion, ${off.layout.opacity[key]} without`);
      expect(dim.slice(0, 12), 'nothing is left faded').toEqual([]);
      if (CLS_NOISY[route]) { test.info().annotations.push({ type: 'load CLS not compared', description: CLS_NOISY[route] }); return; }
      expect(on.cls, `the load's layout shift with motion (${on.cls.toFixed(4)}, the worse of two loads) is no worse than without (${off.cls.toFixed(4)})\n  with motion:\n    ${on.shifts.join('\n    ')}\n  without:\n    ${off.shifts.join('\n    ')}`).toBeLessThanOrEqual(off.cls + 0.01);
    });
  }
});

test.describe('cards lift, and only by paint', () => {
  test.skip(({ isMobile }) => !!isMobile, 'a phone has no hover; keyboard focus is checked at 1440');
  for (const [route, least] of Object.entries(LIFT_ROUTES)) {
    test(`${route}: every picture card rises on hover and keyboard focus, moves no layout box, and does not shrink when pressed`, async ({ page }) => {
      await readOnly(page);
      await page.goto(route);
      if (route === "/world") await page.getByRole('tab', { name: 'YouTube', exact: true }).click();
      // The first banner follows today's schedule and may have no published art yet.
      // Exercise the poster card using an illustrated banner, not its empty fallback.
      if (route === '/') {
        await page.locator('.front-gacha-thumb:has(img)').first().click();
        await expect(page.locator('.front-gacha-poster-wrap img')).toBeVisible();
      }
      await settle(page);
      const cards = await pictureCards(page);
      const kinds = [...new Map(cards.filter((c) => !NO_LIFT[c.kind]).map((c) => [c.kind, c])).values()];
      expect(kinds.length, `${route} shows at least ${least} kinds of picture card`).toBeGreaterThanOrEqual(least);
      for (const card of kinds) {
        const el = page.locator(`[data-motion-card="${card.id}"]`);
        await el.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const rest = await el.evaluate((e) => ({ box: `${(e as HTMLElement).offsetLeft},${(e as HTMLElement).offsetTop},${(e as HTMLElement).offsetWidth},${(e as HTMLElement).offsetHeight}`, shadow: getComputedStyle(e).boxShadow, height: document.documentElement.scrollHeight }));
        const restRect = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
        await el.hover();
        await expect.poll(() => el.evaluate((e) => getComputedStyle(e).translate), { message: `${card.kind} rises 3px on hover` }).toBe(HOVER_LIFT);
        const lifted = await el.evaluate((e) => ({ box: `${(e as HTMLElement).offsetLeft},${(e as HTMLElement).offsetTop},${(e as HTMLElement).offsetWidth},${(e as HTMLElement).offsetHeight}`, shadow: getComputedStyle(e).boxShadow, height: document.documentElement.scrollHeight }));
        expect(lifted.box, `${card.kind}'s layout box does not move when it lifts`).toBe(rest.box);
        expect(lifted.height, 'nor does the document').toBe(rest.height);
        expect(lifted.shadow, `${card.kind} casts a shadow while lifted`).not.toBe('none');
        expect(lifted.shadow, `${card.kind}'s shadow is the lift's, not its resting one`).not.toBe(rest.shadow);
        await page.waitForTimeout(200); // the shadow's own transition, to its full reach
        expect(await clipCuts(el, restRect), `${card.kind}, lifted, is not cut by a box that clips it`).toEqual([]);
        // Pressed, a card stays its size: it is lifted, not pushed in like a button.
        await forceActive(page, `[data-motion-card="${card.id}"]`, true);
        await page.waitForTimeout(200);
        expect(await el.evaluate((e) => getComputedStyle(e).scale), `${card.kind} does not shrink when pressed`).toBe('none');
        await forceActive(page, `[data-motion-card="${card.id}"]`, false);
        await page.mouse.move(0, 0);
        await expect.poll(() => el.evaluate((e) => getComputedStyle(e).translate), { message: `${card.kind} settles once the pointer leaves` }).toBe('none');
        await page.keyboard.press('Shift');
        await el.focus();
        await expect.poll(() => el.evaluate((e) => getComputedStyle(e).translate), { message: `${card.kind} rises on keyboard focus` }).toBe(HOVER_LIFT);
        await el.blur();
      }
      for (const selector of LIFT_CONTENT_CARDS[route] ?? []) {
        const el = page.locator(selector).first();
        if (!(await el.count())) continue;
        await el.scrollIntoViewIfNeeded();
        const restRect = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
        await el.hover();
        await expect.poll(() => el.evaluate((e) => getComputedStyle(e).translate), { message: `${selector} rises 3px on hover` }).toBe(HOVER_LIFT);
        await page.waitForTimeout(200);
        expect(await clipCuts(el, restRect), `${selector}, lifted, is not cut by a box that clips it`).toEqual([]);
        await page.mouse.move(0, 0);
      }
    });
  }
  for (const [route, selectors] of Object.entries(LIFT_CONTENT_CARDS).filter(([r]) => !(r in LIFT_ROUTES))) {
    test(`${route}: its content cards rise on hover`, async ({ page }) => {
      await readOnly(page);
      await page.goto(route);
      await settle(page);
      let found = 0;
      for (const selector of selectors) {
        const el = page.locator(selector).first();
        if (!(await el.count())) continue;
        found += 1;
        await el.scrollIntoViewIfNeeded();
        const restRect = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
        await el.hover();
        await expect.poll(() => el.evaluate((e) => getComputedStyle(e).translate), { message: `${selector} rises 3px on hover` }).toBe(HOVER_LIFT);
        await page.waitForTimeout(200);
        expect(await clipCuts(el, restRect), `${selector}, lifted, is not cut by a box that clips it`).toEqual([]);
        await page.mouse.move(0, 0);
      }
      expect(found, `${route} shows its content cards`).toBeGreaterThan(0);
    });
  }
  test('buttons, chips and tabs give when pressed; a text link does not', async ({ page }) => {
    await readOnly(page);
    await page.goto('/operators');
    await settle(page);
    const press = async (what: string, locate: () => ReturnType<Page['locator']>, scale: string) => {
      const el = locate().first();
      await expect(el, `${what} is on the page`).toBeVisible();
      await el.evaluate((e) => { document.querySelectorAll('[data-motion-press]').forEach((x) => x.removeAttribute('data-motion-press')); e.setAttribute('data-motion-press', ''); });
      await forceActive(page, '[data-motion-press]', true);
      await expect.poll(() => el.evaluate((e) => getComputedStyle(e).scale), { message: `${what} ${scale === 'none' ? 'does not press in' : 'presses in'}` }).toBe(scale);
      await forceActive(page, '[data-motion-press]', false);
    };
    // On a phone the roster's chips are in its Filters sheet.
    await openFilters(page);
    await press('a chip', () => page.locator('.filter-chip:visible'), '0.97');
    await page.goto('/events/%5BSide%20Story%5D%20People%2C%20A%20People');
    await settle(page);
    await press('a tab', () => page.getByRole('tab'), '0.97');
    await openPullableSimulator(page);
    await settle(page);
    await press('a base button (the pull buttons, which also rise on hover)', () => page.locator('button.gacha-action:visible'), '0.97');
    // /operators' only ghost button was its "Show more"; the roster grows on scroll now.
    await press('a ghost button', () => page.locator('main button.ghost:visible:not([disabled])'), '0.97');
    // The operator page's eyebrow links back to the roster: a text link.
    await page.goto('/operators/Amiya');
    await settle(page);
    await press('a text link', () => page.locator('.page-header a[href="/operators"]:visible'), 'none');
  });
});

/* --- soft panel depth ---------------------------------------------------------------- */
/* Boxed things that are not panels on the page ground, and why they carry no depth. */
const FLAT_BOXES: Record<string, string> = {
  'events-row': 'a row of the /schedule events list: a list of rows, not a panel',
  'gm-oprow': 'a row of the Stronghold operator list',
  'regular-now': 'a content card on /stages/regular: it lifts on hover instead',
  'gm-co-launch': 'the Stronghold companion launcher: a teal-edged call to action under the lookup, not a panel',
};
test.describe('boxed panels sit on a soft shadow', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the same stylesheet at every width; measured at 1440');
  for (const route of ['/', "/gacha-simulator", '/operators/Amiya', "/pull-planner", '/recruitment', '/stages', '/stages/browse', '/support', "/game-modes/stronghold-protocol", "/operator-planner"]) {
    test(`${route}: every boxed panel on the page ground carries --shadow-panel`, async ({ page }) => {
      await readOnly(page);
      await page.goto(route);
      await settle(page);
      // The planner's panels show once there is a plan: Experimental, with the census's.
      if (route === "/operator-planner") await plannerExperimental(page, PLANNER_PLAN);
      const report = await page.evaluate((flat) => {
        const probe = document.createElement('div');
        probe.style.boxShadow = 'var(--shadow-panel)';
        document.body.appendChild(probe);
        const token = getComputedStyle(probe).boxShadow;
        probe.remove();
        const clear = (v: string) => v === 'transparent' || /rgba\(\d+, \d+, \d+, 0\)/.test(v);
        const boxed = (el: Element) => {
          const cs = getComputedStyle(el);
          const sides = ['top', 'right', 'bottom', 'left'].filter((s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 && cs.getPropertyValue(`border-${s}-style`) !== 'none' && !clear(cs.getPropertyValue(`border-${s}-color`)));
          return sides.length === 4 && (!clear(cs.backgroundColor) || cs.backgroundImage !== 'none');
        };
        const panels: string[] = [];
        const bare: string[] = [];
        for (const el of Array.from(document.querySelectorAll('#page-content *'))) {
          const r = el.getBoundingClientRect();
          if (r.width < 200 || r.height < 80 || !el.checkVisibility()) continue;
          if (el.closest('button, a, [role="button"], [role="dialog"], dialog, .modal-box, [popover]')) continue;
          if (getComputedStyle(el).position === 'fixed' || !boxed(el)) continue;
          // Top level only: a box inside another is part of that panel.
          let nested = false;
          for (let p = el.parentElement; p && p.id !== 'page-content'; p = p.parentElement) if (boxed(p)) { nested = true; break; }
          if (nested) continue;
          const cls = Array.from(el.classList);
          const name = `${el.tagName.toLowerCase()}.${cls.join('.')}`;
          if (cls.some((c) => flat[c])) continue;
          panels.push(name);
          if (getComputedStyle(el).boxShadow !== token) bare.push(`${name} (${getComputedStyle(el).boxShadow})`);
        }
        return { token, panels, bare };
      }, FLAT_BOXES);
      expect(report.token, '--shadow-panel resolves').not.toBe('none');
      expect(report.panels.length, `${route} shows a boxed panel`).toBeGreaterThan(0);
      expect(report.bare, 'boxed panels without the soft depth').toEqual([]);
    });
  }
});

/* --- the sliding underline ------------------------------------------------------------ */
/** Where the indicator is against where the current tab's own underline would be: the
 *  tab's box, along its foot (the ::after is left 0, right 0, bottom 0, 2px tall). */
const underline = (page: Page, strip: string) => page.locator(strip).first().evaluate((list) => {
  const bar = list.querySelector(':scope > .tabs-indicator');
  const tab = list.querySelector(':scope > [role="tab"][aria-selected="true"]');
  if (!bar || !tab) return null;
  const b = bar.getBoundingClientRect();
  const t = tab.getBoundingClientRect();
  return {
    shown: list.hasAttribute('data-slide') && getComputedStyle(bar).visibility === 'visible',
    running: bar.getAnimations().length,
    dx: b.left - t.left, dw: b.width - t.width, dy: b.bottom - t.bottom, h: b.height,
    after: getComputedStyle(tab, '::after').backgroundColor,
    tabScale: getComputedStyle(tab).scale,
  };
});
const under = (u: Awaited<ReturnType<typeof underline>>) => !!u && u.shown && Math.abs(u.dx) <= 1 && Math.abs(u.dw) <= 1 && Math.abs(u.dy) <= 1 && Math.abs(u.h - 2) <= 0.5;
/** Polls until the bar has come to rest under the current tab (a page may select on a
 *  router update, a frame or more after the press), and fails with where it is. */
async function underCurrent(page: Page, strip: string, after: string) {
  let last: Awaited<ReturnType<typeof underline>> = null;
  await expect.poll(async () => { await still(page, strip); last = await underline(page, strip); return under(last); }, { message: `the bar is under the current tab after ${after}`, timeout: 5000 }).toBe(true)
    .catch((error: Error) => { throw new Error(`${error.message}\n  last seen: ${JSON.stringify(last)}`); });
}
/** Waits until nothing moves the bar or the tab (the slide and the press ease out). */
const still = (page: Page, strip: string) => page.locator(strip).first().evaluate((list) => Promise.all(
  [list.querySelector(':scope > .tabs-indicator'), ...Array.from(list.querySelectorAll(':scope > [role="tab"]'))].flatMap((el) => (el ? el.getAnimations().map((a) => a.finished.catch(() => null)) : [])),
));

const STRIPS: { route: string; strip: string }[] = [
  { route: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', strip: '.event-detail-tabs' },
  { route: "/game-modes/stronghold-protocol", strip: '.gm-lookup [role="tablist"]' },
  { route: '/recruitment', strip: 'main [role="tablist"]' },
  { route: '/enemies', strip: '.enemy-tabs' },
];

test.describe('the tab underline slides', () => {
  for (const { route, strip } of STRIPS) {
    test(`${route}: the underline is under the current tab at first paint, after clicks, keys and a resize`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (msg) => { if (msg.type() === 'error' && /hydrat|did not match|Minified React error #(418|423|425)/i.test(msg.text())) errors.push(msg.text()); });
      // At the moment the bar takes over, it is where the tab's own underline was, and it
      // is not moving: nothing slides in from the strip's corner on the first paint.
      await page.addInitScript(() => {
        const seen: unknown[] = [];
        (window as unknown as { __handover: unknown[] }).__handover = seen;
        new MutationObserver((records) => {
          for (const r of records) {
            const list = r.target as Element;
            if (r.attributeName !== 'data-slide' || !list.hasAttribute('data-slide')) continue;
            const bar = list.querySelector(':scope > .tabs-indicator');
            const tab = list.querySelector(':scope > [role="tab"][aria-selected="true"]');
            if (!bar || !tab) continue;
            const b = bar.getBoundingClientRect();
            const t = tab.getBoundingClientRect();
            seen.push({ running: bar.getAnimations().length, dx: b.left - t.left, dw: b.width - t.width, dy: b.bottom - t.bottom });
          }
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-slide'] });
      });
      await readOnly(page);
      await page.goto(route);
      await settle(page);
      const handover = await page.evaluate(() => (window as unknown as { __handover: { running: number; dx: number; dw: number; dy: number }[] }).__handover);
      expect(handover.length, 'the bar took over from the static underline').toBeGreaterThan(0);
      for (const h of handover) {
        expect(h.running, 'the bar does not animate into its first place').toBe(0);
        expect(Math.max(Math.abs(h.dx), Math.abs(h.dw), Math.abs(h.dy)), 'it takes over exactly where the tab\'s own underline is').toBeLessThanOrEqual(1);
      }
      const first = await underline(page, strip);
      expect(under(first), `at rest, the bar is under the current tab: ${JSON.stringify(first)}`).toBe(true);
      expect(first!.after, 'and the tab\'s own underline has given way to it').toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
      // Clicks: every enabled tab in turn.
      const tabs = page.locator(strip).first().locator(':scope > [role="tab"]:not([disabled])');
      const n = await tabs.count();
      expect(n, 'the strip has tabs to press').toBeGreaterThan(1);
      // Capture the actual transition before clicking. An aria-selected assertion
      // can finish after the short animation on a busy runner, when getAnimations()
      // is already empty. Still require a real transform transition, not just its CSS.
      await page.locator(strip).first().evaluate(list => {
        const bar = list.querySelector(':scope > .tabs-indicator')!;
        const transitions: string[] = [];
        (window as unknown as { __tabTransitions: string[] }).__tabTransitions = transitions;
        bar.addEventListener('transitionrun', event => {
          if (event.target === bar) transitions.push((event as TransitionEvent).propertyName);
        });
      });
      for (let i = n - 1; i >= 0; i -= 1) {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
        // The first press moves the bar off the first tab: it slides there, on transform.
        if (i === n - 1) {
          await expect.poll(() => page.evaluate(() => (window as unknown as { __tabTransitions: string[] }).__tabTransitions), { message: 'the bar slides to the tab pressed' }).toContain('transform');
        }
        await page.mouse.move(0, 0);
        await underCurrent(page, strip, `a click on tab ${i + 1}`);
      }
      // Keys: Right from the current tab, then End and Home.
      for (const key of ['ArrowRight', 'End', 'Home']) {
        await page.locator(strip).first().locator(':scope > [role="tab"][aria-selected="true"]').focus();
        await page.keyboard.press(key);
        await underCurrent(page, strip, key);
      }
      // A resize: the strip relays out (a phone width can wrap it), and the bar follows.
      const size = page.viewportSize()!;
      await page.setViewportSize({ width: Math.max(360, Math.round(size.width * 0.6)), height: size.height });
      await underCurrent(page, strip, 'a resize');
      await page.setViewportSize(size);
      await underCurrent(page, strip, 'a resize back');
      expect(errors, 'no hydration or runtime error').toEqual([]);
    });
  }
  test('with reduced motion the bar jumps, and a link strip keeps its static underline', async ({ browser }, info) => {
    const context = await contextFor(browser, info, 'reduce');
    const page = await context.newPage();
    await readOnly(page);
    await page.goto(STRIPS[0].route);
    await settle(page);
    await page.getByRole('tab', { name: /^Rewards/ }).first().click();
    expect(await page.locator('.tabs-indicator').first().evaluate((bar) => bar.getAnimations().length), 'no slide under reduced motion').toBe(0);
    expect(under(await underline(page, STRIPS[0].strip)), 'and it is already under the tab').toBe(true);
    // The Terminal bar is links between routes: no indicator, the current tab's own line.
    await page.goto('/stages/supplies');
    await settle(page);
    const link = page.locator('nav.tabs > a.tab[aria-current="page"]').first();
    if (await link.isVisible()) {
      expect(await page.locator('nav.tabs > .tabs-indicator').count(), 'a link strip has no sliding bar').toBe(0);
    }
    await context.close();
  });
});

/* --- LIVE ----------------------------------------------------------------------------- */
/** /schedule with an event on: its page data fetched on a client navigation, with `now`
 *  an hour into the first event's window, so the list has a LIVE row whatever the build's
 *  clock says (x-buttons.spec.ts moves /community's clock the same way). */
/** /schedule with the reader's clock inside an event, so a row is LIVE whatever the day.
 *  The page's `now` prop only draws the first render: useReaderClock swaps in the reader's
 *  clock on mount (lib/time/readerClock.ts), so patching the prop lasted one frame and the
 *  test passed only while an event really was live (2026-10-28, the day none was). The
 *  reader's clock is Playwright's fixed one, set inside the first dated event the page lists. */
async function scheduleWithLiveEvent(page: Page) {
  const html = await (await page.request.get('/schedule')).text();
  const rows = (JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)![1]).props.pageProps.eventRows as { start?: number; end?: number; isPredicted?: boolean }[])
    .filter((r) => typeof r.start === 'number' && typeof r.end === 'number' && !r.isPredicted);
  expect(rows.length, 'the schedule lists a dated event').toBeGreaterThan(0);
  await page.clock.setFixedTime(new Date(Math.min(rows[0].start! + 3_600_000, rows[0].end! - 1)));
  await page.goto('/');
  await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/schedule'));
  await page.waitForURL('**/schedule');
  await expect(page.locator('.badge-live').first(), 'the list has a LIVE row once the reader clock is inside an event').toBeVisible();
}
const dots = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('.badge-live')).filter((b) => b.checkVisibility()).map((badge) => {
  const dot = getComputedStyle(badge, '::before');
  const blink = badge.getAnimations({ subtree: true }).find((a) => (a.effect as KeyframeEffect).pseudoElement === '::before') as CSSAnimation | undefined;
  const effect = blink?.effect as KeyframeEffect | undefined;
  const timing = effect?.getTiming();
  const frames = effect?.getKeyframes() ?? [];
  return {
    text: badge.textContent, content: dot.content, w: dot.width, h: dot.height, radius: dot.borderRadius, bg: dot.backgroundColor, ink: getComputedStyle(badge).color,
    opacity: dot.opacity,
    blink: blink ? {
      name: blink.animationName, duration: timing?.duration, iterations: timing?.iterations, running: blink.playState,
      easing: [...new Set(frames.map((k) => k.easing))].join(' '),
      half: frames.filter((k) => k.offset === 0.5).map((k) => k.opacity).join(' '),
    } : null,
  };
}));
test.describe('LIVE badges blink', () => {
  for (const motion of ['no-preference', 'reduce'] as const) {
    test(`every .badge-live has its dot, ${motion === 'reduce' ? 'still under reduced motion' : 'blinking'}`, async ({ browser }, info) => {
      const context = await contextFor(browser, info, motion);
      const page = await context.newPage();
      await readOnly(page);
      const all: Awaited<ReturnType<typeof dots>> = [];
      await scheduleWithLiveEvent(page);
      all.push(...await dots(page));
      for (const route of ["/gacha-simulator", '/stages/all']) { await page.goto(route); await settle(page); all.push(...await dots(page)); }
      expect(all.length, 'at least the moved /schedule row has a badge').toBeGreaterThan(0);
      for (const d of all) {
        expect(d.content, `${d.text} has a dot`).toBe('""');
        expect([d.w, d.h, d.radius], `${d.text}'s dot is a 6px circle`).toEqual(['6px', '6px', '50%']);
        expect(d.bg, `${d.text}'s dot is in the badge's own ink`).toBe(d.ink);
        if (motion === 'reduce') {
          expect(d.blink, `${d.text}'s dot is still under reduced motion`).toBeNull();
          expect(d.opacity, 'and fully drawn').toBe('1');
        } else {
          // Option A's exactly: blink 1.2s steps(2, jump-none) infinite, 50% at .2.
          expect(d.blink, `${d.text}'s dot blinks`).toEqual({ name: 'blink', duration: 1200, iterations: Infinity, running: 'running', easing: 'steps(2, jump-none)', half: '0.2' });
        }
      }
      await context.close();
    });
  }
  test('the dot is the stylesheet\'s, so the badge is its final width before any script runs', async ({ browser }, info) => {
    // Without scripts: the server's HTML and the stylesheets only. A badge set into the page
    // the way the server writes one measures the same as on the running page.
    const measure = async (javaScriptEnabled: boolean) => {
      const context = await contextFor(browser, info, 'no-preference', { javaScriptEnabled });
      const page = await context.newPage();
      await readOnly(page);
      await page.goto('/support');
      await page.waitForLoadState('load');
      const width = await page.evaluate(() => {
        const badge = document.createElement('span');
        badge.className = 'badge-live';
        badge.textContent = 'Live now';
        document.querySelector('main')!.appendChild(badge);
        const dot = getComputedStyle(badge, '::before');
        return { badge: badge.getBoundingClientRect().width, dot: `${dot.width} ${dot.height}` };
      });
      await context.close();
      return width;
    };
    const still = await measure(false);
    expect(still.dot, 'the dot is drawn with no script at all').toBe('6px 6px');
    expect((await measure(true)).badge, 'and the badge is the same width once scripts run').toBeCloseTo(still.badge, 1);
  });
});

/* --- images arrive ------------------------------------------------------------------- */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
/** lib/ui/imageArrival.ts's HOLD_MS: how long a held image may take once on screen. */
const HOLD_MS = 1500;
test.describe('images fade in only as they arrive', () => {
  test('an image put in later is held until it arrives, then fades; one that errors, or has not come 1.5s after it is on screen, is shown as it is', async ({ page }) => {
    await readOnly(page);
    const after = (ms: number) => async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
      await new Promise((r) => { setTimeout(r, ms); });
      await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }).catch(() => {});
    };
    await page.route('**/__motion/never.png', () => { /* never answered */ });
    await page.route('**/__motion/missing.png', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/\/__motion\/quick\.png/, after(400));
    // The art's own origin, which does not say when its bytes came: it fades the same.
    await page.route('https://raw.githubusercontent.com/__motion/remote.png', after(400));
    // Longer than the hold: shown, as it is, before it arrives, and not faded when it does.
    await page.route('**/__motion/crawl.png', after(HOLD_MS + 900));
    await page.route('**/__motion/unseen.png', () => { /* never answered */ });
    await page.route(/\/__motion\/closed\.png/, after(200));
    await page.goto('/support');
    await settle(page);
    const names = { never: '/__motion/never.png', missing: '/__motion/missing.png', quick: '/__motion/quick.png', remote: 'https://raw.githubusercontent.com/__motion/remote.png', crawl: '/__motion/crawl.png' };
    const log = await page.evaluate(({ srcs, hold }) => new Promise<{ events: string[]; early: string[] }>((resolve) => {
      const events: string[] = [];
      let early: string[] = [];
      // On screen (the hold is timed from there), and one more in a box that is not shown.
      const box = document.createElement('div');
      box.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 99; display: flex';
      const hidden = document.createElement('div');
      hidden.id = 'motion-hidden';
      hidden.style.display = 'none';
      box.appendChild(hidden);
      const add = (name: string, src: string, into: Element) => {
        const img = document.createElement('img');
        img.id = `motion-${name}`;
        img.width = 40;
        img.height = 40;
        img.alt = '';
        img.addEventListener('animationstart', (e) => events.push(`${name} ${e.animationName} starts`));
        img.addEventListener('animationend', (e) => events.push(`${name} ${e.animationName} ends`));
        img.src = src;
        into.appendChild(img);
      };
      for (const [name, src] of Object.entries(srcs)) add(name, src, box);
      add('unseen', '/__motion/unseen.png', hidden);
      add('closed', '/__motion/closed.png', hidden);
      document.body.appendChild(box);
      const opacityOf = (name: string) => getComputedStyle(document.getElementById(`motion-${name}`)!).opacity;
      setTimeout(() => { early = Object.keys(srcs).map((name) => `${name} ${opacityOf(name)}`); }, 200);
      setTimeout(() => resolve({ events, early }), hold + 1900);
    }), { srcs: names, hold: HOLD_MS });
    expect(log.early, '200ms in, an image not yet in is held (it has drawn nothing), and the one that failed is shown').toEqual(['never 0', 'missing 1', 'quick 0', 'remote 0', 'crawl 0']);
    expect(log.events.sort(), 'the two that arrived in time fade in, and the fades end').toEqual(['quick img-arrive ends', 'quick img-arrive starts', 'remote img-arrive ends', 'remote img-arrive starts']);
    const state = (list: string[]) => page.evaluate((names) => names.map((name) => {
      const img = document.getElementById(`motion-${name}`) as HTMLImageElement;
      return `${name}: opacity ${getComputedStyle(img).opacity}, ${img.getAnimations().length} running, ${img.hasAttribute('data-arrived') ? 'marked' : 'unmarked'}, ${img.complete && img.naturalWidth ? 'loaded' : 'not loaded'}`;
    }), list);
    expect(await state(Object.keys(names)), 'every one ends visible, and the fade leaves no mark behind').toEqual([
      'never: opacity 1, 0 running, unmarked, not loaded',
      'missing: opacity 1, 0 running, unmarked, not loaded',
      'quick: opacity 1, 0 running, unmarked, loaded',
      'remote: opacity 1, 0 running, unmarked, loaded',
      'crawl: opacity 1, 0 running, unmarked, loaded',
    ]);
    // One that arrived in a box not shown was not drawn, so it is shown, unfaded: a fade
    // marked then would wait for the box to open.
    expect(await state(['closed']), 'an image that arrives in a closed box is shown, unmarked').toEqual(['closed: opacity 1, 0 running, unmarked, loaded']);
    // An image in a box that is not shown is timed only once it is: shown, it too ends visible.
    await page.evaluate(() => { document.getElementById('motion-hidden')!.style.display = 'block'; });
    expect(await page.locator('#motion-closed').evaluate((img) => img.getAnimations().length), 'and the box opening does not fade it').toBe(0);
    await expect.poll(() => state(['unseen']), { message: 'a held image in a box shown later is shown within the hold', timeout: HOLD_MS + 1500 })
      .toEqual(['unseen: opacity 1, 0 running, unmarked, not loaded']);
    // A copy of a picture the browser already has, put in later, came in at once: shown as
    // it is, never held or faded (the operator artwork's cross-fade puts the outgoing
    // picture in again, and a fade from nothing blinked it off at the switch).
    const copy = await page.evaluate(() => new Promise<string>((resolve) => {
      const source = document.getElementById('motion-quick') as HTMLImageElement;
      const img = document.createElement('img');
      img.id = 'motion-copy';
      img.width = 40;
      img.height = 40;
      img.alt = '';
      let faded = false;
      img.addEventListener('animationstart', () => { faded = true; });
      img.src = source.currentSrc;
      source.after(img);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const first = getComputedStyle(img).opacity;
        setTimeout(() => resolve(`${img.complete ? 'in already' : 'loading'}, opacity ${first} at its first paint, ${faded ? 'faded' : 'not faded'}`), 500);
      }));
    }));
    expect(copy, 'a copy of a picture already in is shown at once, unfaded').toBe('in already, opacity 1 at its first paint, not faded');
    // A panel shown again does not fade its images a second time.
    await page.evaluate(() => { const img = document.getElementById('motion-quick')!; img.style.display = 'none'; void img.offsetWidth; img.style.display = ''; });
    expect(await page.locator('#motion-quick').evaluate((img) => img.getAnimations().length), 'shown again, it does not fade again').toBe(0);
    // Nor is a new picture in an element that has shown one held or faded: the old one stays
    // up until the new one is in, and a fade would blank it between the two.
    const swapped = await page.locator('#motion-quick').evaluate((img: HTMLImageElement) => new Promise<string>((resolve) => {
      let faded = false;
      let dipped = false;
      img.addEventListener('animationstart', () => { faded = true; });
      const watch = () => { if (getComputedStyle(img).opacity !== '1') dipped = true; if (!img.complete) requestAnimationFrame(watch); };
      img.addEventListener('load', () => setTimeout(() => resolve(`${faded ? 'faded' : 'not faded'}, ${dipped ? 'hidden while it loaded' : 'shown while it loaded'}, opacity ${getComputedStyle(img).opacity}`), 100), { once: true });
      img.src = '/__motion/quick.png?again';
      requestAnimationFrame(watch);
      setTimeout(() => resolve('never loaded'), 3000);
    }));
    expect(swapped, 'a new src on it is not held or faded').toBe('not faded, shown while it loaded, opacity 1');
  });
test('the operator artwork cross-fades: the outgoing picture is not faded in again', async ({ page }) => {
    await readOnly(page);
    await page.goto('/operators/Amiya');
    await settle(page);
    await page.evaluate(() => {
      const w = window as unknown as { __arrive: string[] };
      w.__arrive = [];
      document.addEventListener('animationstart', (e) => {
        const img = e.target;
        if (img instanceof HTMLImageElement && e.animationName === 'img-arrive') w.__arrive.push(img.closest('.op-carousel-img-exit') ? 'outgoing' : img.closest('.op-carousel-img-enter') ? 'incoming' : 'elsewhere');
      }, true);
    });
    // Elite 2's artwork, then back to Elite 1's (in the browser by then: both switches
    // put a picture in that is already there).
    for (const name of [/^Elite 2/, /^Elite 1/]) {
      await page.locator('main button[aria-pressed]').filter({ hasText: name }).first().click();
      await page.waitForTimeout(700);
    }
    const arrive = await page.evaluate(() => (window as unknown as { __arrive: string[] }).__arrive);
    expect(arrive.filter((a) => a === 'outgoing'), 'the picture going out is not faded in from nothing').toEqual([]);
    expect(arrive.filter((a) => a === 'incoming').length, 'the one coming in fades at most once, as it arrives').toBeLessThanOrEqual(1);
  });
test('an image already loaded when the page hydrates is not faded, and a page without scripts shows every image', async ({ browser, page }, info) => {
    // The images load before the app can hydrate: the art is answered at once, and the app's
    // chunk is held back 1.5s and marks its own arrival. An image loaded before that mark
    // loaded before hydration.
    await page.addInitScript(() => {
      const w = self as unknown as { __motionApp?: boolean; __earlyFaded: string[] };
      w.__earlyFaded = [];
      document.addEventListener('load', (event) => {
        const img = event.target;
        if (img instanceof HTMLImageElement && !w.__motionApp) img.setAttribute('data-motion-early', '');
      }, true);
      document.addEventListener('animationstart', (event) => {
        const img = event.target;
        if (img instanceof HTMLImageElement && img.hasAttribute('data-motion-early')) w.__earlyFaded.push(img.getAttribute('src') ?? '');
      }, true);
    });
    await readOnly(page);
    await page.route(/\.(?:webp|png)(?:\?|$)/, (route) => (route.request().resourceType() === 'image' ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : route.continue()));
    await page.route(/\/_next\/static\/chunks\/pages\/_app-[^/]+\.js$/, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await new Promise((resolve) => { setTimeout(resolve, 1500); });
      await route.fulfill({ response, body: `self.__motionApp=true;${body}` });
    });
    await page.goto('/');
    await settle(page);
    const early = await page.evaluate(() => ({
      n: document.querySelectorAll('img[data-motion-early]').length,
      marked: (self as unknown as { __earlyFaded: string[] }).__earlyFaded,
      hydrated: !!(self as unknown as { __motionApp?: boolean }).__motionApp,
    }));
    expect(early.hydrated, 'the held app chunk ran').toBe(true);
    expect(early.n, 'images loaded before hydration').toBeGreaterThan(0);
    expect(early.marked, 'no image loaded before hydration is faded').toEqual([]);
    const context = await contextFor(browser, info, 'no-preference', { javaScriptEnabled: false });
    const still = await context.newPage();
    await readOnly(still);
    await still.goto('/');
    await still.waitForLoadState('load');
    const hidden = await still.evaluate(() => Array.from(document.images).filter((img) => img.checkVisibility() && (getComputedStyle(img).opacity !== '1' || img.hasAttribute('data-arrived'))).map((img) => img.getAttribute('src')));
    expect(hidden, 'without scripts no image is faded or hidden').toEqual([]);
    await context.close();
  });
});
