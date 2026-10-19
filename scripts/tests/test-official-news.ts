import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error Node scripts are plain JavaScript.
import { decodeEntities, newsArt, newsLines, newsSections, parseContents, parseDuration, parsePacks, parseLoginDays, parseSelectorTickets, postEventName, postWindow } from '../build/official-news.mjs';

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

test('an entity encoded twice is decoded all the way ("&amp;apos;" is an apostrophe)', () => {
  assert.equal(decodeEntities("Profile Theme &amp;apos;Vista&amp;apos;"), "Profile Theme 'Vista'");
  assert.deepEqual(newsLines('<p>CONTENTS: Profile Theme &amp;apos;Vista&amp;apos; &amp;times; 1</p>'), ["CONTENTS: Profile Theme 'Vista' × 1"]);
  assert.equal(decodeEntities('&unknown; stays'), '&unknown; stays');
});

test('every named reference HTML defines is decoded, and a number that is no character is left as written', () => {
  // A post can carry any of them: "&reg;" once stayed in a name and failed the stage's guard nightly.
  assert.equal(decodeEntities('Amiya&reg; &frac12; &Aacute;&aacute;'), 'Amiya® ½ Áá');
  // The quotes and the space read as the plain ones the game's tables write.
  assert.equal(decodeEntities('Kroos&rsquo;s &ldquo;Pack&rdquo;&nbsp;x'), 'Kroos\'s "Pack" x');
  // Under every name HTML gives them, not only the four common ones; "&ldquor;" is the low quote („), no alias.
  assert.equal(decodeEntities('Kroos&CloseCurlyQuote;s &rsquor;&OpenCurlyQuote; &OpenCurlyDoubleQuote;Pack&CloseCurlyDoubleQuote;&rdquor;&NonBreakingSpace;x &ldquor;'), 'Kroos\'s \'\' "Pack"" x \u201e');
  // Beyond U+10FFFF, or a lone surrogate: String.fromCodePoint threw a RangeError on these.
  assert.equal(decodeEntities('&#x110000; &#55296; &#x1F600;'), '&#x110000; &#55296; \u{1F600}');
});

test('Global EP17 packs have unique names, special pack rules, both selector pools and explicit sign-in days', () => {
  const sections = newsSections(post(4814).lines);
  const sale = sections.find((s: { title: string }) => s.title === 'LIMITED-TIME PACKS AVAILABLE');
  const packs = parsePacks(sale);
  assert.equal(packs.length, 16);
  assert.equal(new Set(packs.map((p: { name: string }) => p.name)).size, 16);
  assert.equal(packs.find((p: { name: string }) => p.name === 'Comprehensive Skill Training Pack').limit, 2);
  assert.ok(packs.find((p: { name: string }) => p.name === 'Newcomer Special Headhunting Pack').notes.some((n: string) => n.includes('Type-α')));
  const tickets = parseSelectorTickets(sale, 'https://www.arknights.global/news/4814');
  assert.equal(tickets['Top Operator Transfer Permit'].operators.length, 35);
  assert.equal(tickets['Top Operator Transfer Permit - Kernel'].operators.length, 48);
  assert.ok(tickets['Top Operator Transfer Permit'].operators.includes('Mon3tr'));
  assert.match(tickets['Top Operator Transfer Permit'].note, /December 14.*UTC-7/);
  const daily = parseLoginDays(sections.find((s: { title: string }) => s.title === '2026 CELEBRATION SIGN-IN EVENT OPEN'));
  assert.equal(daily.length, 10);
  assert.deepEqual(daily[1][1], { name: 'GALLUS²', count: 1, kind: 'operator' });
  assert.deepEqual(daily[6][1], { name: 'Aroma / Picnic Times', count: 1, kind: 'outfit' });
});

test('an unfamiliar login item preserves the notice instead of dropping part of a daily reward', () => {
  assert.deepEqual(parseLoginDays({ lines: ['Day 1: LMD * 10000, Unfamiliar reward wording'] }), []);
});

test("a post's pictures are kept as where they stand and their address on the website's host, nothing else", () => {
  const html = '<p><img src="https://webusstatic.yo-star.com/a.jpg"></p><h2>01 SANITY</h2><p>DETAILS: x</p><p>y<img src="https://webusstatic.yo-star.com/b.jpg?x=1&amp;y=2"></p>'
    + '<p><img src="https://images.example/c.jpg"><img src="http://webusstatic.yo-star.com/d.jpg"></p><h2>02 NEXT</h2>';
  assert.deepEqual(newsLines(html), ['01 SANITY', 'DETAILS: x', 'y', '02 NEXT']);
  assert.deepEqual(newsArt(html), [
    { url: 'https://webusstatic.yo-star.com/a.jpg', line: 0 },
    { url: 'https://webusstatic.yo-star.com/b.jpg?x=1&y=2', line: 3 },
  ]);
  assert.deepEqual(newsSections(newsLines(html)).map((s: { at: number }) => s.at), [0, 3]);
});
