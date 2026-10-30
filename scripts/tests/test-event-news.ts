import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { eventExtras, type TableRewardGroup } from '../../lib/events/tableRewards';

/*
 * The event page's News tab: the sections of an event's official announcement that no other part
 * of the page shows, and the in-game board's items above them. The groups themselves are built in
 * arkpedia-data's importer (its scripts/tests/test-event-news.ts holds build-event-rewards.mjs to
 * the real Critical Phase Transition post); here they stand as a release carries them.
 */
const source = 'https://www.arknights.global/news/4814';
const published = '2026-10-09T18:00:00.000Z';
const postArt = 'https://webusstatic.yo-star.com/web-cms-test/upload/content/2026/10/09/key.jpg';
const sectionArt = 'https://webusstatic.yo-star.com/web-cms-test/upload/content/2026/10/09/wwSVXZ7p.jpg';
const groups = [
  { kind: 'news', title: 'SANITY LIMIT INCREASE', source, published, postArt, art: [{ url: sectionArt, at: -1 }],
    lines: ['UPDATE TIME: October 14, 2026, 08:00 (UTC-7)', 'A 30-point increase to max Sanity.'] },
  { kind: 'news', title: 'KERNEL LOCATING OPEN', source, published, postArt, art: [],
    lines: ['Goldenglow / Dorothy / Mudrock'] },
  // A section the post gave no lines is no section of the tab.
  { kind: 'news', title: 'THEMED BACKGROUND RERUN', source, published, lines: [] },
  { kind: 'board', title: 'Sealed With Time', server: 'kr', name: '[Celebration] Sealed With Time',
    source: 'https://ark-kr-static-online-1300509597.yo-star.com/announce/Android/announcement/6889.html',
    published: '2026-10-14', image: 'https://ark-kr-static-online-1300509597.yo-star.com/announce/images/a.jpg', items: [] },
  // A regional item whose board picture is too large to load is still its notice.
  { kind: 'board', title: '常設スカウト', server: 'jp', name: 'Standard Pool #177 (Global)',
    source: 'https://ark-jp-static-online.yo-star.com/announce/Android/announcement/1426.html', published: '2026-10-09', items: [] },
] as unknown as TableRewardGroup[];

test("the News tab is the announcement's sections, with the pictures they stood among", () => {
  const { news } = eventExtras(groups, () => null);
  assert.deepEqual(news.map(section => section.title), ['SANITY LIMIT INCREASE', 'KERNEL LOCATING OPEN']);
  assert.equal(news[0].source, source);
  assert.equal(news[0].published, published);
  assert.equal(news[0].lines[0], 'UPDATE TIME: October 14, 2026, 08:00 (UTC-7)');
  // The key art above the first section belongs to every section; a section's own stands with it.
  assert.ok(news.every(section => section.postArt === postArt));
  assert.deepEqual(news[0].art, [{ url: sectionArt, at: -1 }]);
  assert.deepEqual(news[1].art, [], 'a section the post gave no picture of');
});

test("the board's items stand above the news, each named in English and on its own server", () => {
  const { board } = eventExtras(groups, () => null);
  assert.deepEqual(board.map(item => [item.server, item.name, item.shown]), [
    ['kr', '[Celebration] Sealed With Time', '2026-10-14'],
    ['jp', 'Standard Pool #177 (Global)', '2026-10-09'],
  ]);
  assert.match(board[0].image!, /\/announce\/images\/a\.jpg$/);
  assert.equal(board[1].image, null, 'an oversize picture is left out, the notice still listed');
});

test('the release the browser test reads carries the sections the tab shows', () => {
  // tests/browser/event-news.spec.ts reads this file; arkpedia-data's importer regenerates it
  // from build-event-rewards.mjs and holds it to the post.
  const news = JSON.parse(fs.readFileSync('scripts/tests/fixtures/official-news/4814-news.json', 'utf8')) as ReturnType<typeof eventExtras>['news'];
  assert.equal(news.length, 10);
  assert.ok(news.every(section => section.title && section.lines.length > 0 && section.source === source));
  assert.ok(news.some(section => section.title === 'SANITY LIMIT INCREASE'));
  // Read back through the same helper, the sections are unchanged: the tab shows what is published.
  const again = eventExtras(news.map(section => ({ kind: 'news', ...section })) as unknown as TableRewardGroup[], () => null).news;
  assert.deepEqual(again, news);
});
