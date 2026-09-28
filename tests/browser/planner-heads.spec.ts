import { expect, test, type Page } from '@playwright/test';
import { PLANNER_PLAN, fontsSettled, plannerExperimental, readOnly } from './census-routes';

/*
 * The planner's Experimental panel heads on a phone (r11, 2026-09-28).
 *
 * At 390 "Your plan" wrapped its three buttons two and one -- Clear and Your roster on a
 * line, + Add a goal alone under them, each at its own width -- and its count wrapped to
 * a line of its own that started with the separator: "· 4 operators with goals". The
 * Depot's "· edited 18 days ago" did the same at 360. Now the dot is a span hung in the
 * gap before the count and clipped where the count starts a line (.plan-panel-lead in
 * styles/planner/planner.css), and on a phone a head's buttons share their line: one
 * full-width row where they fit, or full-width rows, never a ragged one.
 *
 * For every panel head (Your plan, Still needed, Depot) at 360, 390 and 412, and at 1440:
 *
 *   separator  no line of text in the head starts with a separator. Every character's
 *              box (a Range per character), cut to each ancestor that clips it, grouped
 *              into visual lines by vertical overlap; the first visible glyph of each line
 *              is not "·" or "•". A dot typed back into the count, or the clip taken off,
 *              puts one at a line's start at 360 or 390.
 *   rows       the controls in the head's action group (its direct children; a pick-one
 *              pair counts as one) are on one line, or else every line spans the group's
 *              whole width (within 1px) or every line holds one control on the group's
 *              start edge, and the controls on a line are one height.
 *
 * Box edges and glyph boxes against each other only, so the same on CI's fonts.
 */

const PHONE = [360, 390, 412];

interface HeadReading { name: string; lines: string[]; rows: { items: number; left: number; right: number; heights: number[] }[]; groupLeft: number; groupRight: number }

function readHeads(): HeadReading[] {
  const SEPARATORS = new Set(['·', '•']);
  const clipRect = (el: Element) => {
    let box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const cs = getComputedStyle(node);
      const c = node.getBoundingClientRect();
      if (cs.overflowX !== 'visible') box = { ...box, left: Math.max(box.left, c.left), right: Math.min(box.right, c.right) };
      if (cs.overflowY !== 'visible') box = { ...box, top: Math.max(box.top, c.top), bottom: Math.min(box.bottom, c.bottom) };
    }
    return box;
  };
  return Array.from(document.querySelectorAll('.plan-panel-head')).map((head) => {
    // Every visible glyph in the head, then visual lines by vertical overlap.
    const glyphs: { ch: string; left: number; top: number; bottom: number }[] = [];
    const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const parent = node.parentElement!;
      if (getComputedStyle(parent).visibility === 'hidden' || !parent.checkVisibility()) continue;
      const clip = clipRect(parent);
      const text = node.data;
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i]) || text[i] === ' ') continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width < 0.5 || r.height < 0.5) continue;
        const shownW = Math.min(r.right, clip.right) - Math.max(r.left, clip.left);
        const shownH = Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top);
        if (shownW < r.width / 2 || shownH < r.height / 2) continue; // clipped away
        glyphs.push({ ch: text[i], left: r.left, top: r.top, bottom: r.bottom });
      }
    }
    glyphs.sort((a, b) => a.top - b.top);
    const lines: { top: number; bottom: number; glyphs: typeof glyphs }[] = [];
    for (const g of glyphs) {
      const line = lines.find((l) => Math.min(l.bottom, g.bottom) - Math.max(l.top, g.top) > 1);
      if (line) { line.glyphs.push(g); line.top = Math.min(line.top, g.top); line.bottom = Math.max(line.bottom, g.bottom); }
      else lines.push({ top: g.top, bottom: g.bottom, glyphs: [g] });
    }
    const starts = lines.map((l) => [...l.glyphs].sort((a, b) => a.left - b.left)[0].ch);
    const firstBad = lines.flatMap((l, i) => SEPARATORS.has(starts[i]) ? [`a line starts with "${starts[i]}": "${[...l.glyphs].sort((a, b) => a.left - b.left).map((g) => g.ch).join('').slice(0, 40)}"`] : []);
    // The action group's direct children, by line.
    const group = head.querySelector(':scope > .plan-panel-acts')!;
    const gr = group.getBoundingClientRect();
    const items = Array.from(group.children).filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.getBoundingClientRect());
    const rows: { items: number; left: number; right: number; heights: number[]; top: number; bottom: number }[] = [];
    for (const r of [...items].sort((a, b) => a.top - b.top || a.left - b.left)) {
      const row = rows.find((x) => Math.min(x.bottom, r.bottom) - Math.max(x.top, r.top) > 1);
      if (row) { row.items += 1; row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right); row.heights.push(Math.round(r.height * 10) / 10); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); }
      else rows.push({ items: 1, left: r.left, right: r.right, heights: [Math.round(r.height * 10) / 10], top: r.top, bottom: r.bottom });
    }
    return {
      name: head.querySelector('h2')?.textContent ?? '?',
      lines: firstBad,
      rows: rows.map(({ items: n, left, right, heights }) => ({ items: n, left: Math.round(left * 10) / 10, right: Math.round(right * 10) / 10, heights })),
      groupLeft: Math.round(gr.left * 10) / 10,
      groupRight: Math.round(gr.right * 10) / 10,
    };
  });
}

async function openExperimental(page: Page) {
  await readOnly(page);
  await page.goto('/planner');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await plannerExperimental(page, PLANNER_PLAN);
  await fontsSettled(page);
}

function check(heads: HeadReading[], width: number) {
  expect(heads.map((h) => h.name), `${width}px: the three panel heads`).toEqual(['Your plan', 'Still needed', 'Depot']);
  for (const h of heads) {
    const where = `${width}px, ${h.name}`;
    expect.soft(h.lines, `${where}: a separator starts a line`).toEqual([]);
    expect(h.rows.length, `${where}: the head has controls`).toBeGreaterThan(0);
    for (const row of h.rows) expect.soft(Math.max(...row.heights) - Math.min(...row.heights), `${where}: controls on one line are one height (${row.heights.join(', ')})`).toBeLessThanOrEqual(1);
    if (h.rows.length === 1) continue;
    const spans = h.rows.every((row) => Math.abs(row.left - h.groupLeft) <= 1 && Math.abs(row.right - h.groupRight) <= 1);
    const stacked = h.rows.every((row) => row.items === 1 && Math.abs(row.left - h.groupLeft) <= 1);
    expect.soft(spans || stacked, `${where}: the controls wrap ragged -- ${h.rows.map((r) => `${r.items} control(s) ${r.left}-${r.right}`).join(' / ')} in a group ${h.groupLeft}-${h.groupRight}; one line, full-width lines, or one control a line`).toBe(true);
  }
}

test("the planner's panel heads on a phone: no line starts with the separator, and no ragged row of buttons", async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the phone widths; the desktop test below reads 1440');
  await openExperimental(page);
  for (const width of PHONE) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(200);
    check(await page.evaluate(readHeads), width);
  }
});

test("the planner's panel heads at 1440: the separator sits between the title and the count", async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the desktop width; the phone test above reads 360-412');
  await openExperimental(page);
  const heads = await page.evaluate(readHeads);
  check(heads, 1440);
  // One line each: the title, the dot, the count, and the actions at the far end.
  for (const h of heads) expect(h.rows.length, `1440, ${h.name}: the actions on one line`).toBe(1);
  const dots = await page.locator('.plan-panel-head .plan-sep').evaluateAll((els) => els.map((el) => {
    const lead = el.closest('.plan-panel-lead')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { shown: r.left >= lead.left - 0.5, text: el.textContent };
  }));
  expect(dots.length, 'each count has its separator').toBe(3);
  for (const d of dots) expect(d, 'the separator is drawn beside the title').toEqual({ shown: true, text: '·' });
});
