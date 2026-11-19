import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueItems, enemyItemId, operatorItemId, type TierCatalogue } from '../../lib/tier-list/catalogue';
import { cellColor, chartPlaced, chartPool, clearChart, defaultChart, parseChart, placeInCell, placePoint, resizeGrid, setAxis, setCellLabel, setChartKind, unplace, CHART_SIDE } from '../../lib/tier-list/chart';
import { decodeChart, encodeChart } from '../../lib/tier-list/chartShare';
import { CHART_STRINGS } from '../../lib/tier-list/chartStrings';
import { GROUPS, LINKS, isActiveLink } from '../../lib/nav/navLinks';

const catalogue: TierCatalogue = { operators: [
  { id: 'char_a', name: 'Alpha', rarity: 6, icon: '/six-star-icons/Alpha.webp', art: [], skins: [], skills: [], baseSkills: [] },
  { id: 'char_b', name: 'Bravo', rarity: 5, icon: '/five-star-icons/Bravo.webp', art: [], skins: [], skills: [], baseSkills: [] },
  { id: 'char_c', name: 'Charlie', rarity: 4, icon: '/four-star-icons/Charlie.webp', art: [], skins: [], skills: [], baseSkills: [] },
], enemies: [['slug', 'Slug']] };
const items = catalogueItems(catalogue);
const A = operatorItemId('char_a'), B = operatorItemId('char_b'), SLUG = enemyItemId('slug');
const ids = (list: { id: string }[]) => list.map((item) => item.id);

test('a new chart is the classic three by three, on the tier list\'s default pool', () => {
  const chart = defaultChart();
  assert.deepEqual([chart.kind, chart.cols, chart.rows, chart.cells.length], ['grid', 3, 3, 9]);
  assert.deepEqual([chart.cells[0].label, chart.cells[4].label, chart.cells[8].label], ['Lawful Good', 'True Neutral', 'Chaotic Evil']);
  assert.deepEqual(ids(chartPool(items, chart)), [A, B]);
  assert.deepEqual(ids(chartPool(items, { ...chart, rarities: [], kinds: ['icons', 'enemies'] })), [SLUG]);
});

test('the grid holds items in cells, in order, each item once', () => {
  let chart = placeInCell(defaultChart(), [A, B], 4);
  assert.deepEqual([chart.cells[4].items, ids(chartPool(items, chart))], [[A, B], []]);
  chart = placeInCell(chart, [B], 4, 0);
  assert.deepEqual(chart.cells[4].items, [B, A]);
  chart = placeInCell(chart, [A], 0);
  assert.deepEqual([chart.cells[0].items, chart.cells[4].items], [[A], [B]]);
  assert.equal(placeInCell(chart, [A], 99), chart);
  chart = unplace(chart, [A]);
  assert.deepEqual([chart.cells[0].items, ids(chartPool(items, chart))], [[], [A]]);
  assert.deepEqual(chartPlaced(clearChart(chart)), []);
  assert.equal(clearChart(chart).cells[4].label, 'True Neutral');
});

test('resizing the grid keeps each cell in its column and row, and gives back what a removed cell held', () => {
  let chart = placeInCell(placeInCell(setCellLabel(defaultChart(), 8, 'Corner'), [A], 8), [B], 1);
  chart = resizeGrid(chart, 5, 4);
  assert.deepEqual([chart.cols, chart.rows, chart.cells.length], [5, 4, 20]);
  assert.deepEqual([chart.cells[1].items, chart.cells[1].label, chart.cells[12].items, chart.cells[12].label, chart.cells[3].label], [[B], 'Neutral Good', [A], 'Corner', '']);
  chart = resizeGrid(chart, 2, 2);
  assert.deepEqual([chart.cells.map((cell) => cell.label), chartPlaced(chart), ids(chartPool(items, chart))], [['Lawful Good', 'Neutral Good', 'Lawful Neutral', 'True Neutral'], [B], [A]]);
  assert.deepEqual([resizeGrid(chart, 99, 0).cols, resizeGrid(chart, 99, 0).rows], [CHART_SIDE.max, CHART_SIDE.min]);
  assert.equal(resizeGrid(chart, 2, 2), chart);
});

test('the axes version places an item anywhere, moves it, and keeps its own placements', () => {
  let chart = setChartKind(placeInCell(defaultChart(), [A], 0), 'axes');
  assert.deepEqual(ids(chartPool(items, chart)), [A, B], 'what the grid holds is free on the plane');
  chart = placePoint(placePoint(chart, A, 0.25, 0.75), B, 2, -1);
  assert.deepEqual(chart.points, [{ id: A, x: 0.25, y: 0.75 }, { id: B, x: 1, y: 0 }]);
  chart = placePoint(chart, A, 0.5, 0.5);
  assert.deepEqual(chart.points, [{ id: B, x: 1, y: 0 }, { id: A, x: 0.5, y: 0.5 }], 'a moved item is one point, on top');
  chart = setAxis(setAxis(chart, 'top', 'Seiso'), 'left', 'x'.repeat(99));
  assert.deepEqual([chart.axes.top, chart.axes.left.length], ['Seiso', 40]);
  chart = unplace(chart, [B]);
  assert.deepEqual([ids(chartPool(items, chart)), setChartKind(chart, 'grid').cells[0].items], [[B], [A]], 'switching back, the grid is as it was');
  assert.deepEqual(clearChart(chart).points, []);
});

test('a saved chart round-trips, and a damaged one is repaired or refused', () => {
  const chart = placePoint(placeInCell(setAxis(resizeGrid(defaultChart(), 2, 3), 'right', 'Sane'), [A], 5), B, 0.1, 0.9);
  assert.deepEqual(parseChart(JSON.stringify(chart)), chart);
  for (const raw of [null, '', 'nope', '[]', '{"version":2,"cells":[]}', '{"version":1}']) assert.equal(parseChart(raw), null);
  const repaired = parseChart(JSON.stringify({ version: 1, kind: 'pie', cols: 2, rows: 99, cells: [{ label: 5, items: [A, A, 7] }, null, { items: [A, B] }], points: [{ id: A, x: 'left', y: 4 }, { id: A, x: 0, y: 0 }, 'x'], axes: { top: 3 }, zoom: 'huge', rarities: [6, 'x'], kinds: ['icons', 'nope'] }))!;
  assert.deepEqual([repaired.kind, repaired.cols, repaired.rows, repaired.cells.length], ['grid', 2, CHART_SIDE.max, 14]);
  assert.deepEqual([repaired.cells[0], repaired.cells[1], repaired.cells[2].items], [{ label: '', items: [A] }, { label: '', items: [] }, [B]]);
  assert.deepEqual([repaired.points, repaired.axes.top, repaired.zoom, repaired.rarities, repaired.kinds], [[{ id: A, x: 0.5, y: 1 }], '', 100, [6], ['icons']]);
});

test('a chart link carries the version on screen, and a template carries it empty', async () => {
  const grid = placeInCell(setCellLabel({ ...resizeGrid(defaultChart(), 2, 2), title: 'Mine', zoom: 150, names: false, kinds: ['icons', 'enemies'], rarities: [6] }, 3, 'Gremlin'), [A, SLUG], 3);
  const full = (await decodeChart(await encodeChart(grid)))!;
  assert.equal(full.mode, 'full');
  assert.deepEqual([full.state.kind, full.state.cols, full.state.rows, full.state.cells, full.state.title, full.state.zoom, full.state.names, full.state.kinds, full.state.rarities], ['grid', 2, 2, grid.cells, 'Mine', 150, false, ['icons', 'enemies'], [6]]);
  const template = (await decodeChart(await encodeChart(grid, 'template')))!;
  assert.deepEqual([template.mode, template.state.cells.map((cell) => [cell.label, cell.items]), template.state.kinds], ['template', [['Lawful Good', []], ['Neutral Good', []], ['Lawful Neutral', []], ['Gremlin', []]], ['icons', 'enemies']]);

  const axes = placePoint(placePoint(setAxis(setAxis(setChartKind(grid, 'axes'), 'top', 'Seiso'), 'bottom', 'Yabai'), A, 0.123, 0.987), B, 1, 0);
  const shared = (await decodeChart(await encodeChart(axes)))!.state;
  assert.deepEqual([shared.kind, shared.axes, shared.points], ['axes', { top: 'Seiso', bottom: 'Yabai', left: '', right: '' }, [{ id: A, x: 0.123, y: 0.987 }, { id: B, x: 1, y: 0 }]]);
  assert.deepEqual(chartPlaced(shared).length, 2);
  assert.deepEqual((await decodeChart(await encodeChart(axes, 'template')))!.state.points, []);

  const plain = (value: unknown) => `0${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
  for (const text of ['', 'x', plain(null), plain({ v: 2, m: 'f', k: 'g' }), plain({ v: 1, m: 'q', k: 'g', g: [1, 1, []] }), plain({ v: 1, m: 'f', k: 'g' }), plain({ v: 1, m: 'f', k: 'z', g: [1, 1, []] })]) assert.equal(await decodeChart(text), null, text.slice(0, 16));
  // A tier list's link is not a chart.
  const { encodeTierList } = await import('../../lib/tier-list/share');
  const { defaultTierList } = await import('../../lib/tier-list/state');
  assert.equal(await decodeChart(await encodeTierList(defaultTierList())), null);
});

test('each cell has an accent of its own, the same on every render', () => {
  const colours = Array.from({ length: 25 }, (_, i) => cellColor(i, 5, 5));
  assert.equal(new Set(colours).size, 25);
  assert.ok(colours.every((colour) => /^hsl\(\d+ \d+% \d+%\)$/.test(colour)));
  assert.equal(cellColor(0, 1, 1), cellColor(0, 1, 1));
});

test('the two makers sit in Extras between Music and Games, and the chart maker is named in one place', () => {
  const extras = GROUPS.find((group) => group.id === 'extras')!.items;
  assert.deepEqual(extras.map((link) => link.href), ['/music', '/polls/tier-list', '/polls/chart-maker', '/games']);
  assert.equal(extras[2].label, CHART_STRINGS.navLabel);
  // They live under /polls/, and light Extras alone: not Community polls as well.
  const polls = LINKS.find((link) => link.href === '/polls')!;
  for (const maker of [extras[1], extras[2]]) assert.deepEqual([isActiveLink(maker, maker.href), isActiveLink(polls, maker.href)], [true, false]);
  assert.equal(isActiveLink(polls, '/polls/pull-or-skip'), true);
});
