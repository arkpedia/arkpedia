import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { announcedNote, applyBoardEvents, boardBannerMedia, boardEvents } from '../sync/board-events.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { assetPlan } from '../sync/sync-catalogue.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { mergeMedia } from '../sync/catalogue-model.mjs';

const SHA = 'f'.repeat(40), OTHER = 'e'.repeat(40);
const image = (sha1 = SHA) => ({ url: `https://ark-us-static-online.yo-star.com/announce/images/20261008/${sha1.slice(0, 8)}.jpg`, sha1, bytes: 1 });
const item = (fields: Record<string, unknown>) => ({ id: '2078', kind: 'event', category: 1, title: 'Untitled', displayDate: '2026-10-08', firstSeen: '2026-10-18', ...fields });
const event = (name: string, global: Record<string, unknown>, cn = '2026/05/01–2026/05/15', extra: Record<string, unknown> = {}) =>
  ({ name, year: 2026, poster: `/event-poster/${name}.webp`, cn: { dateRange: cn }, global: { dateRange: null, note: null, ...global }, tw: { dateRange: null, note: null }, ...extra });

const confirmed = () => event('[Celebration] Critical Phase Transition', { dateRange: '2026/10/14–2026/10/28' });
const unannounced = () => event('[Side Story] Yet Another Wave', { note: 'Global release unannounced' }, '2026/10/09–2026/10/23', { poster: '/event-poster/CN 5101-1.webp' });
const estimated = () => event("[Rerun] The Masses' Travels Rerun", { dateRange: '2026/11/05–2026/11/15', note: 'ESTIMATED Global date, not officially confirmed' }, '2026/05/22–2026/06/01');

test('a board item names its event by the title or heading, on a plausible day, and is announced the first day it was shown', () => {
  const events = [confirmed(), unannounced(), estimated()];
  const found = boardEvents(events, { bulletins: [
    item({ id: '4942', title: 'Critical Phase Transition Open', heading: 'MAIN THEME EPISODE 17: CRITICAL PHASE TRANSITION', displayDate: '2026-10-08' }),
    item({ id: '1', title: 'Event Now Open', heading: "SIDE STORY 'YET ANOTHER WAVE'", displayDate: '2026-12-01', firstSeen: '2026-11-30', image: image() }),
    item({ id: '2', title: "The Masses' Travels Open", displayDate: '2026-11-04', image: image(OTHER) }),
  ] });
  assert.deepEqual(found['[Celebration] Critical Phase Transition'], { announced: '2026-10-08', items: ['4942'] });
  assert.deepEqual(found['[Side Story] Yet Another Wave'], { announced: '2026-11-30', items: ['1'], image: { url: image().url, sha1: SHA } }, 'the earlier of shown and first seen');
  assert.deepEqual(found["[Rerun] The Masses' Travels Rerun"].items, ['2'], "a rerun's item may leave out \"Rerun\"");
});

test('anything that is not one event for certain stays unmatched', () => {
  const twin = event('[Side Story] Yet Another Wave Part 2', { note: 'Global release unannounced' }, '2026/10/09–2026/10/23');
  const short = event('[Event] Ato', { note: 'Global release unannounced' }, '2026/01/01–2026/01/10');
  const events = [confirmed(), unannounced(), twin, short];
  const found = boardEvents(events, { bulletins: [
    // Two events' names are in it.
    item({ id: '1', title: 'Yet Another Wave Part 2 Open' }),
    // A confirmed Global window months away is not this item's.
    item({ id: '2', title: 'Critical Phase Transition Open', displayDate: '2026-06-01', firstSeen: '2026-06-01' }),
    // Before the event even opened on CN.
    item({ id: '3', title: 'Yet Another Wave', displayDate: '2026-10-01', firstSeen: '2026-10-01' }),
    // A name too short to tell apart from any other word.
    item({ id: '4', title: 'Ato Open' }),
    // Not an event item.
    item({ id: '5', kind: 'banner', title: 'Critical Phase Transition Headhunting', poolId: 'LIMITED_EN_42_0_1' }),
  ] });
  assert.deepEqual(found, {});
});

test('two pictures for one event are ambiguous: announced, but no art', () => {
  const found = boardEvents([confirmed()], { bulletins: [
    item({ id: '1', title: 'Critical Phase Transition Open', image: image() }),
    item({ id: '2', title: 'Critical Phase Transition Rewards', displayDate: '2026-10-14', image: image(OTHER) }),
  ] });
  assert.deepEqual(found['[Celebration] Critical Phase Transition'], { announced: '2026-10-08', items: ['1', '2'] });
});

test('an unannounced event gets the announced note and the board art is planned in place of its CN poster; dates and hand-written notes stay', () => {
  const events = [confirmed(), unannounced(), estimated(), event('[Event] Pinned Wave Festival', { note: 'Global release unannounced' }, '2026/09/01–2026/09/10', { poster: 'https://raw.githubusercontent.com/arkpedia/arkpedia-image-assets/abc/event-poster/x.jpg' })];
  const board = { bulletins: [
    item({ id: '1', title: 'Yet Another Wave Open', image: image(), displayDate: '2026-11-30', firstSeen: '2026-11-30' }),
    item({ id: '2', title: 'Critical Phase Transition Open', image: image(OTHER) }),
    item({ id: '3', title: "The Masses' Travels Rerun", displayDate: '2026-11-04', image: image() }),
    item({ id: '4', title: 'Pinned Wave Festival', image: image() }),
  ] };
  const { media, announced } = applyBoardEvents(events, board);
  assert.deepEqual(announced, ['[Side Story] Yet Another Wave', '[Event] Pinned Wave Festival']);
  assert.equal(events[1].global.note, announcedNote('2026-11-30'));
  assert.equal(events[1].global.dateRange, null);
  assert.equal(events[0].global.note, null, 'an event with confirmed dates keeps its note');
  assert.equal(events[2].global.note, 'ESTIMATED Global date, not officially confirmed', 'an estimate written by hand is never touched');
  assert.equal(events[2].global.dateRange, '2026/11/05–2026/11/15');
  assert.deepEqual(media, [
    { path: 'event-poster/[Celebration] Critical Phase Transition.webp', boardImage: { url: image(OTHER).url, sha1: OTHER } },
    { path: 'event-poster/CN 5101-1.webp', boardImage: { url: image().url, sha1: SHA } },
    { path: "event-poster/[Rerun] The Masses' Travels Rerun.webp", boardImage: { url: image().url, sha1: SHA } },
  ], 'a poster at a pinned address is the record\'s own');
  // The same board again changes nothing.
  assert.deepEqual(applyBoardEvents(events, board).announced, []);
});

test('an event with no poster is given one by its name; the asset plan keeps board art for a published file', () => {
  const events = [{ ...unannounced(), poster: null }];
  const { media } = applyBoardEvents(events, { bulletins: [item({ title: 'Yet Another Wave Open', displayDate: '2026-11-30', firstSeen: '2026-11-30', image: image() })] });
  assert.equal(events[0].poster, '/event-poster/Yet Another Wave.webp');
  const merged = mergeMedia([{ path: 'event-poster/Yet Another Wave.webp', wikiFiles: ['CN Yet Another Wave banner.png'] }, ...media]);
  assert.deepEqual(merged, [{ path: 'event-poster/Yet Another Wave.webp', wikiFiles: ['CN Yet Another Wave banner.png'], boardImage: { url: image().url, sha1: SHA } }]);
  const published = new Set(['event-poster/Yet Another Wave.webp', 'event-poster/Other.webp']);
  const plan = assetPlan([], [], { characters: {}, skins: { charSkins: {} }, items: { items: {} } }, {}, published, [...merged, { path: 'event-poster/Other.webp', wikiFiles: ['x'] }]);
  assert.deepEqual(plan.map((entry: any) => entry.path), ['event-poster/Yet Another Wave.webp']);
});

/* Orienteering #7 ran on Global from 2026-10-28 with no picture: its CN art is retired until Global
   carries it, and Global's board showed its key art under the pool the record holds. */
test("a banner's key art comes from Global's board where its picture is missing, by the pool it opens", () => {
  const banner = (name: string, globalPoolId: string | null, art = `/headhunting-banner-images/${name}.webp`) => ({ name, globalPoolId, banner_image: art });
  const board = { bulletins: [
    item({ id: '1', kind: 'banner', title: 'Displayed Operators Rate Up !!!', poolId: 'SPECIAL_EN_42_0_3', image: image() }),
    item({ id: '2', kind: 'banner', title: 'Sealed With Time', poolId: 'LIMITED_EN_42_0_1', image: image(OTHER) }),
    item({ id: '3', kind: 'banner', title: 'No picture', poolId: 'DOUBLE_EN_42_0_2' }),
    item({ id: '4', kind: 'event', title: 'Not a banner', poolId: 'SPECIAL_EN_42_0_3', image: image(OTHER) }),
  ] };
  const banners = [banner('Orienteering 7', 'SPECIAL_EN_42_0_3'), banner('Sealed With Time', 'LIMITED_EN_42_0_1'), banner('Rate Up', 'DOUBLE_EN_42_0_2')];
  const published = new Set(['headhunting-banner-images/Sealed With Time.webp']);
  assert.deepEqual(boardBannerMedia(banners, board, published),
    [{ path: 'headhunting-banner-images/Orienteering 7.webp', boardImage: { url: image().url, sha1: SHA } }]);
  // Two records holding one pool decide nothing; a picture at another address is the record's own.
  assert.deepEqual(boardBannerMedia([...banners, banner('Twin', 'SPECIAL_EN_42_0_3')], board, published), []);
  assert.deepEqual(boardBannerMedia([banner('Orienteering 7', 'SPECIAL_EN_42_0_3', 'https://example.org/x.webp')], board, published), []);
  // The plan carries it although the board planned nothing else, and keeps the wiki's EN upload behind it.
  const merged = mergeMedia([{ path: 'headhunting-banner-images/Orienteering 7.webp', wikiFiles: ['EN Orienteering 7 banner.png'] }, ...boardBannerMedia(banners, board, published)]);
  assert.deepEqual(merged, [{ path: 'headhunting-banner-images/Orienteering 7.webp', wikiFiles: ['EN Orienteering 7 banner.png'], boardImage: { url: image().url, sha1: SHA } }]);
});
