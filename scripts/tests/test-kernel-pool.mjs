import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseWikiRows } from '../sync/catalogue-model.mjs';
import { datedKernelMoves, officialKernelLists, parseKernelMoves, planKernelMoves, reviewKernelPool } from '../sync/kernel-pool.mjs';
import { STAGE, syncKernelPool, yearlyPages } from '../sync/sync-kernel-pool.mjs';
import { readQuarantine } from '../lib/quarantine.mjs';

/*
 * The wiki's yearly banner pages as arknights.wiki.gg answered on 2026-10-14
 * (fixtures/kernel-pool/Headhunting-Banners-<year>.json), the operator records' pool fields
 * (fixtures/kernel-pool/records.json: every 5★ and 6★ after the batch of 2026-10-09 was moved by
 * hand, and the fourteen records that hand fix changed, as they were before it) and the official
 * Global posts that list the Kernel pool (fixtures/official-news). No network.
 */
const fixture = file => JSON.parse(fs.readFileSync(path.join('scripts/tests/fixtures', file), 'utf8'));
const page = year => fixture(`kernel-pool/Headhunting-Banners-${year}.json`).parse.wikitext['*'];
const records = fixture('kernel-pool/records.json');
const posts = [335, 1695, 2477, 2926, 4084, 4814].map(id => fixture(`official-news/${id}.json`));
const BATCH_SIX = ['Lee', 'Goldenglow', 'Fiammetta', 'Horn', 'Irene', 'Ebenholz', 'Dorothy'];
const BATCH_FIVE = ['Blacknight', 'Quercus', 'Kazemaru', 'Rockrock', 'Windflit', 'Hibiscus the Purifier', 'Greyy the Lightningbearer'];
const fresh = () => structuredClone(records.operators);
/** The records as they stood before the hand fix of 2026-10-14 (arkpedia-data 003abcaf). */
const beforeHandFix = () => {
  const before = new Map(records.beforeHandFix.map(op => [op.internalName, op]));
  return fresh().map(op => structuredClone(before.get(op.internalName) ?? op));
};
const byName = (list, name) => list.find(op => op.name === name);
const fields = op => [op.howToObtain?.['Standard Headhunting'], op.howToObtain?.['Kernel Headhunting'], op.characterInfo?.['Kernel Addition Date']];

test('the 2026 page states the batch Standard Pool #177 moved, dated by that pool\'s Global opening', () => {
  const { moves, problems } = datedKernelMoves(page(2026));
  assert.deepEqual(problems, []);
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].banner, { type: 'standard', number: 177, label: 'Standard Pool #177' });
  assert.equal(moves[0].day, '2026/10/09');
  assert.deepEqual(moves[0].operators, [...BATCH_SIX.map(name => ({ name, rarity: 6 })), ...BATCH_FIVE.map(name => ({ name, rarity: 5 }))]);
});

test('the 2023, 2024 and 2025 pages state no move (the wiki never wrote an Updates section on them), and nothing about them is reported', () => {
  for (const year of [2023, 2024, 2025]) assert.deepEqual(datedKernelMoves(page(year)), { moves: [], problems: [] }, String(year));
});

test('on the records as they were before the hand fix, the 2026 page reproduces it exactly; on the records after it, nothing changes', () => {
  const { moves } = datedKernelMoves(page(2026));
  const before = beforeHandFix();
  const plan = planKernelMoves({ operators: before, moves, source: 'Headhunting/Banners/2026' });
  assert.deepEqual(plan.held, []);
  assert.deepEqual(plan.changes.map(change => change.op.name).sort(), [...BATCH_SIX, ...BATCH_FIVE].sort());
  for (const { op, next } of plan.changes) {
    assert.deepEqual(fields(op), ['Yes', 'No', null], `${op.name} before`);
    assert.deepEqual(next, byName(records.operators, op.name), `${op.name} is written as the hand fix wrote it`);
  }
  // Applied (by hand or yesterday): no change and nothing to report.
  assert.deepEqual(planKernelMoves({ operators: fresh(), moves, source: 'Headhunting/Banners/2026' }), { changes: [], held: [] });
});

test('every batch on record is dated by the opening of a banner on the yearly pages: Kernel #1, Kernel #25, Standard Pool #155 and #177', () => {
  const openings = new Map();
  for (const year of [2023, 2024, 2025, 2026]) {
    for (const cell of parseWikiRows(page(year), 'Banners cell')) {
      if (!['standard', 'kernel'].includes(cell.type)) continue;
      const day = /^\d{4}\/\d{2}\/\d{2}/.exec(cell.start ?? '')?.[0];
      if (day) openings.set(day, [...(openings.get(day) ?? []), `${cell.type === 'kernel' ? 'Kernel' : 'Standard Pool'} #${cell.no}`]);
    }
  }
  const batches = new Map();
  for (const op of records.operators) {
    const day = op.characterInfo['Kernel Addition Date'];
    if (op.howToObtain?.['Kernel Headhunting'] === 'Yes' && op.howToObtain['Standard Headhunting'] === 'No' && /^\d{4}\//.test(day ?? '')) batches.set(day, (batches.get(day) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries([...batches.keys()].sort().map(day => [day, openings.get(day) ?? null])), {
    '2023/10/24': ['Kernel #1'],
    '2024/12/17': ['Kernel #25'],
    // Kal'tsit's, alone, and no banner's: the wiki's changelog dates her move December 17, 2024,
    // and the completeness guard holds it (below).
    '2025/10/14': null,
    '2025/12/05': ['Standard Pool #155'],
    '2026/10/09': ['Standard Pool #177'],
  });
});

const statement = (from, six, five = '') => `==Updates (Global)==\nFrom ${from}, the following Operators are removed from Standard Headhunting and added to Kernel Headhunting: {{Operator list\n|6star = ${six}${five ? `\n|5star = ${five}` : ''}}}\n\n==Trivia==\n`;
const cells = '{{Banners cell\n|type = standard\n|no = 190\n|start = 2027/03/05 04:00:00\n|end = 2027/03/19 03:59:59\n|operators = A, B, C, D, E}}\n{{Banners cell\n|type = kernel\n|no = 70\n|start = 2027/03/09 04:00:00\n|end = 2027/03/23 03:59:59\n|operators = A, B, C, D, E}}\n';
const plan = (text, operators = fresh()) => planKernelMoves({ operators, moves: datedKernelMoves(text).moves, source: 'Headhunting/Banners/2027' });

test('a move is one way: a record still in Standard moves, one already moved that day or with no day stays or gets the day, nothing moves back', () => {
  const operators = fresh();
  // A Standard operator moves; spellings the wiki uses for a record's name still find it.
  const moved = plan(cells + statement('Standard Pool #190', 'Hoolheyak'), operators);
  assert.deepEqual(moved.held, []);
  assert.deepEqual(moved.changes.map(({ next }) => [next.name, ...fields(next)]).sort(), [["Ho'olheyak", 'No', 'Yes', '2027/03/05']]);
  // Ch'en the Holungday is a limited operator: in neither pool, so held as it is.
  assert.equal(plan(cells + statement('Standard Pool #190', "Ch'en the Holungday")).held[0].key, `operator:${byName(operators, "Ch'en the Holungday").internalName}`);
  // "From Kernel #N" dates the move by that Kernel banner's opening.
  assert.deepEqual(plan(cells + statement('Kernel #70', 'Hoolheyak')).changes.map(({ next }) => fields(next)), [['No', 'Yes', '2027/03/09']]);
  // An operator already in Kernel Headhunting on the stated day: nothing to write, nothing to say.
  assert.deepEqual(plan(cells.replace('2027/03/05', '2026/10/09') + statement('Standard Pool #190', 'Goldenglow')), { changes: [], held: [] });
  // One the record dates otherwise is not rewritten, and is reported.
  const other = plan(cells + statement('Standard Pool #190', 'Goldenglow'));
  assert.deepEqual(other.changes, []);
  assert.match(other.held[0].reason, /^Goldenglow: .*records? dates its move to Kernel Headhunting "2026\/10\/09"; the record is left as it is$/);
  // One moved with no day recorded gets the stated one.
  const undated = fresh();
  byName(undated, 'Zima').characterInfo['Kernel Addition Date'] = null;
  assert.deepEqual(plan(cells.replace('2027/03/05', '2023/10/24') + statement('Standard Pool #190', '', 'Zima'), undated).changes.map(({ next }) => fields(next)), [['No', 'Yes', '2023/10/24']]);
  // A page whose statement is gone takes nothing back.
  assert.deepEqual(plan(cells), { changes: [], held: [] });
});

test('a statement is applied whole or not at all: one name no record answers to, or of another rarity, holds every operator it names', () => {
  for (const [six, five, why] of [['Hoederer, Not An Operator', '', /Not An Operator \(no operator record answers to it/], ['Hoederer, Lucilla', 'Almond', /Lucilla \(listed as 6★, but the record Lucilla is 5★\)/]]) {
    const result = plan(cells + statement('Standard Pool #190', six, five));
    assert.deepEqual(result.changes, []);
    assert.equal(result.held.length, 1);
    assert.equal(result.held[0].key, 'kernel-pool:Headhunting/Banners/2027#Standard Pool #190');
    assert.match(result.held[0].reason, why);
  }
});

test('a statement or a sentence about a move the parser cannot read is a problem, never a guess', () => {
  const problems = text => datedKernelMoves(text).problems;
  // Reworded: no statement read, and the section's text is reported.
  assert.match(problems(cells + statement('Standard Pool #190', 'Almond').replace('the following Operators are removed', 'these Operators leave')).join('\n'), /Updates section has text the parser does not recognise/);
  // A move stated anywhere else on the page.
  assert.match(problems(`${cells}==Trivia==\n*Almond was removed from Standard Headhunting early.\n`).join('\n'), /speaks of a pool move the parser does not recognise \("\*Almond was removed from Standard Headhunting early\."\)/);
  // A field that is not a rarity, and a banner the page has no row for.
  assert.match(problems(cells + statement('Standard Pool #190', 'Almond').replace('|6star', '|limited')).join('\n'), /lists operators under "limited", which is not a rarity/);
  assert.match(problems(cells + statement('Standard Pool #191', 'Almond')).join('\n'), /names Standard Pool #191, which has no row with a start date on the page/);
  // Two statements in one section are both read; a page with neither section nor mention has nothing.
  const two = cells + statement('Standard Pool #190', 'Almond').replace('\n\n==Trivia==\n', '\n') + statement('Kernel #70', 'Lucilla').replace('==Updates (Global)==\n', '');
  assert.deepEqual(datedKernelMoves(two).moves.map(move => [move.banner.label, move.day]), [['Standard Pool #190', '2027/03/05'], ['Kernel #70', '2027/03/09']]);
  assert.deepEqual(parseKernelMoves(cells), { moves: [], problems: [] });
});

/** A root with these records under data/, written the way the records are (two spaces, a newline). */
function treeWith(operators) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-kernel-pool-'));
  for (const op of operators) {
    const dir = path.join(root, 'data', `operators-${op.rarity}star`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${op.name}.json`), `${JSON.stringify(op, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(root, 'data/quarantine.json'), `${JSON.stringify({ version: 1, entries: [] }, null, 2)}\n`);
  return root;
}
const snapshot = root => Object.fromEntries(fs.readdirSync(path.join(root, 'data'), { recursive: true }).filter(file => file.endsWith('.json'))
  .map(file => [file, fs.readFileSync(path.join(root, 'data', file), 'utf8')]));

test('the stage writes the records a move changes and no other, and a second day writes nothing', async () => {
  const root = treeWith(beforeHandFix());
  try {
    const now = new Date('2026-10-14T12:00:00Z');
    const readText = async name => (name === 'Headhunting/Banners/2026' ? page(2026) : assert.fail(`read ${name}`));
    const before = snapshot(root);
    const first = await syncKernelPool(root, { now, readText });
    assert.equal(first.moved.length, 14);
    assert.deepEqual(first.held, []);
    const after = snapshot(root);
    const changed = Object.keys(after).filter(file => after[file] !== before[file]).sort();
    assert.deepEqual(changed, [...BATCH_FIVE.map(name => `operators-5star/${name}.json`), ...BATCH_SIX.map(name => `operators-6star/${name}.json`)].sort());
    for (const file of changed) assert.equal(after[file], `${JSON.stringify(byName(records.operators, JSON.parse(after[file]).name), null, 2)}\n`, file);
    const second = await syncKernelPool(root, { now, readText });
    assert.deepEqual(second, { moved: [], held: [] });
    assert.deepEqual(snapshot(root), after);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the stage reads this year\'s page and last year\'s, never one before 2026, and a page it cannot read is reported with the records left as they are', async () => {
  assert.deepEqual(yearlyPages(new Date('2026-10-14T00:00:00Z')), ['Headhunting/Banners/2026']);
  assert.deepEqual(yearlyPages(new Date('2027-01-05T00:00:00Z')), ['Headhunting/Banners/2026', 'Headhunting/Banners/2027']);
  const root = treeWith(beforeHandFix());
  try {
    const before = snapshot(root);
    const now = new Date('2027-01-05T00:00:00Z');
    // This year's page before the wiki creates it ('' in January) and last year's unreachable.
    const result = await syncKernelPool(root, { now, readText: async name => {
      if (name.endsWith('2027')) return '';
      throw new Error('the wiki could not be reached', { cause: new Error('fetch failed') });
    } });
    assert.deepEqual(result.moved, []);
    const entries = readQuarantine(root).entries;
    assert.deepEqual(entries.map(entry => [entry.key, entry.stage, entry.action]), [['kernel-pool:Headhunting/Banners/2026', STAGE, 'kept-previous']]);
    assert.match(entries[0].reason, /^Wiki page Headhunting\/Banners\/2026 cannot be read \(the wiki could not be reached\)/);
    assert.equal(entries[0].sourceRef, 'https://arknights.wiki.gg/wiki/Headhunting/Banners/2026');
    // Only the quarantine list changed.
    const after = snapshot(root);
    assert.deepEqual(Object.keys(after).filter(file => after[file] !== before[file]), ['quarantine.json']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the stage asks the wiki the way every wiki reader does: the parse API, following redirects, with the refresh\'s user agent', async t => {
  const root = treeWith(fresh().filter(op => op.name === 'Goldenglow'));
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    asked.push([String(url), init?.headers?.['User-Agent']]);
    return new Response(JSON.stringify(fixture('kernel-pool/Headhunting-Banners-2026.json')), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  try {
    const { moved, held } = await syncKernelPool(root, { now: new Date('2026-10-14T12:00:00Z') });
    assert.deepEqual(moved, []);
    // The batch's other thirteen operators are not in this tree: the statement is held whole.
    assert.match(held.map(entry => entry.reason).join('\n'), /names Lee \(no operator record answers to it/);
    assert.deepEqual(asked, [['https://arknights.wiki.gg/api.php?action=parse&page=Headhunting%2FBanners%2F2026&prop=wikitext&redirects=1&format=json', 'Arkpedia-refresh/1.0 (+https://arkpedia.net)']]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/* ------------------------------ The official evidence guard ------------------------------ */

test('the posts\' Kernel pool lists are read: the permit\'s range by its UTC day, each Kernel Locating by its opening, with or without a year', () => {
  const { lists, problems } = officialKernelLists(posts);
  assert.deepEqual(problems, []);
  assert.deepEqual(lists.map(list => [list.post.id, list.kind, list.day, list.six.length, list.five.length]), [
    ['335', 'locating', '2024/02/13', 12, 24],
    ['1695', 'permit', '2025/10/10', 36, 0],
    // "DURATION: January 27, 04:00 – February 10, 03:59 (UTC-7)": the year is the post's.
    ['2477', 'locating', '2026/01/27', 12, 24],
    // "2026 [THANK-YOU CELEBRATION] KERNEL LOCATING OPEN"
    ['2926', 'locating', '2026/04/21', 12, 24],
    // Post 4084's Orienteering also lists "All possible Operators:", and is not the Kernel pool.
    ['4084', 'locating', '2026/07/28', 12, 24],
    // Published 2026-10-09 03:58 UTC, the evening before the move on the server's clock.
    ['4814', 'permit', '2026/10/09', 48, 0],
    ['4814', 'locating', '2026/10/20', 12, 24],
  ]);
  assert.deepEqual(lists.at(-1).six.slice(0, 2), ['Goldenglow', 'Dorothy']);
  assert.deepEqual(lists.at(-1).five.slice(0, 2), ['Blacknight', 'Quercus']);
});

/** The records the official posts contradict, as of 2026-10-14 (after the hand fix). */
const HISTORY = {
  Beeswax: ['335'], Chiave: ['335'], "Kal'tsit": ['1695'], Manticore: ['2926'], Zima: ['2477', '4814'],
};
const heldNames = (holds, operators) => {
  const ids = new Map(operators.map(op => [`operator:${op.internalName}`, op.name]));
  const found = {};
  for (const hold of holds) {
    const name = ids.get(hold.key) ?? hold.key;
    const post = /news\/(\d+)/.exec(hold.reason)?.[1];
    (found[name] ??= []).push(post);
  }
  return found;
};

test('the guard holds every record an official post contradicts: today, five the hand-typed history got wrong', () => {
  const operators = fresh();
  const holds = reviewKernelPool({ operators, posts });
  assert.ok(holds.every(hold => hold.action === 'published-partial'));
  assert.deepEqual(heldNames(holds, operators), HISTORY);
  assert.match(holds.find(hold => hold.reason.startsWith("Kal'tsit")).reason,
    /^Kal'tsit: the Top Operator Transfer Permit - Kernel range in https:\/\/www\.arknights\.global\/news\/1695 has it in Kernel Headhunting by 2025\/10\/10, but its record dates the move 2025\/10\/14, later/);
  assert.match(holds.find(hold => hold.reason.startsWith('Zima')).reason, /but its record has no Kernel Addition Date \(null\)/);
  // With the days the wiki's changelogs give them (All Quiet Under the Thunder, Global 2023/10/24,
  // when Kernel Headhunting opened; Kal'tsit December 17, 2024), nothing is held.
  const corrected = fresh();
  for (const name of ['Beeswax', 'Chiave', 'Manticore', 'Zima']) byName(corrected, name).characterInfo['Kernel Addition Date'] = '2023/10/24';
  byName(corrected, "Kal'tsit").characterInfo['Kernel Addition Date'] = '2024/12/17';
  assert.deepEqual(reviewKernelPool({ operators: corrected, posts }), []);
});

test('before the hand fix the guard held the whole batch of 2026-10-09 the day Global announced it', () => {
  const operators = beforeHandFix();
  const found = heldNames(reviewKernelPool({ operators, posts }), operators);
  for (const name of BATCH_SIX) assert.ok(found[name]?.includes('4814'), `${name} held by post 4814`);
  // The two 5★ of the batch Kernel Locating #13 names.
  for (const name of ['Blacknight', 'Quercus']) assert.deepEqual(found[name], ['4814'], name);
  assert.match(reviewKernelPool({ operators, posts: [fixture('official-news/4814.json')] }).find(hold => hold.reason.startsWith('Goldenglow')).reason,
    /says Standard Headhunting "Yes" and Kernel Headhunting "No"/);
});

test('a permit\'s range is every 6★ in the pool: a kernel-exclusive 6★ it leaves out is held, and so is a name no record answers to', () => {
  const permit = { id: 9001, title: 'TEST', publishTime: Date.parse('2026-10-09T03:58:00Z'), url: 'https://www.arknights.global/news/9001',
    lines: ['You can select one 6★ Operator within a certain range. The range includes all 6★ Operators currently available in Kernel Headhunting:', 'Exusiai, Siege, Not An Operator.'] };
  const holds = reviewKernelPool({ operators: fresh(), posts: [permit] });
  assert.ok(holds.some(hold => hold.key === 'official-news:9001' && /names Not An Operator, which no 6★ operator record answers to/.test(hold.reason)));
  // Ifrit has been kernel-exclusive since 2023/10/24 and is not on this list.
  assert.match(holds.find(hold => hold.reason.startsWith('Ifrit')).reason, /its record has it in Kernel Headhunting from 2023\/10\/24, but the Top Operator Transfer Permit - Kernel range in https:\/\/www\.arknights\.global\/news\/9001, every 6★ in Kernel Headhunting on 2026\/10\/09, does not name it/);
  assert.equal(holds.filter(hold => hold.key.startsWith('operator:')).length, 46);
});

test('a Kernel Locating section the guard cannot read is held, not skipped', () => {
  const post = { id: 9002, title: 'TEST', publishTime: Date.parse('2026-10-09T03:58:00Z'), url: 'https://www.arknights.global/news/9002',
    lines: ['15 KERNEL LOCATING OPEN', 'DURATION: soon', 'All possible Operators:', '★★★★★★ (2%): Goldenglow'] };
  assert.deepEqual(reviewKernelPool({ operators: fresh(), posts: [post] }), [{ key: 'official-news:9002', action: 'published-partial',
    reason: 'https://www.arknights.global/news/9002 (TEST): its section "KERNEL LOCATING OPEN" has no DURATION or no "★★★★★★ (2%)" and "★★★★★ (8%)" lines the check can read, so the operator records\' Kernel Headhunting fields are not checked against it' }]);
});
