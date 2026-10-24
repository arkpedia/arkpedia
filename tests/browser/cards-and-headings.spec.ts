import { expect, test, type Page } from '@playwright/test';
import { CENSUS_STATES, openCensus } from './census-routes';
import { themeOf } from './layout-checks';

/*
 * Two maintainer decisions from 2026-09-26, after the site-wide restyle:
 *
 * - Section headings are --heading, which is the site's green (--teal) since 2026-09-29,
 *   and never amber.
 * - Picture and content cards carry no resting frame: the art already says they can be
 *   clicked, and a grey box around every poster, portrait and tile was noise. They draw
 *   the teal edge on hover and keyboard focus. Real controls keep --control-border.
 *
 * Both are checked on every page by the layout census (layout-census.spec.ts, r11): the
 * section headings (their look, --heading-gap and --section-gap), the picture cards and
 * the home page's cards, and the button voice, each on the census's one load of the page
 * (the tables and evaluators are in layout-checks.ts). What stays here is driven: the
 * glyphs of each place that draws them, a numbered list's markers, the gacha preview.
 */

/* ---- The class, branch and faction glyphs are ink, in both themes -------------------
 * The glyphs (/class-icons/, /branch-icons/, /faction-icons/) are white art on a
 * transparent ground. Drawn as an <img> they were white on the light theme's near-white:
 * /operators' class and branch chips and the class line under every card were blank
 * squares, and so were the operator page's synergy and technique glyphs and /techniques'
 * branch badges and branch tables (since 2026-10-23 its class chips and records, and
 * /synergies' emblems); the planner's roster chips had an invert() filter of
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
  { name: '/techniques (the class chips)', route: '/techniques', glyph: '.roster-icon-chip [role="img"]' },
  // Self-Sustain credits whole branches: its record heads each with the branch's glyph,
  // and every operator's row carries its class and branch glyphs.
  { name: "/techniques with a technique's record open", route: '/techniques?t=Self-Sustain', glyph: '.technique-record-branch-name [role="img"], .technique-row-meta [role="img"]', act: async (page) => {
    await expect(page.locator('.technique-record-branch-name').first()).toBeVisible();
  } },
  // A class card draws its class glyph (an icon), a faction card its emblem (a url() mask).
  { name: '/synergies (the class glyphs)', route: '/synergies?type=class', glyph: '.synergy-emblem [role="img"]' },
  { name: '/synergies (the faction emblems)', route: '/synergies?type=faction', glyph: '.synergy-emblem-art' },
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
  // The face the lists are set in, loaded before measuring: openCensus waits for fonts only so
  // long, and a slow runner measured the fallback face, wider than Inter (CI, 2026-10-22).
  await page.evaluate(async () => { await document.fonts.load('400 16px Inter', '0123456789.'); await document.fonts.ready; });
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
  test.setTimeout(60000);
  const state = CENSUS_STATES.find((s) => s.id === 'gacha operator preview')!;
  const [details] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/gacha-operator/'), { timeout: 45000 }),
    openCensus(page, state),
  ]);
  expect(details.ok(), 'operator details must load before measuring their panels').toBe(true);
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
