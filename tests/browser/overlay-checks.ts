import type { Page } from '@playwright/test';

/*
 * Text on an overlay reads in both themes (r11, 2026-09-28).
 *
 * On /enemies in the light theme every tile's handbook code (.enemy-tile-index, "B1",
 * "B2"...) drew as a dark square: the badge sits on a fixed near-black ground over the
 * portrait, rgb(0 0 0 / 72%), and took its ink from the theme's --text, which the light
 * theme turns dark -- 1.4:1. The census below found three more of the same kind: the
 * Terminal's "no map data" tag (--text-faint on a fixed dark plate, 2.44:1 light and
 * 3.98:1 dark), and the inverse on the stage map's legend, whose ground follows the theme
 * while its counts kept a fixed white ink (1.06:1 light).
 *
 * The layout census (layout-census.spec.ts) runs it on its one load of every census address
 * and driven state; overlay-badges.spec.ts adds the legend. So on every census address and driven state, and with the stage map's legend open, in
 * the dark and the light theme: every absolutely positioned box that paints its own
 * ground (a background colour at 50% or more opaque: a badge, a tag, a plate, a scrim
 * panel over art), and every visible line of text whose nearest painted ground is that
 * box, has 4.5:1 or more (WCAG 1.4.3). A ground less than opaque sits over art that can
 * be anything, so it is composited over black and over white and the worse of the two
 * counts. Text a clipping ancestor hides (a closed panel parked outside its frame) is
 * not read. Computed colours only, so the same on any font; one load per address, with
 * the theme switched on the root element between the two readings.
 *
 * A plate need not be positioned itself to sit over art: the stage map's HUD is one
 * absolute box (.stage-hud) with nothing painted, and its readings are static chips
 * inside it, each on a fixed dark translucent plate. Its DP figure took the theme's
 * --amber there and read 1.96:1 in the light theme, and its "Recommended" label a 55%
 * white, 3.74:1 (r11 verify). So a translucent ground (50% to under 100% opaque) inside
 * an absolutely or fixed positioned box counts as an overlay too; an opaque one there is
 * a panel of its own, whose text the page's other checks read. Visually hidden text (the
 * 1px clip-path pattern a glyph's word hides behind) is not drawn and is not read.
 */

export interface Offence { what: string; text: string; ink: string; ground: string; ratio: number }

export function overlayText(): { checked: number; offences: Offence[] } {
  /** A computed colour as rgba 0-255, whatever syntax the engine returns it in. */
  const parse = (v: string) => {
    let m = v.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    m = v.match(/^color\(srgb ([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    return null;
  };
  type C = { r: number; g: number; b: number; a: number };
  const over = (top: C, under: C): C => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c: C) => {
    const [r, g, b] = [c.r, c.g, c.b].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: C, b: C) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const BLACK = { r: 0, g: 0, b: 0, a: 1 }, WHITE = { r: 255, g: 255, b: 255, a: 1 };
  /** Whether any of `rect` survives the ancestors of `el` that clip their overflow. */
  const unclipped = (el: Element, rect: DOMRect) => {
    let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = n.getBoundingClientRect();
      if (cs.overflowX !== 'visible') box = { ...box, left: Math.max(box.left, c.left), right: Math.min(box.right, c.right) };
      if (cs.overflowY !== 'visible') box = { ...box, top: Math.max(box.top, c.top), bottom: Math.min(box.bottom, c.bottom) };
    }
    return box.right - box.left > 1 && box.bottom - box.top > 1;
  };
  const name = (el: Element) => el.tagName.toLowerCase() + [...el.classList].slice(0, 3).map((c) => `.${c}`).join('');
  const offences = new Map<string, Offence>();
  let checked = 0;
  const range = document.createRange();
  /** Whether an ancestor of `el` is absolutely or fixed positioned: `el` is drawn over
   *  whatever that box sits on. */
  const inOverlay = (el: Element) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'absolute' || p === 'fixed') return true;
    }
    return false;
  };
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(el);
    const bg = parse(cs.backgroundColor);
    if (!bg || bg.a < 0.5) continue;
    // An overlay's own ground, or a translucent plate inside one (the HUD's chips).
    if (cs.position !== 'absolute' && !(bg.a < 1 && inOverlay(el))) continue;
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const grounds = bg.a >= 1 ? [bg] : [over(bg, BLACK), over(bg, WHITE)];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (!node.data.trim()) continue;
      const parent = node.parentElement!;
      // Only text whose nearest painted ground is this box (a chip inside it has its own).
      let ground: Element | null = null;
      for (let n: Element | null = parent; n; n = n.parentElement) {
        const b = parse(getComputedStyle(n).backgroundColor);
        if (b && b.a > 0) { ground = n; break; }
        if (n === el) break;
      }
      if (ground !== el || !parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      // Visually hidden (the 1px clip-path pattern): kept for a screen reader, not drawn.
      if (/inset\(50%\)/.test(getComputedStyle(parent).clipPath)) continue;
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.some((r) => unclipped(parent, r))) continue;
      const inkCss = getComputedStyle(parent).color;
      const ink = parse(inkCss);
      if (!ink) continue;
      checked += 1;
      const worst = Math.round(Math.min(...grounds.map((g) => ratio(over(ink, g), g))) * 100) / 100;
      if (worst >= 4.5) continue;
      const key = `${name(el)} ${inkCss} ${cs.backgroundColor}`;
      const seen = offences.get(key);
      if (!seen || worst < seen.ratio) offences.set(key, { what: name(el), text: node.data.trim().slice(0, 24), ink: inkCss, ground: cs.backgroundColor, ratio: worst });
    }
  }
  return { checked, offences: [...offences.values()] };
}

/** Puts the page in `theme` the way the toggle does (the root's data-theme), and waits a
 *  frame so every computed colour has it. Transitions are switched off first: a colour
 *  that eases (a summary's hover colour, a chip's) read half-way between the themes. */
export async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.evaluate(async (t) => {
    if (!document.getElementById('overlay-census-still')) {
      const still = document.createElement('style');
      still.id = 'overlay-census-still';
      still.textContent = '*, *::before, *::after { transition: none !important; }';
      document.head.appendChild(still);
    }
    document.documentElement.setAttribute('data-theme', t);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, theme);
}

/** Motion's transitions back, after setTheme switched them off for its readings. */
export async function themeStillOff(page: Page) {
  await page.evaluate(() => document.getElementById('overlay-census-still')?.remove());
}
