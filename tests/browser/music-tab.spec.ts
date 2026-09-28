import { expect, test, type Page } from '@playwright/test';
import { CENSUS_STATES, censusRoutes, openCensus, type CensusState } from './census-routes';

/*
 * The collapsed mini player never covers the page on a phone (r11, 2026-09-28).
 *
 * "At 390 the floating ♫ music tile overlaps content": the 44px tile, fixed 8px off the
 * right edge, sat 20px over a page whose content runs to the 24px gutter -- the right
 * edge of /pulls' goal list, the planner's materials, the top of an operator page's
 * section menu -- at every scroll position that brought them under it. At 900px and
 * under it is now a tab in that gutter (styles/music/music.css), and this holds it there:
 * on every census address and driven state, at 412, 390 and 360, the tab's box meets no
 * text and no control. While a modal dialog is open (the planner's windows put their Done
 * in that corner) the tab is hidden, and this checks that instead.
 *
 * Two readings per width. Live, at the top, the middle and the end of the page: every
 * visible text box (a Range's client rects) and control whose visible part -- cut to each
 * ancestor that clips its overflow, so a card scrolled out of a row does not count --
 * meets the tab. And for the whole scroll range at once: the tab is fixed, so as the page
 * scrolls it passes over every document y from its top at scroll 0 to its bottom at the
 * end, and anything in the flow (not fixed or sticky, which the live readings see where
 * they stay) that reaches its columns inside that band would sit under it at some scroll.
 * Box geometry only, the same on any font.
 */

const WIDTHS = [412, 390, 360];
/** The pages the widget does not float on: /music is the player, and the music guesser
 *  hides it (components/music/MusicPlayer.tsx). */
const NO_WIDGET = new Set(['/music', '/games/music-guesser']);

/** The goal list the maintainer named: /pulls with a banner planned (row-alignment.spec.ts
 *  plans one the same way, by address). */
const PULLS_GOAL: CensusState = {
  id: 'pulls with a banner goal', route: '/pulls',
  act: async (page) => {
    const name = await page.evaluate(() => {
      const odds = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { bannerOdds: Record<string, { type: string }> } } } }).__NEXT_DATA__.props.pageProps.bannerOdds;
      const names = Object.keys(odds);
      return names.find((n) => odds[n].type === 'limited') ?? names[0] ?? null;
    });
    expect(name, 'the schedule has a banner with odds').toBeTruthy();
    await page.goto(`/pulls?banner=${encodeURIComponent(name!)}`);
    await page.locator('article [class*="bannerRow"]').first().waitFor();
  },
};

interface Hit { what: string; box: string }

/** What the tab meets now (live), and what in the flow it would meet at some scroll
 *  (band). Empty lists when it meets nothing. */
function meets(): { tab: string; live: Hit[]; band: Hit[] } {
  const widget = document.querySelector('[data-music-widget]')!;
  const tab = widget.getBoundingClientRect();
  const CONTROL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"], [role="option"], [role="combobox"], [contenteditable="true"]';
  const round = (r: { left: number; top: number; right: number; bottom: number }) => `${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`;
  const hidden = new WeakMap<Element, boolean>();
  /** Whether el or an ancestor draws nothing: display none, visibility hidden, opacity
   *  0, or clipped away (the visually-hidden pattern). */
  const isHidden = (el: Element | null): boolean => {
    if (!el) return false;
    if (hidden.has(el)) return hidden.get(el)!;
    const cs = getComputedStyle(el);
    const own = cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0
      || (cs.clip !== 'auto' && cs.position === 'absolute') || /inset\(50%\)/.test(cs.clipPath);
    const value = own || isHidden(el.parentElement);
    hidden.set(el, value);
    return value;
  };
  /** The part of `r` its clipping ancestors show, or null. */
  const visible = (el: Element, r: DOMRect | { left: number; top: number; right: number; bottom: number }) => {
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const cs = getComputedStyle(node);
      const clipsX = cs.overflowX !== 'visible', clipsY = cs.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const c = node.getBoundingClientRect();
      if (clipsX) box = { ...box, left: Math.max(box.left, c.left), right: Math.min(box.right, c.right) };
      if (clipsY) box = { ...box, top: Math.max(box.top, c.top), bottom: Math.min(box.bottom, c.bottom) };
      if (box.right - box.left <= 0.5 || box.bottom - box.top <= 0.5) return null;
    }
    return box.right - box.left > 0.5 && box.bottom - box.top > 0.5 ? box : null;
  };
  /** Whether el sits in something fixed or sticky (moves with the viewport, not the page). */
  const pinned = (el: Element) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const p = getComputedStyle(node).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  };
  const name = (el: Element) => el.tagName.toLowerCase() + [...el.classList].slice(0, 3).map((c) => `.${c}`).join('');
  const overlap = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  // The band the tab sweeps as the page scrolls, in viewport coordinates at this scroll:
  // from where its top is at scroll 0 to where its bottom is at the end.
  const max = document.documentElement.scrollHeight - innerHeight;
  const band = { left: tab.left, right: tab.right, top: tab.top - scrollY, bottom: tab.bottom + (max - scrollY) };
  const live: Hit[] = [];
  const swept: Hit[] = [];
  const consider = (el: Element, rects: ArrayLike<DOMRect>, what: string) => {
    for (const r of Array.from(rects)) {
      if (r.width < 0.5 || r.height < 0.5 || r.right <= tab.left + 0.5) continue;
      const shown = visible(el, r);
      if (!shown) continue;
      if (overlap(shown, tab)) live.push({ what, box: round(shown) });
      else if (overlap(shown, band) && !pinned(el)) swept.push({ what, box: round(shown) });
    }
  };
  for (const el of Array.from(document.querySelectorAll(CONTROL))) {
    if (widget.contains(el) || el.closest('.skip-link') || isHidden(el)) continue;
    consider(el, [el.getBoundingClientRect()], `control ${name(el)} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || widget.contains(parent) || isHidden(parent)) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) continue;
    const pr = parent.getBoundingClientRect();
    if (pr.right <= tab.left + 0.5) continue; // nothing of it reaches the tab's columns
    range.selectNodeContents(node);
    consider(parent, range.getClientRects(), `text in ${name(parent)} "${node.textContent.trim().slice(0, 30)}"`);
  }
  const unique = (hits: Hit[]) => [...new Map(hits.map((h) => [`${h.what} ${h.box}`, h])).values()].slice(0, 12);
  return { tab: round(tab), live: unique(live), band: unique(swept) };
}

async function scrollTo(page: Page, where: 'top' | 'middle' | 'end') {
  await page.evaluate((at) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo({ top: at === 'top' ? 0 : at === 'middle' ? Math.round(max / 2) : max, behavior: 'instant' });
  }, where);
  // The phone bar collapses on scroll over a few frames (arkpedia-ui); let it land.
  await page.waitForTimeout(250);
}

for (const target of [...censusRoutes(), ...CENSUS_STATES, PULLS_GOAL]) {
  const name = typeof target === 'string' ? target : `${target.route} (${target.id})`;
  const route = typeof target === 'string' ? target : target.route;
  test(`the collapsed music tab on ${decodeURIComponent(name)} meets no text or control`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'the tab is the phone layout (900px and under); over it the tile is unchanged');
    await openCensus(page, target);
    const widget = page.locator('[data-music-widget]');
    if (NO_WIDGET.has(route)) {
      await expect(widget, `${route} does not float the widget`).toHaveCount(0);
      return;
    }
    await expect(widget, `${name} floats the widget`).toHaveCount(1);
    // A modal dialog over the page (the planner's windows, which end in a Done at the
    // right edge) has the tab step aside until it closes; the phone menu is one only open.
    const modal = page.locator('[aria-modal="true"]:not(.mobile-nav-drawer:not(.open))').filter({ visible: true });
    if (await modal.count()) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        await expect(page.getByRole('button', { name: 'Expand player' }), `${width}px: the tab is hidden behind the open dialog`).toBeHidden();
      }
      return;
    }
    await expect(page.getByRole('button', { name: 'Expand player' }), 'the widget is collapsed').toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(150);
      const box = (await widget.boundingBox())!;
      // In the gutter: flush with the screen's edge and no wider than the page's 24px
      // gutter, so it ends where the frame (24 to width - 24) begins.
      expect.soft(Math.round(box.x + box.width), `${width}px: the tab is flush with the screen's right edge`).toBe(width);
      expect.soft(box.x, `${width}px: the tab starts in the gutter, right of the frame's ${width - 24}px`).toBeGreaterThanOrEqual(width - 24 - 0.5);
      expect(box.height, `${width}px: the tab is a target at least 44px tall`).toBeGreaterThanOrEqual(44);
      for (const where of ['top', 'middle', 'end'] as const) {
        await scrollTo(page, where);
        const found = await page.evaluate(meets);
        expect(found.live, `${width}px, scrolled to the ${where}: the tab (${found.tab}) covers these`).toEqual([]);
        if (where === 'top') expect(found.band, `${width}px: the tab (${found.tab}) passes over these as the page scrolls`).toEqual([]);
      }
    }
  });
}
