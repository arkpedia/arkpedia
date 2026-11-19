import assert from 'node:assert/strict';
import test from 'node:test';
import { artItemId, baseSkillItemId, catalogueItems, operatorItemId, skillItemId, skinItemId, TIER_KINDS, type TierCatalogue } from '../../lib/tier-list/catalogue';
import { addRow, clearRows, defaultTierList, deleteRow, labelInk, moveRow, parseTierList, placeItems, poolItems, returnToPool, setZoom, toggleKind, toggleRarity, updateRow, MAX_LABEL, ZOOM } from '../../lib/tier-list/state';
import { decodeTierList, encodeTierList, MAX_SHARE_CHARS, sharePayload } from '../../lib/tier-list/share';
import { TIER_LIST_STRINGS } from '../../lib/tier-list/strings';

const catalogue: TierCatalogue = { operators: [
  { id: 'char_b', name: 'Bravo', rarity: 5, icon: '/five-star-icons/Bravo.webp', art: [], skins: [], skills: [[1, 'Strike', '/skill-icons/b1.webp']], baseSkills: [] },
  { id: 'char_a', name: 'Alpha', rarity: 6, icon: '/six-star-icons/Alpha.webp', skins: [['char_a@x#1', 'Coat']], art: ['Base', 'Elite 2'], skills: [[1, 'One', '/skill-icons/a1.webp'], [2, 'Two']], baseSkills: [['buff[000]', 'Tidy']] },
  { id: 'char_c', name: 'Charlie', rarity: 4, icon: null, art: [], skins: [], skills: [], baseSkills: [] },
] };
const items = catalogueItems(catalogue);
const A = operatorItemId('char_a'), B = operatorItemId('char_b'), COAT = skinItemId('char_a@x#1'), A2 = skillItemId('char_a', 2);
const ids = (list: { id: string }[]) => list.map((item) => item.id);

const E0 = artItemId('char_a', 'Base'), E2 = artItemId('char_a', 'Elite 2'), TIDY = baseSkillItemId('char_a', 'buff[000]');
const ALL = { ...defaultTierList(), kinds: [...TIER_KINDS] };

test('the catalogue expands to unique items, highest rarity first, and skips art that is missing', () => {
  assert.deepEqual(ids(items), [A, E0, E2, COAT, skillItemId('char_a', 1), A2, TIDY, B, skillItemId('char_b', 1)]);
  assert.equal(new Set(ids(items)).size, items.length);
  assert.equal(items.find((item) => item.id === COAT)?.name, 'Alpha - Coat');
  // A path the catalogue leaves out is the one the names give; one it carries is kept.
  const image = (id: string) => items.find((item) => item.id === id)?.image;
  assert.deepEqual([image(COAT), image(E2), image(A2), image(TIDY), image(skillItemId('char_a', 1))], ['/six-star-skins/Alpha - Coat.webp', '/six-star-skins/Alpha - Elite 2.webp', '/skill-icons/Alpha%20-%20Two.webp', '/base-skill-icons/Alpha%20-%20Tidy.webp', '/skill-icons/a1.webp']);
  assert.deepEqual([E0, E2, TIDY], ['art:char_a:0', 'art:char_a:2', 'base:char_a:buff[000]'], 'ids are in shared links: they do not change');
});

test('the default list offers 6★ and 5★ operator icons in five rows', () => {
  const state = defaultTierList();
  assert.deepEqual(state.rows.map((row) => row.label), ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(ids(poolItems(items, state)), [A, B]);
});

test('the checkboxes choose the pool by rarity and by kind', () => {
  assert.equal(poolItems(items, ALL).length, 9);
  let state = toggleRarity(ALL, 5, false);
  assert.deepEqual(ids(poolItems(items, state)), [A, E0, E2, COAT, skillItemId('char_a', 1), A2, TIDY]);
  // Elite 0 and Elite 2 art are separate choices.
  assert.deepEqual(ids(poolItems(items, { ...defaultTierList(), kinds: ['e0'] })), [E0]);
  assert.deepEqual(ids(poolItems(items, { ...defaultTierList(), kinds: ['e2'] })), [E2]);
  state = toggleKind(toggleKind(toggleKind(state, 'icons', false), 'e0', false), 'e2', false);
  assert.deepEqual(state.kinds, ['skins', 'skills', 'baseSkills']);
  assert.deepEqual(ids(poolItems(items, toggleKind(defaultTierList(), 'baseSkills', true))), [A, TIDY, B]);
  assert.equal(poolItems(items, toggleRarity(state, 6, false)).length, 0);
});

test('a placed item leaves the pool and stays in its row when its filter is unticked', () => {
  let state = placeItems(defaultTierList(), [B], 'r1');
  assert.deepEqual(ids(poolItems(items, state)), [A]);
  state = toggleRarity(state, 5, false);
  assert.deepEqual(state.rows[0].items, [B]);
  assert.deepEqual(ids(poolItems(items, returnToPool(state, [B]))), [A], 'back in the pool, which its rarity filter now hides');
});

test('placing moves between rows and inserts at the drawn index', () => {
  let state = placeItems(defaultTierList(), [A, B, COAT], 'r1');
  state = placeItems(state, [COAT], 'r1', 0);
  assert.deepEqual(state.rows[0].items, [COAT, A, B]);
  state = placeItems(state, [COAT], 'r1', 2);
  assert.deepEqual(state.rows[0].items, [A, COAT, B], 'index 2 counts the moved tile itself');
  state = placeItems(state, [A], 'r2');
  assert.deepEqual([state.rows[0].items, state.rows[1].items], [[COAT, B], [A]]);
  assert.equal(placeItems(state, [A], 'nope'), state);
  assert.equal(new Set(state.rows.flatMap((row) => row.items)).size, 3);
});

test('an item dragged out of the tier list is back in the pool', () => {
  let state = placeItems(placeItems(defaultTierList(), [A], 'r1'), [B], 'r2');
  assert.deepEqual(ids(poolItems(items, state)), []);
  state = returnToPool(state, [A]);
  assert.deepEqual([state.rows[0].items, state.rows[1].items, ids(poolItems(items, state))], [[], [B], [A]]);
  assert.equal(returnToPool(state, []), state);
});

test('zoom moves in steps between its limits', () => {
  let state = defaultTierList();
  assert.equal(state.zoom, 100);
  state = setZoom(state, state.zoom + ZOOM.step);
  assert.equal(state.zoom, 125);
  assert.equal(setZoom(state, 9999).zoom, ZOOM.max);
  assert.equal(setZoom(state, -5).zoom, ZOOM.min);
  assert.equal(setZoom(state, 110).zoom, 100, 'snapped to a step');
  assert.equal(setZoom(state, Number.NaN).zoom, 100);
});

test('rows can be added, renamed, recoloured, moved, emptied and deleted without limit of five', () => {
  let state = defaultTierList();
  for (let i = 0; i < 20; i += 1) state = addRow(state);
  assert.equal(state.rows.length, 25);
  assert.equal(new Set(state.rows.map((row) => row.id)).size, 25);
  state = addRow(defaultTierList(), 'r1');
  assert.deepEqual(state.rows.map((row) => row.id), ['r1', 'r6', 'r2', 'r3', 'r4', 'r5']);
  state = updateRow(state, 'r6', { label: 'x'.repeat(200), color: '#ABCDEF' });
  assert.equal(state.rows[1].label.length, MAX_LABEL);
  assert.equal(state.rows[1].color, '#abcdef');
  assert.equal(updateRow(state, 'r6', { color: 'red' }).rows[1].color, '#abcdef');
  assert.deepEqual(moveRow(state, 'r6', -1).rows.map((row) => row.id).slice(0, 2), ['r6', 'r1']);
  assert.equal(moveRow(state, 'r1', -1), state);
  state = placeItems(state, [A], 'r6');
  assert.deepEqual(ids(poolItems(items, deleteRow(state, 'r6'))), [A, B], 'a deleted row gives its items back');
  assert.deepEqual(ids(poolItems(items, clearRows(state))), [A, B]);
  assert.equal(clearRows(state).rows.length, 6);
});

test('a saved list round-trips, and a damaged one is repaired or refused', () => {
  const state = setZoom(placeItems(updateRow(defaultTierList(), 'r1', { label: 'Best' }), [A, COAT], 'r1'), 150);
  assert.deepEqual(parseTierList(JSON.stringify(state)), state);
  for (const raw of [null, '', 'not json', '[]', '{"version":2,"rows":[]}', '{"version":1}']) assert.equal(parseTierList(raw), null);
  const repaired = parseTierList(JSON.stringify({ version: 1, title: 7, rows: [{ id: 'r1', label: 'S', color: 'javascript:1', items: [A, A, 5, 'gone:1'] }, null, { id: 'r1', items: [A, B] }], rarities: [6, 9, 'x'], kinds: ['skills', 'nope', 'art'], zoom: 'big', removed: [B, COAT] }))!;
  assert.deepEqual(repaired.rows.map((row) => row.id), ['r1', 'r1x']);
  assert.match(repaired.rows[0].color, /^#[0-9a-f]{6}$/);
  assert.deepEqual(repaired.rows[0].items, [A, 'gone:1'], 'an id the catalogue no longer has is kept, the page skips it');
  assert.deepEqual(repaired.rows[1].items, [B], 'an item is held once');
  assert.deepEqual([repaired.title, repaired.rarities, repaired.kinds, repaired.zoom], ['', [6], ['skills'], 100]);
  assert.ok(!('removed' in repaired), 'a list saved when items could be removed: they are simply back in the pool');
  assert.deepEqual(ids(poolItems(items, { ...repaired, kinds: ['icons', 'skins', 'skills'] })), [COAT, skillItemId('char_a', 1), A2]);
  assert.equal(parseTierList(JSON.stringify({ ...defaultTierList(), zoom: 200 }))?.zoom, 200);
  assert.equal(parseTierList(JSON.stringify({ ...defaultTierList(), zoom: undefined }))?.zoom, 100, 'a list saved before zoom');
});

test('label ink follows the colour', () => {
  assert.equal(labelInk('#ff7f7f'), 'dark');
  assert.equal(labelInk('#3b3b3b'), 'light');
  assert.equal(labelInk('#000000'), 'light');
  assert.equal(labelInk('#ffffff'), 'dark');
});

test('the built catalogue has stable ids and published art for every rarity', async () => {
  const fs = await import('node:fs');
  if (!fs.existsSync('data/tier-list-catalogue.json')) return; // written by generate:public
  const built = catalogueItems(JSON.parse(fs.readFileSync('data/tier-list-catalogue.json', 'utf8')) as TierCatalogue);
  assert.equal(new Set(ids(built)).size, built.length);
  for (const kind of TIER_KINDS) assert.ok(built.filter((item) => item.kind === kind).length > 300, kind);
  // A path in the image repository, or a new outfit's art named in full at its skin-asset commit.
  assert.ok(built.every((item) => (item.image.startsWith('/') || item.image.startsWith('https://raw.githubusercontent.com/arkpedia/arkpedia-skin-assets/')) && item.name && item.rarity >= 1 && item.rarity <= 6));
});

test('a list holding everything the catalogue offers still fits in a link', async () => {
  const fs = await import('node:fs');
  if (!fs.existsSync('data/tier-list-catalogue.json')) return; // written by generate:public
  const built = catalogueItems(JSON.parse(fs.readFileSync('data/tier-list-catalogue.json', 'utf8')) as TierCatalogue);
  const state = placeItems(defaultTierList(), ids(built), 'r1');
  const text = await encodeTierList(state);
  assert.ok(text.length < MAX_SHARE_CHARS, `${built.length} items make a ${text.length}-character link`);
  assert.equal((await decodeTierList(text))?.rows[0].items.length, built.length);
  assert.ok(built.every((item) => /^(op|art|skin|skill|base):char_\d+_\w+/.test(item.id)), 'every id is built on a game id');
});

test('every string the page shows is in one table', () => {
  assert.ok(TIER_LIST_STRINGS.title && TIER_LIST_STRINGS.kinds.skins && TIER_LIST_STRINGS.rarity(6));
});

test('a list survives the trip through a link, and the link carries only the list', async () => {
  const state = toggleRarity(placeItems(placeItems(updateRow({ ...defaultTierList(), title: 'Mine ★', zoom: 175 }, 'r1', { label: 'Best', color: '#123456' }), [A, COAT, TIDY], 'r1'), [E2], 'r3'), 5, false);
  const text = await encodeTierList(state);
  assert.match(text, /^[01][A-Za-z0-9_-]+$/);
  const back = (await decodeTierList(text))!;
  assert.deepEqual(back.rows.map((row) => [row.label, row.color, row.items]), state.rows.map((row) => [row.label, row.color, row.items]));
  assert.deepEqual([back.title, back.zoom, back.rarities, back.kinds], ['Mine ★', 175, defaultTierList().rarities, defaultTierList().kinds], 'the filters stay with their owner');
  assert.equal(sharePayload(`#list=${text}`), text);
  assert.equal(sharePayload('#view=results'), null);
  assert.equal(sharePayload(''), null);
  // The uncompressed form (a browser without CompressionStream) reads back too.
  const plain = `0${Buffer.from(JSON.stringify({ v: 1, t: 'Plain', z: 100, r: [['S', '#ff7f7f', [A]]] })).toString('base64url')}`;
  assert.deepEqual((await decodeTierList(plain))?.rows.map((row) => row.items), [[A]]);
});

test('a link that is not a tier list is refused, however it is wrong', async () => {
  const good = await encodeTierList(defaultTierList());
  const plain = (value: unknown) => `0${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
  for (const text of ['', '1', 'x' + good.slice(1), good.slice(0, 12), '1!!!!', plain(null), plain({ v: 2, r: [] }), plain({ v: 1 }), plain('text'), `1${'A'.repeat(MAX_SHARE_CHARS)}`]) {
    assert.equal(await decodeTierList(text), null, text.slice(0, 20));
  }
  // What it holds is repaired like a saved list: a script for a colour, a number for an item.
  const odd = (await decodeTierList(plain({ v: 1, t: 5, z: 'huge', r: [['<b>S</b>', 'javascript:1', [A, 7, A]], 'nope'] })))!;
  assert.deepEqual([odd.title, odd.zoom, odd.rows.length, odd.rows[0].items, odd.rows[0].label], ['', 100, 1, [A], '<b>S</b>']);
  assert.match(odd.rows[0].color, /^#[0-9a-f]{6}$/);
  // A payload that inflates past any real list is dropped while it is read.
  const bomb = `1${Buffer.from(await new Response(new Blob([new Uint8Array(2_000_000)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()).toString('base64url')}`;
  assert.ok(bomb.length < MAX_SHARE_CHARS);
  assert.equal(await decodeTierList(bomb), null);
});
