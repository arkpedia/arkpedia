import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import fs from 'node:fs';
import { artFile, publishedArt } from '../../lib/art/publishedArt';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import { isLineupPending, LINEUP_PENDING_NOTE } from '../../lib/gacha/bannerLineup';
import type { GachaBannerWithWindow, GameEvent } from '../../lib/home/frontPageContent';
import { publicFiles } from '../../lib/assets/publicAssets';
import GachaBannersPanel from '../../components/home/GachaBannersPanel';
import FeaturedOperatorsPanel from '../../components/home/FeaturedOperatorsPanel';
import EventsPanel from '../../components/schedule/EventsPanel';
import EventDetailPage from '../../pages/events/[slug]';

// tsx compiles these components' JSX to React.createElement (tsconfig keeps JSX for Next),
// and unlike StageLayoutMap they do not import React themselves.
(globalThis as { React?: typeof React }).React = React;
// next.config.js serves every image unoptimized, straight from the asset repositories.
const render = (element: ReactElement) => renderToStaticMarkup(
  createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, unoptimized: true } }, element));

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

test('a banner without published art keeps its frame on the front page, with no image in it', () => {
  const html = render(createElement(GachaBannersPanel, {
    banners: [banner({}), banner({ name: 'Other Pool', banner_image: `/${publishedBanner}` })], activeIndex: 0, onSelect: () => {},
  }));
  const main = html.slice(html.indexOf('front-gacha-poster-wrap'), html.indexOf('front-gacha-info'));
  assert.ok(main.length > 0 && !main.includes('<img'), main);
  assert.match(html, /front-gacha-thumb-fallback">T</);
  assert.equal((html.match(/<img/g) ?? []).length, 1, 'only the banner with art draws an image');
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
    assert.ok(front.includes(LINEUP_PENDING_NOTE) && !front.includes('class="front-featured-op"'), front);
  }
  assert.match(render(createElement(FeaturedOperatorsPanel, { banner: banner({}) })), /No featured operators listed/);

  const page = (over: Partial<Parameters<typeof EventDetailPage>[0]>) => render(createElement(EventDetailPage, {
    name: 'Test Event', poster: null, images: [], artAspect: '1024 / 328', dateRange: '2026/09/25–2026/10/09', isPredicted: false,
    bannerName: 'Test Pool #1', bannerImage: null, lineupPending: true, skins: [], rewardStores: [], materialOrder: [],
    featuredOperators: [{ name: 'Someone', rarity: 6, percent: 50 }], ...over,
  }));
  const held = page({});
  assert.ok(held.includes(LINEUP_PENDING_NOTE) && !held.includes('class="event-detail-featured-op"'), 'pending note, not a lineup');
  // The banner's frame stays at its size with no art in it.
  assert.match(held, /<div class="event-detail-banner-art-wrap"><\/div>/);
  const known = page({ lineupPending: false });
  assert.ok(!known.includes(LINEUP_PENDING_NOTE) && known.includes('class="event-detail-featured-op"'));
});
