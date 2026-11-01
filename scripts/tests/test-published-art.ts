import { eventPageFixture } from './event-page-fixture';
import './css-modules';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import fs from 'node:fs';
import { artFile, publishedArt } from '../../lib/art/publishedArt';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import { isLineupPending, lineupPendingNote } from '../../lib/gacha/bannerLineup';
import type { GachaBannerWithWindow, GameEvent } from '../../lib/home/frontPageContent';
import { publicFiles } from '../../lib/assets/publicAssets';
import GachaBannersPanel from '../../components/home/GachaBannersPanel';
import FeaturedOperatorsPanel from '../../components/home/FeaturedOperatorsPanel';
import EventsPanel from '../../components/schedule/EventsPanel';
import EventDetailPage from '../../pages/events/[slug]';

/** What a pending banner with no announced rate-ups says in its lineup's place. */
const PENDING_NOTE = lineupPendingNote({});

// tsx compiles these components' JSX to React.createElement (tsconfig keeps JSX for Next),
// and unlike StageLayoutMap they do not import React themselves.
(globalThis as { React?: typeof React }).React = React;
// next.config.js serves every image unoptimized, straight from the asset repositories.
const render = (element: ReactElement) => renderToStaticMarkup(
  createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, unoptimized: true } }, eventPageFixture(element)));

// Records published before their art, and before their lineup, as the catalogue and the
// recurring-banner importer write them. Names and files are invented; the one published
// file is whichever the asset index lists first, so no rename in the data moves this.
const publishedBanner = `headhunting-banner-images/${publicFiles('headhunting-banner-images')[0]}`;
const start = new Date('2026-09-25T11:00:00Z'), end = new Date('2026-10-09T11:00:00Z');
const banner = (over: Partial<GachaBannerWithWindow>): GachaBannerWithWindow => ({
  name: 'Test Pool #1', category: 'standard_pool', cn_date: null, global_date: '2026/09/25–2026/10/09', banner_image: null,
  six_stars: [], five_stars: [], pull_type: 'standard', year: 2026, linked_event: null, start, end, ...over,
});

test('art the image repository has not published resolves to null; published art keeps its path', () => {
  assert.ok(!publishedBanner.endsWith('/undefined'), 'the asset index lists banner art');
  assert.equal(publishedArt(null), null);
  assert.equal(publishedArt(undefined), null);
  assert.equal(publishedArt('/headhunting-banner-images/Test Pool 1 (Global).webp'), null);
  assert.equal(publishedArt('/event-poster/Test Event.webp'), null);
  assert.equal(publishedArt(`/${publishedBanner}`), `/${publishedBanner}`);
  // A URL pinned to one commit of the image repository is checked by the file it names.
  const pinned = (file: string) => `https://raw.githubusercontent.com/arkpedia/arkpedia-image-assets/${'a'.repeat(40)}/${file.split('/').map(encodeURIComponent).join('/')}`;
  assert.equal(artFile(pinned('headhunting-banner-images/Some Pool & Co.jpg')), 'headhunting-banner-images/Some Pool & Co.jpg');
  assert.equal(publishedArt(pinned('headhunting-banner-images/Some Pool & Co.jpg')), null);
  assert.equal(publishedArt(pinned(publishedBanner)), pinned(publishedBanner));
  // Any other address cannot be checked here and renders as before.
  assert.equal(artFile('https://arknights.wiki.gg/images/Some.png'), null);
  assert.equal(publishedArt('https://arknights.wiki.gg/images/Some.png'), 'https://arknights.wiki.gg/images/Some.png');
});

test('banner art keeps the path its record names: the pinned asset commit versions it, not a query', () => {
  // Kernel #62 (Global) was one of the banners the retired sync-banner-art.py recorded a
  // wiki sha1 for, and its art went out as '...webp?v=03268768'. The English art now comes
  // from arkpedia-image-assets, and every address a page draws names that repository's
  // commit, so the record's own path is the whole answer.
  const record = getAllHeadhuntingBanners().find(b => b.name === 'Kernel #62 (Global)');
  assert.ok(record, 'the banner list has Kernel #62 (Global)');
  for (const b of getAllHeadhuntingBanners()) {
    assert.ok(!b.banner_image?.includes('v='), `${b.name}: ${b.banner_image} carries a version query`);
  }
  assert.equal(fs.existsSync('data/assets/banner_art_sources.json'), false);
  assert.equal(fs.existsSync('scripts/sync/sync-banner-art.py'), false);
});

test('a banner without published art keeps its frame on the front page, with the art placeholder in it', () => {
  const html = render(createElement(GachaBannersPanel, {
    banners: [banner({}), banner({ name: 'Other Pool', banner_image: `/${publishedBanner}` })], activeIndex: 0, onSelect: () => {}, now: start.getTime(),
  }));
  const main = html.slice(html.indexOf('front-gacha-poster-wrap'), html.indexOf('front-gacha-info'));
  assert.ok(main.length > 0 && !main.includes('<img'), main);
  // /gacha's placeholder (.art-placeholder), not a bare initial ("K" for Kernel Locating #13).
  assert.match(main, /class="art-placeholder[^"]*">No art yet</);
  assert.match(html, /class="art-placeholder" aria-hidden="true">No art</);
  assert.doesNotMatch(html, />T</);
  assert.equal((html.match(/<img/g) ?? []).length, 1, 'only the banner with art draws an image');
});

test('the front page\'s banners say LIVE, "Starts in" or nothing, at the request\'s clock', () => {
  // The server's markup and the first client paint come from `now`, the request's clock.
  const at = (now: number, banners: GachaBannerWithWindow[]) => render(createElement(GachaBannersPanel, { banners, activeIndex: 0, onSelect: () => {}, now }));
  const next = banner({ name: 'Next Pool', global_date: '2026/10/09–2026/10/23', start: new Date('2026-10-09T11:00:00Z'), end: new Date('2026-10-23T11:00:00Z') });
  const open = start.getTime() + 3_600_000;
  const html = at(open, [banner({}), next]);
  // Live is /gacha's own test (isBannerLive), on the poster and its thumbnail.
  assert.equal((html.match(/front-gacha-poster-wrap"[^>]*>(?:(?!<\/a>).)*class="badge-live">LIVE</g) ?? []).length, 1, html);
  assert.equal((html.match(/<button[^>]*class="front-gacha-thumb[ "][^>]*>(?:(?!<\/button>).)*class="badge-live">LIVE</g) ?? []).length, 1, html);
  // Not open yet: the amber twin with the time to its start, the largest unit on a thumbnail.
  assert.match(html, /class="badge-upcoming">in 13d</);
  assert.match(html, /aria-label="Next Pool, starts in 13d 23h"/);
  assert.match(at(open, [next]), /class="badge-upcoming">Starts in 13d 23h</);
  // Over (a tab left open past its end), and nothing given: neither.
  assert.doesNotMatch(at(end.getTime(), [banner({})]), /badge-live|badge-upcoming/);
  assert.doesNotMatch(at(open, []), /badge-live|badge-upcoming/);
});

test('an event poster not published yet leaves the poster box empty instead of failing the panel', () => {
  const event: GameEvent = { name: 'Test Event', poster: null, year: 2026, dateRange: '2026/09/25–2026/10/09', start, end };
  const html = render(createElement(EventsPanel, { ongoing: [event], upcoming: null, farmableMaterials: [], now: start.getTime() }));
  assert.match(html, /<div class="front-events-poster-wrap"><\/div>/);
});

test('a banner whose lineup is pending says so instead of listing no one', () => {
  const pending = banner({ lineupSource: 'pending' });
  assert.ok(isLineupPending(pending));
  // Undefined is every hand-kept record: its lineup is whatever it lists.
  assert.ok(!isLineupPending(banner({})) && !isLineupPending(banner({ lineupSource: 'client' })));
  // Pending wins over whatever the arrays hold: a lineup left from before is not the banner's.
  for (const held of [pending, banner({ lineupSource: 'pending', six_stars: ['Someone'] })]) {
    const front = render(createElement(FeaturedOperatorsPanel, { banner: held }));
    assert.ok(front.includes(PENDING_NOTE) && !front.includes('class="front-featured-op"'), front);
  }
  assert.match(render(createElement(FeaturedOperatorsPanel, { banner: banner({}) })), /No featured operators listed/);
  // An official CN announcement's rate-ups, in its Chinese, while their operators have no record yet.
  const announced = banner({ lineupSource: 'pending', announcedLineup: { six: ['克莱门莎'], five: ['德·托莱多', '火哨'], rateUpSix: [] } });
  assert.equal(lineupPendingNote(announced), 'Announced rate-up: 克莱门莎 (6★) · 德·托莱多, 火哨 (5★). Lineup to be confirmed.');
  assert.ok(render(createElement(FeaturedOperatorsPanel, { banner: announced })).includes('克莱门莎 (6★)'));

  const page = (over: Partial<Parameters<typeof EventDetailPage>[0]>) => render(createElement(EventDetailPage, {
    name: 'Test Event', poster: null, images: [], artAspect: '1024 / 328', dateRange: '2026/09/25–2026/10/09', isPredicted: false,
    bannerName: 'Test Pool #1', bannerImage: null, lineupPending: PENDING_NOTE, skins: [], rewardStores: [], materialOrder: [],
    featuredOperators: [{ name: 'Someone', rarity: 6, percent: 50 }], ...over,
  }));
  const held = page({});
  // An operator tile is a button that opens the preview: class="btn-bare event-detail-featured-op".
  const tile = /class="[^"]*\bevent-detail-featured-op\b/;
  assert.ok(held.includes(PENDING_NOTE) && !tile.test(held), 'pending note, not a lineup');
  // The banner's frame stays at its size with no art in it.
  assert.match(held, /<div class="event-detail-banner-art-wrap"><\/div>/);
  const known = page({ lineupPending: null });
  assert.ok(!known.includes(PENDING_NOTE) && tile.test(known));
  // A release compiled before the note's text carries `true`: the note, not an empty hint.
  const older = page({ lineupPending: true });
  assert.ok(older.includes(`<p class="hint">${PENDING_NOTE}</p>`) && !older.includes('<p class="hint"></p>'), older);
  assert.ok(!tile.test(older));
  assert.ok(tile.test(page({ lineupPending: false })));
});
