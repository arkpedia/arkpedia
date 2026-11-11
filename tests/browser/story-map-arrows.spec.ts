import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * The story map's arrows (components/story/StoryMapView.tsx Line, lib/story/storyMap.ts
 * lineDrawing): every line the data gives a head draws one, at the end it names, pointing along
 * the line onto the cover it leads to, in the shaft's own colour. Until 2026-10-08 the importer
 * dropped Canva's end decorations and every arrow on the board came out a bare line.
 *
 * Read off the page, not the code: the head's direction from the browser's own fill geometry
 * (narrow at the tip, wide at the base), its colour from the computed styles.
 */
type Line = { type: 'line'; start?: string | null; end?: string | null };
const map = JSON.parse(readFileSync('data/story-map.json', 'utf8')) as { elements: { type: string }[] };
const arrowed = map.elements.filter((element): element is Line => element.type === 'line')
  .reduce((count, line) => count + (line.start ? 1 : 0) + (line.end ? 1 : 0), 0);

test('every arrowed line draws its head, pointing onto the cover it leads to, in the line\'s colour', async ({ page }) => {
  test.skip(arrowed === 0, 'the bundled data/story-map.json predates line heads; this arms itself once a hydrate brings them');
  await page.goto('/story');
  await expect(page.locator('.story-map-board')).toBeVisible();
  const found = await page.evaluate(() => {
    const board = document.querySelector('.story-map-board')!;
    const covers = [...board.querySelectorAll<HTMLElement>('.story-map-picture')].map(el => el.getBoundingClientRect());
    const out = { heads: 0, wrongWay: [] as string[], offColour: [] as string[], touching: 0, offCover: [] as string[] };
    for (const svg of board.querySelectorAll<SVGSVGElement>('svg.story-map-line')) {
      const shaft = svg.querySelector('line');
      for (const head of svg.querySelectorAll<SVGPathElement>('path.story-map-head')) {
        out.heads++;
        const [tip, a, b] = head.getAttribute('d')!.replace(/[MZ]/g, '').split('L').map((pair) => pair.split(',').map(Number));
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const length = Math.hypot(tip[0] - mid[0], tip[1] - mid[1]);
        const u = [(tip[0] - mid[0]) / length, (tip[1] - mid[1]) / length], n = [-u[1], u[0]];
        const across = (back: number) => {
          let width = 0;
          for (let s = -40; s <= 40; s += 0.5) if (head.isPointInFill(new DOMPoint(tip[0] - u[0] * back * length + n[0] * s, tip[1] - u[1] * back * length + n[1] * s))) width += 0.5;
          return width;
        };
        // The shaft's far end lies behind the head's base: the head points away from the line.
        const behind = !shaft || [[+shaft.getAttribute('x1')!, +shaft.getAttribute('y1')!], [+shaft.getAttribute('x2')!, +shaft.getAttribute('y2')!]]
          .every(([x, y]) => (x - mid[0]) * u[0] + (y - mid[1]) * u[1] <= 0.01);
        const matrix = head.getScreenCTM()!;
        const screenTip = new DOMPoint(tip[0], tip[1]).matrixTransform(matrix);
        const where = `head at ${Math.round(screenTip.x)},${Math.round(screenTip.y)}`;
        if (!(across(0.1) < across(0.9)) || !behind) out.wrongWay.push(where);
        const style = getComputedStyle(head);
        if (style.fill !== style.stroke || (shaft && style.fill !== getComputedStyle(shaft).stroke) || style.strokeLinejoin !== 'round') {
          out.offColour.push(`${where}: ${style.fill} / ${style.stroke}, ${style.strokeLinejoin} joins`);
        }
        // The visible tip, the outline's round join half a width past the vertex, on a cover's edge.
        const half = Number(head.getAttribute('stroke-width')) / 2;
        const { x, y } = new DOMPoint(tip[0] + u[0] * half, tip[1] + u[1] * half).matrixTransform(matrix);
        const gap = Math.min(...covers.map(r => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))));
        const tolerance = 2 * Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
        if (gap <= tolerance) out.touching++; else out.offCover.push(`${where}: ${gap.toFixed(3)} off`);
      }
    }
    return out;
  });
  expect(found.heads, 'one head per arrowed end in the data').toBe(arrowed);
  expect(found.wrongWay, 'heads that do not point along their line').toEqual([]);
  expect(found.offColour, 'heads not in their shaft\'s colour, or without round corners').toEqual([]);
  // The board's legend arrows point at nothing; every connector between stories ends on its cover.
  expect(found.touching / found.heads, `heads on a cover's edge (off: ${found.offCover.join('; ')})`).toBeGreaterThanOrEqual(0.9);
});
