import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getEnemyContents, getEnemySummaries } from '../../lib/enemies/enemies';
import { listedEnemies } from '../../lib/enemies/enemyListing';
import { codeForm, searchEnemies } from '../../lib/enemies/enemySearch';
import type { EnemySummary } from '../../lib/enemies/enemyTypes';

/*
 * The /enemies search box finds an enemy by name and code, and by what the filters choose
 * from: where it appears (a chapter or an event, by code or by name) and every chip's
 * value. These run over the catalogue itself, every content and every chip, so a new
 * content or value that the search cannot reach fails here.
 */
const rows = listedEnemies(getEnemySummaries());
const contents = getEnemyContents();
const search = (query: string) => new Set(searchEnemies(rows, query, contents).rows.map((row) => row.slug));
const where = (keep: (row: EnemySummary) => boolean) => new Set(rows.filter(keep).map((row) => row.slug));
const inContent = (id: string) => where((row) => (row.appears_in || []).includes(id));
const missing = (want: Set<string>, got: Set<string>) => [...want].filter((slug) => !got.has(slug));
const idOf = (label: string) => contents.find((content) => content.label === label)!.id;

test('a chapter written any way is that chapter, and only that one', () => {
  const ep01 = inContent('main_1');
  assert.ok(ep01.size > 5);
  for (const query of ['chapter 01', 'chapter 1', 'ch1', 'ch 01', 'ch 1', 'Chapter 1', 'ep 1', 'EP 01', 'ep01', 'episode 1']) {
    assert.deepEqual(search(query), ep01, query);
  }
  assert.deepEqual(search('chapter 10'), inContent('main_10'));
  assert.deepEqual(search('ch 16'), inContent(contents.find((content) => content.label === 'EP 16')!.id));
});

test('an event by its name or its code, and nothing from an event whose name only shares words', () => {
  const pa = inContent(idOf('PA'));
  assert.ok(pa.size > 0);
  for (const query of ['People, A People', 'People A People', 'people a people']) assert.deepEqual(search(query), pa, query);
  // Here A People Sows (HS) has "a" and "people" in its name too.
  const onlyHs = [...inContent(idOf('HS'))].filter((slug) => !pa.has(slug));
  assert.ok(onlyHs.length > 0);
  assert.deepEqual([...search('People A People')].filter((slug) => onlyHs.includes(slug)), []);
  // "PA" is the code, not every word starting pa (Partial Necrosis, Crowbar Patrolman).
  const byCode = search('PA');
  assert.deepEqual(missing(pa, byCode), []);
  for (const slug of byCode) {
    const row = rows.find((r) => r.slug === slug)!;
    assert.ok(pa.has(slug) || codeForm(row.index || '').startsWith('pa'), `${row.name} is not in PA`);
  }
});

test('every content with enemies is found by its code and by its name', () => {
  for (const content of contents) {
    const fields = inContent(content.id);
    if (!fields.size) continue;
    assert.deepEqual(missing(fields, search(content.name)), [], `${content.name}`);
    if (content.label) assert.deepEqual(missing(fields, search(content.label)), [], `${content.label} (${content.name})`);
  }
});

test('every filter chip\'s value finds every enemy the chip does', () => {
  const chips: [string, (row: EnemySummary) => boolean][] = [
    ...['Normal', 'Elite', 'Boss'].map((rank): [string, (row: EnemySummary) => boolean] => [rank, (row) => row.rank === rank]),
    // The rank tab's own name for Boss.
    ['Leader', (row) => row.rank === 'Boss'],
    ...[...new Set(rows.map((row) => row.race).filter(Boolean))].map((race): [string, (row: EnemySummary) => boolean] => [race!, (row) => row.race === race]),
    ['Other', (row) => !row.race],
    ...['Ground', 'Flying'].map((movement): [string, (row: EnemySummary) => boolean] => [movement, (row) => row.movement === movement]),
    ...['Melee', 'Ranged', 'Melee and Ranged'].map((position): [string, (row: EnemySummary) => boolean] => [position, (row) => row.attack_position === position]),
    ...['Physical', 'Arts', 'Healing', 'No Damage'].map((damage): [string, (row: EnemySummary) => boolean] => [damage, (row) => row.damage_type.includes(damage)]),
  ];
  for (const [value, keep] of chips) {
    const want = where(keep);
    assert.ok(want.size > 0, value);
    assert.deepEqual(missing(want, search(value)), [], value);
  }
});

test('a query that matches nothing whole is read word by word', () => {
  const flyingSarkaz = where((row) => row.movement === 'Flying' && row.race === 'Sarkaz');
  assert.ok(flyingSarkaz.size > 0);
  const found = search('flying sarkaz');
  assert.deepEqual(missing(flyingSarkaz, found), []);
  // Each word from the enemy itself -- 'Flying Boots' Mercenary is a Sarkaz -- never from
  // an event's name (Sarkaz's Furnaceside Fables fields flying Drones).
  for (const slug of found) {
    const row = rows.find((r) => r.slug === slug)!;
    const own = `${row.name} ${row.movement} ${row.race}`.toLowerCase();
    assert.ok(own.includes('flying') && own.includes('sarkaz'), row.name);
  }
  assert.deepEqual(search('ch 1 boss'), where((row) => row.rank === 'Boss' && (row.appears_in || []).includes('main_1')));
});

test('an enemy found by its own name leads the enemies found by where they appear', () => {
  // Misery is on the list at all only since listedEnemies, and sorts last in handbook
  // order; its content, Vector Breakthrough #2: Trial from Misery, fields 116 others.
  const found = searchEnemies(rows, 'misery', contents);
  assert.ok(found.rows.length > 100);
  const lead = found.rows.filter(found.own).map((row) => row.name);
  assert.ok(lead.length >= 1 && lead.every((name) => name === "'Misery', Blade of Silence"), lead.join(', '));
  // A code is a code there too: Crowbar Patrolman is in People, A People, but does not lead "PA".
  const pa = searchEnemies(rows, 'PA', contents);
  assert.ok(pa.rows.some((row) => row.name === 'Crowbar Patrolman'));
  assert.deepEqual(pa.rows.filter(pa.own).filter((row) => !codeForm(row.index || '').startsWith('pa')).map((row) => row.name), []);
});

test('names and codes match as they always did', () => {
  assert.ok([...search('slug')].some((slug) => rows.find((r) => r.slug === slug)!.name === 'Originium Slug'));
  assert.ok([...search('nium')].some((slug) => rows.find((r) => r.slug === slug)!.name === 'Originium Slug'), 'inside a word, as before');
  assert.ok([...search('B1')].some((slug) => rows.find((r) => r.slug === slug)!.index === 'B1'));
  assert.equal(search('').size, rows.length);
});

test('the grid lists every enemy but the handbook\'s hidden copies of listed ones', () => {
  const all = getEnemySummaries();
  const listedNames = new Set(rows.map((row) => row.name));
  assert.deepEqual([...new Set(all.map((row) => row.name))].filter((name) => !listedNames.has(name)), [], 'every creature is on the list');
  assert.ok(rows.some((row) => row.name === "'Misery', Blade of Silence"));
  const key = (row: EnemySummary) => `${row.name}|${row.index}`;
  const listed = new Set(rows.filter((row) => !row.hidden).map(key));
  const kept = new Set(rows.map((row) => row.slug));
  for (const row of all.filter((r) => !kept.has(r.slug))) assert.ok(row.hidden && listed.has(key(row)), `${row.name} is left out without a listed copy`);
  // Nothing filters on the flag alone again.
  for (const file of ['components/enemies/EnemyBrowser.tsx', 'pages/enemies/index.tsx']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /!\s*\w+\.hidden\b|\.hidden\)\s*continue/, `${file} filters on hidden alone; use listedEnemies`);
  }
});
