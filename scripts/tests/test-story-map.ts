import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Line } from '../../components/story/StoryMapView';
import { assertStoryMap, lineDrawing, storyListSections, storySections, UNPLACED, UNPLACED_NOTE, withManga, type StoryElement } from '../../lib/story/storyMap';
import { bundledStoryMap } from '../../lib/story/storyMapData';

/*
 * The Story page's List view groups the board's stories by its own labelled frames
 * (lib/story/storyMap.ts storySections). Held against the board as imported, so a change to
 * the board or to the grouping that scatters the stories is caught here, not on a phone.
 */
const map = bundledStoryMap();
const sections = storySections(map);
const pictures = map.elements.filter((element) => element.type === 'picture');

test('every picture on the board is in exactly one section', () => {
  const listed = sections.flatMap((section) => section.stories.map((story) => story.id));
  assert.equal(listed.length, pictures.length);
  assert.equal(new Set(listed).size, pictures.length);
});

test('the main story leads, in its order', () => {
  assert.match(sections[0].name, /First Main Story/);
  assert.equal(sections[0].stories[0].link?.story, 'main_0', 'Evil Time Part 1 first');
  const firstMain = sections[0].stories.map((story) => story.link?.story).filter((id) => id?.startsWith('main_'));
  assert.deepEqual(firstMain, [...firstMain].sort((a, b) => Number(a!.slice(5)) - Number(b!.slice(5))), 'the chapters in order');
});

test('a one-story frame is a section of its own, and a story beside a frame joins its neighbours', () => {
  const of = (story: string) => sections.find((section) => section.stories.some((picture) => picture.link?.story === story))?.name;
  assert.equal(of('act28side'), 'Columbia', 'Come Catastrophes or Wakes of Vultures');
  assert.equal(of('act39side'), 'Iberia', 'Exodus from the Pale Sea');
  assert.equal(of('act4d0'), 'Chernobog (First Main Story)', 'Operational Intelligence, hanging off the main story');
});

/*
 * The official comics (map.manga): placed under their board sections in the List view and in the
 * Manga frame below the board (withManga), the unplaced ones last under UNPLACED.
 */
test('every placed comic names a section the board has, so none is misfiled by a typo', () => {
  const names = new Set(sections.map((section) => section.name.toLowerCase()));
  const wrong = (map.manga ?? []).filter((comic) => comic.section && !names.has(comic.section.toLowerCase())).map((comic) => `${comic.title}: ${comic.section}`);
  assert.deepEqual(wrong, []);
});

test('the List view places each comic once, with the unplaced last under their note', () => {
  const listed = storyListSections(map);
  const comics = listed.flatMap((section) => section.stories.filter((story) => story.manga).map((story) => story.id));
  const offBoard = (map.manga ?? []).filter((comic) => !comic.onBoard);
  assert.equal(comics.length, offBoard.length);
  assert.equal(new Set(comics).size, comics.length);
  const sui = listed.find((section) => section.name === 'Sui');
  assert.ok(sui?.stories.some((story) => story.manga && /Sui's Daily Slices/.test(story.link?.title ?? '')), 'a Sui comic in Sui');
  const last = listed.at(-1)!;
  assert.equal(last.name, UNPLACED);
  assert.equal(last.note, UNPLACED_NOTE);
  assert.ok((map.manga ?? []).filter((comic) => comic.onBoard).every((comic) => !comics.includes(comic.id)), 'a comic that is a board picture is not listed twice');
});

test('the map draws every comic off the board below it, and grows to hold them', () => {
  const drawn = withManga(map);
  const covers = drawn.elements.filter((element) => element.type === 'picture' && element.manga);
  assert.equal(covers.length, (map.manga ?? []).filter((comic) => !comic.onBoard).length);
  assert.ok(drawn.bounds.height > map.bounds.height);
  const boardBottom = map.bounds.y + map.bounds.height;
  assert.ok(covers.every((cover) => cover.type === 'picture' && cover.y > boardBottom), 'below the board');
  assert.ok(drawn.elements.some((element) => element.type === 'text' && element.text === UNPLACED), 'the unplaced group is labelled');
});

/*
 * The board's arrows (lineDrawing, StoryMapView's Line): Canva draws each arrowed end as a filled
 * triangle in the line's colour, and the page draws the same in board units. Measured from the
 * view page's own SVG (every arrowed line, width 10): shaft to 27.5 short of the end, head from
 * 25 back and 15 each side to a tip 5 short, outlined at 10 with round joins.
 */
(globalThis as { React?: typeof React }).React = React;
type Line = Extract<StoryElement, { type: 'line' }>;
const line = (extra: Partial<Line> = {}): Line => ({ type: 'line', x1: 80, y1: 2100.2, x2: 130, y2: 2100.2, color: '#000000', width: 10, dash: null, ...extra });
const near = (a: readonly number[], b: readonly number[], what: string) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${what}: ${a} is not ${b}`);

test('a triangle head is Canva\'s, at the end it names', () => {
  const { shaft, heads } = lineDrawing(line({ end: 'triangle' }));
  assert.equal(heads.length, 1);
  near(heads[0][0], [125, 2100.2], 'the tip, 0.5w short of the end');
  near(heads[0][1], [105, 2115.2], 'a base corner, 2.5w back and 1.5w aside');
  near(heads[0][2], [105, 2085.2], 'the other base corner');
  near([shaft!.x2, shaft!.y2], [102.5, 2100.2], 'the shaft stops 2.75w short, under the head');
  near([shaft!.x1, shaft!.y1], [80, 2100.2], 'and starts where the line does');
});

test('a head points along its line, whichever way the line runs', () => {
  for (const [x2, y2] of [[591.7, 2107], [80, 1900], [-400, 2400], [80, 2600]]) {
    for (const at of ['start', 'end'] as const) {
      const l = line({ x1: 80, y1: 2100.2, x2, y2, [at]: 'triangle' });
      const [[tip, a, b]] = lineDrawing(l).heads;
      const [ex, ey] = at === 'end' ? [l.x2, l.y2] : [l.x1, l.y1];
      const [ox, oy] = at === 'end' ? [l.x1, l.y1] : [l.x2, l.y2];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // Outward: from the base toward the end it marks, i.e. away from the line's other end.
      assert.ok((tip[0] - mid[0]) * (ex - ox) + (tip[1] - mid[1]) * (ey - oy) > 0, `${at} of ->${x2},${y2} points outward`);
      assert.ok(Math.abs(Math.hypot(tip[0] - ex, tip[1] - ey) - 5) < 1e-6, 'its tip 0.5w short of the end');
      assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - 30) < 1e-6, 'its base 3w across');
    }
  }
});

test('a line with no heads draws as it did: one shaft, end to end, in the same box', () => {
  const html = renderToStaticMarkup(createElement(Line, { element: line({ dash: [3, 1] }) }));
  assert.equal((html.match(/<line /g) ?? []).length, 1);
  assert.doesNotMatch(html, /<path/);
  assert.match(html, /x1="10" y1="10" x2="60" y2="10"/);
  assert.match(html, /width:70px;height:20px/);
  assert.match(html, /stroke-dasharray="30 10"/);
});

test('a head in the shaft\'s colour, and the box holds it', () => {
  const html = renderToStaticMarkup(createElement(Line, { element: line({ end: 'triangle', color: '#5170ff', dash: [3, 1] }) }));
  assert.match(html, /<path class="story-map-head"[^>]*fill="#5170ff"[^>]*stroke="#5170ff"[^>]*stroke-width="10"/);
  const ink = renderToStaticMarkup(createElement(Line, { element: line({ end: 'triangle' }) }));
  assert.match(ink, /<path [^>]*fill="var\(--text\)"[^>]*stroke="var\(--text\)"/, 'the board\'s black is the theme\'s ink, head and all');
  const { box, heads } = lineDrawing(line({ end: 'triangle' }));
  for (const [x, y] of heads[0]) assert.ok(x - 5 >= box.x && x + 5 <= box.x + box.width && y - 5 >= box.y && y + 5 <= box.y + box.height, 'the head and its outline inside the box');
});

test('a line shorter than its head is the head alone', () => {
  const { shaft, heads } = lineDrawing(line({ x2: 105.9, end: 'triangle' }));
  assert.equal(shaft, null);
  assert.equal(heads.length, 1);
});

test('a head the page does not know fails the map, and is drawn as a plain end meanwhile', () => {
  const map = bundledStoryMap();
  const bad = { ...map, elements: [...map.elements, line({ end: 'arrow' as never })] };
  assert.throws(() => assertStoryMap(bad), /line head "arrow"/);
  assert.equal(lineDrawing(line({ end: 'arrow' as never })).heads.length, 0);
});

test('the drawn arrow\'s head sits at the end the data names and points along the line', () => {
  // Roaring Flare -> Vigilo as the importer writes it, and the same line drawn backwards.
  for (const element of [line({ x1: 4204.8, y1: 2100.2, x2: 4557.4, y2: 1816.3, end: 'triangle' }), line({ x1: 4557.4, y1: 1816.3, x2: 4204.8, y2: 2100.2, start: 'triangle' })]) {
    const html = renderToStaticMarkup(createElement(Line, { element }));
    const [, left, top] = html.match(/left:([-\d.]+)px;top:([-\d.]+)px/)!.map(Number);
    const heads = [...html.matchAll(/<path class="story-map-head" d="([^"]+)"/g)];
    assert.equal(heads.length, 1, 'one head');
    const [tip, a, b] = heads[0][1].replace(/[MZ]/g, '').split('L').map((pair) => pair.split(',').map(Number)).map(([x, y]) => [x + left, y + top]);
    const at = element.end ? [element.x2, element.y2] : [element.x1, element.y1];
    const from = element.end ? [element.x1, element.y1] : [element.x2, element.y2];
    assert.ok(Math.abs(Math.hypot(tip[0] - at[0], tip[1] - at[1]) - 5) < 0.01, `the tip 0.5w short of ${at}, at ${tip}`);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const along = [at[0] - from[0], at[1] - from[1]];
    const cos = ((tip[0] - mid[0]) * along[0] + (tip[1] - mid[1]) * along[1]) / (Math.hypot(tip[0] - mid[0], tip[1] - mid[1]) * Math.hypot(...along));
    assert.ok(cos > 0.9999, `the head points along the line, toward ${at} (cos ${cos})`);
    const [, sx1, sy1, sx2, sy2] = html.match(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/)!.map(Number);
    const shaftNearHead = element.end ? [sx2 + left, sy2 + top] : [sx1 + left, sy1 + top];
    assert.ok(Math.abs(Math.hypot(shaftNearHead[0] - at[0], shaftNearHead[1] - at[1]) - 27.5) < 0.01, 'the shaft stops under the head, never past its tip');
  }
});

test('a null end is a plain end, and the map accepts it', () => {
  assert.equal(lineDrawing(line({ start: null, end: null })).heads.length, 0);
  const map = bundledStoryMap();
  assert.doesNotThrow(() => assertStoryMap({ ...map, elements: [...map.elements, line({ start: null, end: 'triangle' })] }));
});
