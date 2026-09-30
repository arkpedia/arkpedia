import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { unconfirmedOutfitSales } from '../content/outfit-windows.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { reviewCompleteness } from '../content/check-completeness.mjs';
import { emptyCatalogue } from './fixtures/catalogue';
import { availableSkins, type SkinWindow } from '../../lib/skins/skinAvailability';
import fs from 'node:fs';

/* Duel Channel: Ivy Vine as it stood on 25 September 2026: the event's announced window,
   its three Outfit Store outfits, and no confirmed window for them, which is how /skins
   came to say "Estimated 8 Oct" about outfits on sale. Frozen here, at fixed instants, so
   neither the day's data nor the real date moves a case. */
const event = { name: 'Duel Channel: Ivy Vine', global: { dateRange: '2026/09/23–2026/10/07', note: null,
  startAt: '2026-09-23T16:00:00.000Z', endAt: '2026-10-07T11:00:00.000Z', timingSource: 'https://www.arknights.global/news/4683' } };
const outfit = (model: string, name: string, extra: object = {}) => ({ skinId: `char_${model.toLowerCase()}@test#1`, model, name,
  release: 'Duel Channel: Ivy Vine', howToObtain: 'Outfit Store ( 18 Originite Prime )', sourceRegion: 'Global', globalReleaseAt: 1790175600, ...extra });
const skins = [
  outfit('Saria', 'Unstained Unshaken'), outfit('Lemuen', 'Requiem Vesperis'), outfit('Necrass', 'As Clear As Crystal'),
  // Not sold in the Outfit Store: an event exchange outfit is not this check's business.
  outfit('Ethan', 'Infiltrator', { howToObtain: 'Event exchange' }),
  // A CN outfit released with another event.
  outfit('Haruka', 'Stranded In Utopia', { release: '[CN] Critical Phase Transition', sourceRegion: 'CN', globalReleaseAt: undefined }),
];
const ivyVine = ['Saria / Unstained Unshaken', 'Lemuen / Requiem Vesperis', 'Necrass / As Clear As Crystal'];
const confirmed = { event: 'Duel Channel: Ivy Vine', kind: 'shop', label: 'New outfits', startAt: '2026-09-23T16:00:00Z',
  endAt: '2026-10-21T11:00:00Z', source: 'https://www.arknights.global/news/4683', skinIds: ivyVine, newRelease: true };
const now = new Date('2026-09-25T12:00:00Z');
const unconfirmed = (over: object = {}) => unconfirmedOutfitSales({ skins, events: [event], windows: [], now, ...over })
  .map(({ key }: { key: string }) => key);

test('an Outfit Store outfit on sale with a running Global event needs a confirmed window', () => {
  assert.deepEqual(unconfirmed(), ivyVine);
  assert.deepEqual(unconfirmed({ windows: [confirmed] }), []);
  // Only the outfits the window lists are covered.
  assert.deepEqual(unconfirmed({ windows: [{ ...confirmed, skinIds: ivyVine.slice(0, 2) }] }), ivyVine.slice(2));
  // A random draw is not a sale, and a window that closed before the event is an old one.
  assert.deepEqual(unconfirmed({ windows: [{ ...confirmed, kind: 'draw' }] }), ivyVine);
  assert.deepEqual(unconfirmed({ windows: [{ ...confirmed, startAt: '2026-04-25T08:00:00Z', endAt: '2026-05-23T04:00:00Z' }] }), ivyVine);
});

test('only an announced Global window that is open now asks for one', () => {
  assert.deepEqual(unconfirmed({ now: new Date('2026-09-23T15:59:59Z') }), []);
  assert.deepEqual(unconfirmed({ now: new Date('2026-09-23T16:00:00Z') }), ivyVine);
  assert.deepEqual(unconfirmed({ now: new Date('2026-10-07T10:59:59Z') }), ivyVine);
  assert.deepEqual(unconfirmed({ now: new Date('2026-10-07T11:00:00Z') }), []);
  // An estimate, or a day range with no announced instants, establishes nothing.
  const estimated = { ...event, global: { ...event.global, note: 'ESTIMATED Global date, not officially confirmed' } };
  assert.deepEqual(unconfirmed({ events: [estimated] }), []);
  assert.deepEqual(unconfirmed({ events: [{ ...event, global: { dateRange: '2026/09/23–2026/10/07', note: null } }] }), []);
});

test('an outfit is the event\'s by its release text, the event\'s own link, or its Global client date', () => {
  const renamed = [outfit('Saria', 'Unstained Unshaken', { release: 'Some Other Label' })];
  assert.deepEqual(unconfirmed({ skins: renamed }), ['Saria / Unstained Unshaken'], 'dated inside the window by the client');
  const undated = [outfit('Saria', 'Unstained Unshaken', { release: 'Some Other Label', globalReleaseAt: undefined })];
  assert.deepEqual(unconfirmed({ skins: undated }), []);
  assert.deepEqual(unconfirmed({ skins: undated, events: [{ ...event, linkedSkinNames: ['Unstained Unshaken'] }] }), ['Saria / Unstained Unshaken']);
  // A bracketed prefix on the event is the same event.
  assert.deepEqual(unconfirmed({ events: [{ ...event, name: '[Event] Duel Channel: Ivy Vine' }], skins: skins.map(skin => ({ ...skin, globalReleaseAt: undefined })) }), ivyVine);
});

test('a long event running over others\' openings does not claim their outfits', () => {
  // A six-week Stronghold season spans the Ivy Vine opening and a rerun's, whose record
  // carries server days only, so nothing but its name ties the rerun's new outfit to it.
  const season = { name: 'Stronghold Protocol Alliance 2nd Half', global: { dateRange: '2026/08/20–2026/10/01', note: '',
    startAt: '2026-08-20T16:00:00.000Z', endAt: '2026-10-01T11:00:00.000Z', timingSource: 'https://www.arknights.global/news/4434' } };
  const rerun = { name: '[Rerun] When Elegies Are Ashes Rerun', global: { dateRange: '2026/08/27–2026/09/06', note: null } };
  const brigid = outfit('Brigid', 'Bedtime Story', { release: 'When Elegies Are Ashes Rerun', globalReleaseAt: 1787828400 });
  const held = unconfirmedOutfitSales({ skins: [...skins, brigid], events: [season, rerun, event], windows: [], now });
  assert.deepEqual(held.map(({ key, event: owner }: { key: string; event: { name: string } }) => [key, owner.name]),
    ivyVine.map(key => [key, 'Duel Channel: Ivy Vine']), 'each outfit once, under the event that released it');
  // Placed by date only when its text names no event, and then in the latest window that opened.
  const unnamed = [outfit('Saria', 'Unstained Unshaken', { release: 'Some Other Label' })];
  assert.deepEqual(unconfirmedOutfitSales({ skins: unnamed, events: [season, event], windows: [], now })
    .map(({ event: owner }: { event: { name: string } }) => owner.name), ['Duel Channel: Ivy Vine']);
});

test('the check needs the clock and the windows; neither has a default', () => {
  assert.throws(() => unconfirmedOutfitSales({ skins, events: [event], windows: [] }), /needs the current time/);
  assert.throws(() => unconfirmedOutfitSales({ skins, events: [event], windows: [], now: new Date('soon') }), /needs the current time/);
  assert.throws(() => unconfirmedOutfitSales({ skins, events: [event], now }), /needs the confirmed windows/);
});

test('publication holds each such outfit back as published-partial, naming the notice, and blocks nothing', () => {
  // The outfits' operators are not in this fixture, so those holds are left out here.
  const review = (skinWindows: object[]) => {
    const { errors, quarantine } = reviewCompleteness(emptyCatalogue({ skins: skins.slice(0, 3), events: [event], skinWindows, now }));
    return { errors, quarantine: quarantine.filter((entry: { reason: string }) => !/^Outfit operator missing/.test(entry.reason)) };
  };
  const held = review([]);
  assert.deepEqual(held.errors, []);
  assert.deepEqual(held.quarantine.map((entry: { key: string; action: string }) => [entry.key, entry.action]),
    [['skin:char_saria@test#1', 'published-partial'], ['skin:char_lemuen@test#1', 'published-partial'], ['skin:char_necrass@test#1', 'published-partial']]);
  assert.equal(held.quarantine[0].reason, 'Saria / Unstained Unshaken: on sale on Global with Duel Channel: Ivy Vine, but data/skin-availability-windows.json '
    + 'has no confirmed window for it, so /skins shows an estimate; add the Outfit Store window from https://www.arknights.global/news/4683');
  assert.deepEqual(review([confirmed]), { errors: [], quarantine: [] });
  // A window synced from the client points at activity_table, which has no store dates.
  const synced = { ...event, global: { ...event.global, timingSource: 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/activity_table.json' } };
  const { quarantine } = reviewCompleteness(emptyCatalogue({ skins: skins.slice(0, 1), events: [synced], skinWindows: [], now }));
  assert.deepEqual(quarantine.filter((entry: { reason: string }) => /confirmed window/.test(entry.reason)).map((entry: { reason: string }) => entry.reason.split('; ')[1]),
    ['add the Outfit Store window from the official notice']);
});

/*
 * The home page's carousel lists what /skins' Available now tab does (availableSkins). It
 * used to list the skins of whichever events were running, matched by name, and so left out
 * Surtr, Nymph and Ethan, on sale in the shop with no event running for them (2026-09-30).
 */
test('what is on sale now: live shop and reward windows, never a draw or an estimate, new releases first', () => {
  const skin = (model: string, name: string) => ({ model, name, series: 'Test' }) as unknown as Parameters<typeof availableSkins>[0][number];
  const skins = [skin('A', 'Reissue'), skin('B', 'New'), skin('C', 'Draw'), skin('D', 'Estimate'), skin('E', 'Later')];
  const window = (id: string, extra: Partial<SkinWindow>): SkinWindow => ({ event: 'Store', kind: 'shop', label: '', startAt: '2026-09-20T11:00:00.000Z', endAt: '2026-10-04T11:00:00.000Z', skinIds: [id], newRelease: false, ...extra });
  const windows = [
    window('A / Reissue', {}),
    window('B / New', { newRelease: true, startAt: '2026-09-16T15:00:00.000Z' }),
    window('C / Draw', { kind: 'draw' }),
    window('D / Estimate', { estimated: true }),
    window('E / Later', { startAt: '2026-10-01T11:00:00.000Z' }),
  ];
  assert.deepEqual(availableSkins(skins, windows, new Date('2026-09-30T12:00:00Z')).map(s => s.name), ['New', 'Reissue']);
  // The home page reads the same helper, over the release's windows.
  const home = fs.readFileSync('pages/index.tsx', 'utf8');
  assert.match(home, /availableSkins\(__calendar\.skins, withLocalConfirmedSkinWindows\(__calendar\.skinWindows\), now\)/);
  assert.match(home, /skinWindows: getSkinWindows\(getAllSkins\(\), getAllEvents\(\)/);
});
