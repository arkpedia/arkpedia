import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { ALL_TAB, eventLink, EXTRA_TABS, readEventLink, rewardTabsFor, shownRewardTab, tabSlug } from '../../lib/events/rewardTabs';
import { NO_EXTRAS, type EventExtras } from '../../lib/events/tableRewards';

/*
 * The Rewards tabs on /events/[slug] and the links that name them (lib/events/rewardTabs.ts).
 *
 * A link such as /events/<name>#100% took the whole page down: the hash was passed to
 * decodeURIComponent, which throws on a '%' that is not an escape, inside an effect nothing
 * catches, and Next swapped the page for "Application error". And an event whose rewards were
 * only packs, an announcement or a furniture set opened on an All tab that said "Nothing here."
 */
const sections = ['banner', 'rewards', 'skins'] as const;
const extras = (over: Partial<EventExtras>): EventExtras => ({ ...NO_EXTRAS, ...over });
const notice = { title: 'Login gifts', source: 'https://example.invalid/post', lines: ['10 Headhunting Permits'] };
const pack = { title: 'Packs', source: 'https://example.invalid/post', packs: [{ name: 'Starter Pack', start: '2026-09-16T15:00:00.000Z', end: null, contents: [] }] };
const furniture = { title: 'Set', source: 'building_data', description: null, pieces: [{ name: 'Chair', id: 'furni_chair', obtain: null, comfort: 10 }] };
const full = rewardTabsFor(['Events Store', 'Login event'], extras({ notices: [notice], packs: [pack], furniture: [furniture] }));

test('All leads only when there are blocks to total; extras-only rewards open on their first tab', () => {
  assert.deepEqual(full.map((tab) => tab.value), [ALL_TAB, 'Events Store', 'Login event', EXTRA_TABS.notices, EXTRA_TABS.packs, EXTRA_TABS.furniture]);
  assert.deepEqual(full.map((tab) => tab.label), ['All', 'Events Store', 'Login event', 'Announced', 'Packs', 'Furniture']);
  const extrasOnly = rewardTabsFor([], extras({ packs: [pack], furniture: [furniture] }));
  assert.deepEqual(extrasOnly.map((tab) => tab.value), [EXTRA_TABS.packs, EXTRA_TABS.furniture], 'no All with nothing to total');
  assert.equal(shownRewardTab(ALL_TAB, extrasOnly), EXTRA_TABS.packs, 'the page opens on Packs, not on "Nothing here."');
  assert.equal(shownRewardTab(EXTRA_TABS.furniture, extrasOnly), EXTRA_TABS.furniture);
  assert.equal(shownRewardTab(ALL_TAB, full), ALL_TAB);
  assert.equal(shownRewardTab('Events Store', []), undefined);
});

test('a hash the page did not write never throws, and names nothing it does not have', () => {
  for (const hash of ['#%', '%', '#100%', '#rewards/%E0', '#rewards%2Fpacks', '#%E0%A4%A', '#', '', '#/', '#rewards//', '#skins/%']) {
    assert.doesNotThrow(() => readEventLink(hash, sections, full), hash);
  }
  assert.equal(readEventLink('#100%', sections, full), null);
  assert.equal(readEventLink('#', sections, full), null);
  assert.equal(readEventLink('#banner', ['rewards'], full), null, 'a section this event does not have');
  assert.deepEqual(readEventLink('#skins', sections, full), { section: 'skins', rewardTab: undefined });
});

test('#rewards opens the first tab, #rewards/<tab> that tab, and an unknown tab the first', () => {
  assert.deepEqual(readEventLink('#rewards', sections, full), { section: 'rewards', rewardTab: ALL_TAB });
  assert.deepEqual(readEventLink('#rewards/packs', sections, full), { section: 'rewards', rewardTab: EXTRA_TABS.packs });
  assert.deepEqual(readEventLink('#rewards/login-event', sections, full), { section: 'rewards', rewardTab: 'Login event' });
  assert.deepEqual(readEventLink('#rewards/%E0', sections, full), { section: 'rewards', rewardTab: ALL_TAB });
  const extrasOnly = rewardTabsFor([], extras({ notices: [notice], packs: [pack] }));
  assert.deepEqual(readEventLink('#rewards', sections, extrasOnly), { section: 'rewards', rewardTab: EXTRA_TABS.notices });
});

test('every link the page writes reads back as the tab it was written for', () => {
  assert.equal(tabSlug(EXTRA_TABS.packs), 'packs');
  assert.equal(tabSlug('Login event'), 'login-event');
  for (const tabs of [full, rewardTabsFor([], extras({ packs: [pack], furniture: [furniture] }))]) {
    for (const tab of tabs) {
      const hash = eventLink('rewards', tab.value, tabs);
      assert.match(hash, /^rewards(\/[a-z0-9-]+)?$/, 'a written link needs no decoding');
      assert.equal(readEventLink(`#${hash}`, sections, tabs)?.rewardTab, tab.value, hash);
    }
  }
  assert.equal(eventLink('rewards', ALL_TAB, full), 'rewards', 'the first tab is the bare section, as Copy link writes it');
  assert.equal(eventLink('skins', EXTRA_TABS.packs, full), 'skins');
});

test('the event page reads its hash through readEventLink, never decoding it', () => {
  const page = fs.readFileSync(new URL('../../pages/events/[slug].tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /decodeURI/);
  assert.match(page, /readEventLink\(window\.location\.hash, /);
  // One tab list: the Tabs take the list the link is read against.
  assert.match(page, /options=\{rewardTabs\}/);
});
