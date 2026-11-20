import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueItems, enemyItemId, operatorItemId, type TierCatalogue } from '../../lib/tier-list/catalogue';
import { BINGO_CENTER, cellColor, cellLabelColor, chartGrid, setCellColor, chartPlaced, chartPool, clearChart, defaultChart, isBingoFreeCell, parseChart, placeInCell, placePoint, removeGridLine, resizeGrid, setAxis, setAxisLine, setBingoFree, setBingoMarkColor, setCellLabel, setChartKind, setGridLabel, toggleBingoMark, unplace, CHART_SIDE } from '../../lib/tier-list/chart';
import { decodeChart, encodeChart } from '../../lib/tier-list/chartShare';
import { chartQuizPool, scoreChartQuiz } from '../../lib/tier-list/quiz';
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

test('Bingo copies the matching grid cells once and saves its own board and free space', async () => {
  const original = placeInCell(setCellLabel(defaultChart(), 4, 'Event prediction'), [A], 4);
  const bingo = setChartKind(original, 'bingo');
  const { cells, rows, cols } = chartGrid(bingo);
  assert.deepEqual([rows, cols, cells.length, cells[0].label], [5, 5, 25, '']);
  assert.deepEqual(cells[6], { label: 'Event prediction', items: [A] });
  assert.equal(isBingoFreeCell(bingo, BINGO_CENTER), true);
  assert.equal(placeInCell(bingo, [B], BINGO_CENTER), bingo);

  const edited = placeInCell(setCellLabel(setBingoFree(bingo, false), BINGO_CENTER, 'Center prompt'), [B], BINGO_CENTER);
  const originalAgain = setChartKind(edited, 'grid');
  assert.deepEqual(originalAgain.cells, original.cells);
  assert.deepEqual(chartGrid(setChartKind(originalAgain, 'bingo')).cells, chartGrid(edited).cells);
  assert.deepEqual(parseChart(JSON.stringify(edited)), edited);

  const free = toggleBingoMark(setBingoMarkColor(setBingoFree(edited, true), '#963019'), 6);
  assert.deepEqual(chartPlaced(free), [A]);
  assert.deepEqual(chartPlaced(setBingoFree(free, false)), [A, B]);
  assert.deepEqual(parseChart(JSON.stringify(free))!.bingo?.marks, [6]);
  assert.equal(parseChart(JSON.stringify(free))!.bingo?.markColor, '#963019');
  assert.equal(setBingoMarkColor(free, 'invalid'), free);
  assert.deepEqual(toggleBingoMark(free, 6).bingo?.marks, []);
  assert.equal(toggleBingoMark(free, 25), free);
  assert.equal(toggleBingoMark(original, 6), original);
  const full = (await decodeChart(await encodeChart(free)))!.state;
  assert.equal(full.kind, 'bingo');
  assert.equal(isBingoFreeCell(full, BINGO_CENTER), true);
  assert.deepEqual(chartPlaced(full), [A]);
  assert.deepEqual(full.bingo?.marks, []);
  assert.equal(full.bingo?.markColor, '#963019');
  assert.deepEqual(chartGrid(full).cells[BINGO_CENTER], { label: '', items: [] });
  const template = (await decodeChart(await encodeChart(edited, 'template')))!.state;
  assert.deepEqual(chartPlaced(template), []);
  assert.equal(chartGrid(template).cells[BINGO_CENTER].label, 'Center prompt');
  assert.equal(isBingoFreeCell(template, BINGO_CENTER), false);
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

test('any one column or row can be taken out, and the grid keeps at least one', () => {
  let chart = placeInCell(placeInCell(defaultChart(), [A], 1), [B], 5);
  chart = removeGridLine(chart, 'col', 1); // the middle column, which held A
  assert.deepEqual([chart.cols, chart.rows, chart.cells.map((cell) => cell.label)], [2, 3, ['Lawful Good', 'Chaotic Good', 'Lawful Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Chaotic Evil']]);
  assert.deepEqual([chart.cells[3].items, ids(chartPool(items, chart))], [[B], [A]]);
  chart = removeGridLine(chart, 'row', 0);
  assert.deepEqual([chart.rows, chart.cells.map((cell) => cell.label), chart.cells[1].items], [2, ['Lawful Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Chaotic Evil'], [B]]);
  chart = removeGridLine(removeGridLine(chart, 'row', 1), 'col', 0);
  assert.deepEqual([chart.cols, chart.rows, chart.cells.map((cell) => cell.label)], [1, 1, ['Chaotic Neutral']]);
  assert.equal(removeGridLine(chart, 'col', 0), chart);
  assert.equal(removeGridLine(chart, 'row', 0), chart);
  assert.equal(removeGridLine(defaultChart(), 'col', 9).cols, 3);
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

test('grid headers follow their lines and survive saves and every grid link', async () => {
  let chart = { ...placeInCell(defaultChart(), [A], 0), showGridHeaders: true, showCellLabels: false };
  chart = setGridLabel(setGridLabel(chart, 'row', 2, 'Evil'), 'col', 2, 'Chaotic');
  chart = resizeGrid(chart, 4, 4);
  chart = removeGridLine(removeGridLine(chart, 'col', 1), 'row', 1);
  assert.deepEqual(chart.columnLabels, ['', 'Chaotic', '']);
  assert.deepEqual(chart.rowLabels, ['', 'Evil', '']);
  assert.deepEqual(parseChart(JSON.stringify(chart)), chart);
  for (const mode of ['full', 'template', 'quiz'] as const) {
    const { state } = (await decodeChart(await encodeChart(chart, mode)))!;
    assert.deepEqual([state.showGridHeaders, state.columnLabels, state.rowLabels], [true, chart.columnLabels, chart.rowLabels]);
    assert.equal(state.showCellLabels, false);
    assert.equal(state.cells[0].label, 'Lawful Good');
  }
  const hidden = (await decodeChart(await encodeChart({ ...chart, showGridHeaders: false }, 'template')))!.state;
  assert.deepEqual([hidden.showGridHeaders, hidden.rowLabels], [false, chart.rowLabels]);

  const old = parseChart('{"version":1,"cols":2,"rows":1,"cells":[]}')!;
  assert.deepEqual([old.showGridHeaders, old.columnLabels, old.rowLabels], [false, ['', ''], ['']]);
  assert.equal(old.showCellLabels, true);
  assert.equal((await decodeChart(await encodeChart(defaultChart())))!.state.showCellLabels, true);
});

test('either axis can be hidden, or both, and the choice is kept in a save and a link', async () => {
  let chart = setChartKind(defaultChart(), 'axes');
  assert.deepEqual(chart.lines, { horizontal: true, vertical: true });
  chart = setAxisLine(placePoint(setAxis(chart, 'left', 'Weak'), A, 0.2, 0.5), 'vertical', false);
  assert.deepEqual([chart.lines, chart.axes.left, chart.points.length], [{ horizontal: true, vertical: false }, 'Weak', 1], 'hiding an axis moves nothing and forgets no label');
  assert.equal(setAxisLine(chart, 'vertical', false), chart);
  assert.deepEqual(parseChart(JSON.stringify(chart))!.lines, { horizontal: true, vertical: false });
  assert.deepEqual((await decodeChart(await encodeChart(chart)))!.state.lines, { horizontal: true, vertical: false });
  const neither = setAxisLine(chart, 'horizontal', false);
  assert.deepEqual((await decodeChart(await encodeChart(neither, 'template')))!.state.lines, { horizontal: false, vertical: false });
  // A chart saved or shared before the toggles has both.
  const { lines: _lines, ...old } = chart;
  assert.deepEqual(parseChart(JSON.stringify(old))!.lines, { horizontal: true, vertical: true });
  assert.deepEqual((await decodeChart(await encodeChart(setAxisLine(chart, 'vertical', true))))!.state.lines, { horizontal: true, vertical: true });
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
  for (const text of ['', 'x', plain(null), plain({ v: 2, m: 'f', k: 'g' }), plain({ v: 1, m: 'z', k: 'g', g: [1, 1, []] }), plain({ v: 1, m: 'q', k: 'a', a: [], p: [] }), plain({ v: 1, m: 'f', k: 'g' }), plain({ v: 1, m: 'f', k: 'z', g: [1, 1, []] })]) assert.equal(await decodeChart(text), null, text.slice(0, 16));
  // A tier list's link is not a chart.
  const { encodeTierList } = await import('../../lib/tier-list/share');
  const { defaultTierList } = await import('../../lib/tier-list/state');
  assert.equal(await decodeChart(await encodeTierList(defaultTierList())), null);
});

test('a grid quiz empties the cells, offers only what was placed, and is scored against the maker', async () => {
  const made = placeInCell(placeInCell(placeInCell({ ...defaultChart(), kinds: ['icons', 'enemies'] }, [A], 0), [B, SLUG], 4), [], 8);
  const shared = (await decodeChart(await encodeChart(made, 'quiz')))!;
  assert.equal(shared.mode, 'quiz');
  assert.deepEqual([chartPlaced(shared.state), shared.solution, shared.state.cells[4].label], [[], { [A]: 0, [B]: 4, [SLUG]: 4 }, 'True Neutral']);
  const solution = shared.solution!;
  const known = (id: string) => items.some((item) => item.id === id);
  assert.deepEqual(ids(chartQuizPool(items, { ...shared.state, kinds: [] }, solution)), [A, B, SLUG], 'the pool is what the maker placed, whatever the filters say');
  let attempt = placeInCell(placeInCell(shared.state, [A], 0), [B], 3);
  assert.deepEqual(ids(chartQuizPool(items, attempt, solution)), [SLUG]);
  let score = scoreChartQuiz(attempt, solution, known);
  assert.deepEqual([score.total, score.correct, score.percent, [...score.right], [...score.wrong]], [3, 1, 33, [A], [B]]);
  attempt = placeInCell(attempt, [SLUG, B], 4);
  score = scoreChartQuiz(attempt, solution, known);
  assert.deepEqual([score.correct, score.percent, score.wrong.size], [3, 100, 0]);
  assert.equal(scoreChartQuiz(attempt, { ...solution, 'op:gone': 2 }, known).total, 3);
  // Only a grid with something placed makes a quiz.
  assert.equal(await decodeChart(await encodeChart(defaultChart(), 'quiz')), null);
  await assert.rejects(encodeChart(setChartKind(made, 'axes'), 'quiz'));
});

test('each cell has an accent of its own, the same on every render', () => {
  const colours = Array.from({ length: 25 }, (_, i) => cellColor(i, 5, 5));
  assert.equal(new Set(colours).size, 25);
  assert.ok(colours.every((colour) => /^#[0-9a-f]{6}$/.test(colour)), 'the form a colour field takes');
  assert.equal(cellColor(0, 1, 1), cellColor(0, 1, 1));
});

test('a cell\'s label takes a colour of the reader\'s own, and keeps it through a resize, a save and a link', async () => {
  let chart = setCellColor(defaultChart(), 4, '#AA00FF');
  assert.deepEqual([chart.cells[4].color, cellLabelColor(chart, 4), cellLabelColor(chart, 0)], ['#aa00ff', '#aa00ff', cellColor(0, 3, 3)]);
  assert.equal(setCellColor(chart, 4, 'red'), chart);
  chart = resizeGrid(chart, 4, 3);
  assert.equal(chart.cells[5].color, '#aa00ff', 'the cell kept its column and row, and its colour');
  assert.equal(removeGridLine(chart, 'col', 0).cells[3].color, '#aa00ff', 'one column to the left now');
  assert.deepEqual(parseChart(JSON.stringify(chart)), chart);
  assert.equal(parseChart(JSON.stringify({ ...chart, cells: chart.cells.map((cell) => ({ ...cell, color: 'javascript:1' })) }))!.cells[5].color, undefined);
  for (const mode of ['full', 'template'] as const) assert.equal((await decodeChart(await encodeChart(chart, mode)))!.state.cells[5].color, '#aa00ff', mode);
  const back = setCellColor(chart, 5, null);
  assert.deepEqual(['color' in back.cells[5], cellLabelColor(back, 5)], [false, cellColor(5, 4, 3)]);
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
