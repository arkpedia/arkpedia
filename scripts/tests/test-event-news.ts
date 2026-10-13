import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error Node scripts are plain JavaScript.
import { assertEventRewards, buildEventRewards } from '../build/build-event-rewards.mjs';
import { eventExtras, type TableRewardGroup } from '../../lib/events/tableRewards';

/*
 * The event page's News tab: the sections of an event's official announcement that no other part of
 * the page shows (2026-10-14: "a News section or QOL section, with all the other changes"). The
 * fixture is the real Critical Phase Transition post (arknights.global/news/4814), as the sync caches it.
 */
const post = JSON.parse(fs.readFileSync('scripts/tests/fixtures/official-news/4814.json', 'utf8'));
const cpt = { name: '[Celebration] Critical Phase Transition', global: { dateRange: '2026/10/14–2026/10/28' } };
const empty = { activity: { basicInfo: {}, activity: {}, missionData: [] }, stages: { stages: {} }, items: { items: {} }, building: { customData: { furnitures: {}, themes: {} } }, characters: {}, skins: { charSkins: {} } };
const groupsOf = (events: unknown[], posts: unknown[]) => buildEventRewards(events, empty, posts, null);

test('an announcement\'s other changes are the event\'s news, in the post\'s order and words', () => {
  const groups = groupsOf([cpt], [post])[cpt.name].groups as TableRewardGroup[];
  const news = groups.filter(g => g.kind === 'news');
  assert.deepEqual(news.map(g => g.title), [
    'NOTICE BOARD IN ZELGRAD OPEN',
    'NEW OPERATORS NOW AVAILABLE',
    'SANITY LIMIT INCREASE',
    'CUMULATIVE SIGN-IN SYSTEM UPDATE',
    'NEW REDEEMABLES AVAILABLE IN [PURCHASE CERTIFICATES STORE]',
    'KERNEL LOCATING OPEN',
    'SPECIALIZED MODULES UPDATE',
    'RECRUIT OPERATORS UPDATE',
    'NEW REDEEMABLE AVAILABLE IN [DISTINCTIONS] AND [UNIVERSAL CERTIFICATES EXCHANGE AREA]',
    'THEMED BACKGROUND RERUN',
  ]);
  const sanity = news.find(g => g.title === 'SANITY LIMIT INCREASE')!;
  assert.equal(sanity.source, 'https://www.arknights.global/news/4814');
  assert.equal(sanity.published, new Date(post.publishTime).toISOString());
  assert.equal(sanity.lines![0], 'UPDATE TIME: October 14, 2026, 08:00 (UTC-7)');
  assert.match(sanity.lines!.join(' '), /30-point increase to max Sanity/);
  // The build's own output guard (no heading twice, no entity left) takes it.
  assert.doesNotThrow(() => assertEventRewards(groupsOf([cpt], [post])));
  const kernel = news.find(g => g.title === 'KERNEL LOCATING OPEN')!;
  assert.match(kernel.lines!.join(' '), /Goldenglow \/ Dorothy/, 'a list keeps its operators');
});

test('what the page shows elsewhere is not news again', () => {
  const titles = (groupsOf([cpt], [post])[cpt.name].groups as TableRewardGroup[]).filter(g => g.kind === 'news').map(g => g.title).join('\n');
  // The event itself (its page), the limited banner (Banner), its free rolls and sign-in (Rewards),
  // outfits and the Fashion Review (Skins), furniture and packs (their tabs).
  for (const shown of [/CRITICAL PHASE TRANSITION/, /HEADHUNTING OPEN/, /DAILY FREE ROLL/, /SIGN-IN EVENT/, /OUTFIT/, /FASHION REVIEW/, /FURNITURE/, /PACKS/]) {
    assert.doesNotMatch(titles, shown);
  }
});

test('news reaches the page\'s extras; an event without an announcement has none', () => {
  const groups = groupsOf([cpt], [post])[cpt.name].groups as TableRewardGroup[];
  const extras = eventExtras(groups, () => null);
  assert.equal(extras.news.length, 10);
  assert.equal(extras.news[0].published, new Date(post.publishTime).toISOString());
  const other = { name: '[Side Story] Elsewhere', global: { dateRange: '2026/10/14–2026/10/28' } };
  const result = groupsOf([cpt, other], [post]);
  assert.equal(result[other.name], undefined, 'a same-day event the post does not name gets nothing');
});

test('the browser test\'s news is what the build makes of the post', () => {
  // tests/browser/event-news.spec.ts reads this file (Playwright cannot load the build script).
  const built = eventExtras(groupsOf([cpt], [post])[cpt.name].groups as TableRewardGroup[], () => null).news;
  assert.deepEqual(JSON.parse(fs.readFileSync('scripts/tests/fixtures/official-news/4814-news.json', 'utf8')), built,
    'regenerate scripts/tests/fixtures/official-news/4814-news.json from the build');
});
