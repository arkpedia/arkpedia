import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error Node scripts are plain JavaScript.
import { newsLines, newsSections, parseContents, parseDuration, parsePacks, postEventName, postWindow } from '../build/official-news.mjs';

/*
 * The official Global announcements (scripts/build/official-news.mjs), on posts cached by
 * sync-official-news.mjs. Each format below is one the archive uses: CONTENTS (2025-), DETAILS
 * holding the items (2026-07), CONTENT with HTML entities (2024-11), INCLUDES (2020-12).
 */
const post = (id: number) => JSON.parse(fs.readFileSync(`scripts/tests/fixtures/official-news/${id}.json`, 'utf8')) as { title: string; lines: string[] };
const packsOf = (id: number) => newsSections(post(id).lines).filter((s: { title: string }) => /PACK/.test(s.title)).flatMap(parsePacks);

test('People, A People: its window, its name, and its packs with their stated contents', () => {
  const people = post(4635);
  assert.equal(postEventName(people.title), 'PEOPLE, A PEOPLE');
  assert.deepEqual(postWindow(people.lines), { start: '2026-09-16T15:00:00.000Z', end: '2026-10-07T10:59:00.000Z' });
  const packs = packsOf(4635);
  assert.deepEqual(packs[0], { name: 'Rage of the Many Headhunting Pack', start: '2026-09-16T15:00:00.000Z', end: '2026-09-30T06:59:00.000Z', contents: [{ name: 'Rage of the Many Headhunting Permit', count: 2 }] });
  assert.ok(packs.some((p: { name: string }) => p.name === 'Rage of the Many Headhunting Bundle'));
});

test('every pack format the archive uses is read, and nothing uncountable is counted', () => {
  assert.deepEqual(packsOf(4084).find((p: { name: string }) => p.name === 'Orienteering Headhunting Pack')?.contents, [{ name: 'Ten-roll Headhunting Permit', count: 2 }, { name: 'Originite Prime', count: 9 }]);
  assert.deepEqual(packsOf(300).find((p: { name: string }) => p.name === 'Icebreaker Games Funding Box')?.contents, [{ name: 'Originite Prime', count: 16 }, { name: 'LMD', count: 700000 }]);
  const anniversary = packsOf(438).find((p: { name: string }) => p.name === 'RHODES ISLAND ANNIVERSARY PACKAGE');
  assert.equal(anniversary?.contents.find((c: { name: string }) => c.name === 'Originite Prime')?.count, 90);
  assert.deepEqual(parseContents('Caster Chip Pack * 8, Caster Chip * 5, and LMD * 210000.'), [{ name: 'Caster Chip Pack', count: 8 }, { name: 'Caster Chip', count: 5 }, { name: 'LMD', count: 210000 }]);
  assert.deepEqual(parseContents('Botani\'s Tokens, Module Materials, etc.'), [], 'prose is not a contents list');
  assert.deepEqual(parseContents('Originite Prime * 21, LMD * 1,000,000'), [{ name: 'Originite Prime', count: 21 }, { name: 'LMD', count: 1000000 }], 'a thousands comma is part of the count');
});

test('lines, sections and dates as the posts write them', () => {
  assert.deepEqual(newsLines('<p>DURATION :&nbsp;July 1</p><p>A &#x2014; B</p>'), ['DURATION: July 1', 'A — B']);
  assert.equal(parseDuration('July 9, 2024, 10:00 – July 23, 2024, 03:59 (UTC-7)')!.start, '2024-07-09T17:00:00.000Z');
  assert.equal(newsSections(['01 SIDESTORY: X OPEN', 'DETAILS: y', 'not a heading 02 x', '02 LIMITED-TIME PACKS AVAILABLE']).length, 2);
});
