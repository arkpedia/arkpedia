import { regionalFixture } from './regional-fixture';
import './css-modules';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import EventDetailPage from '../../pages/events/[slug]';

/*
 * /events/[slug] with nothing linked, or with less than every section.
 *
 * An event with no banner, no reward store and no skins read "No banner, reward store
 * or skins are linked to this event yet." and then, underneath, "No banner linked to
 * this event.": the chosen section fell back to 'banner' when the event had no
 * sections, so the banner body rendered its own empty state as well (seen on
 * /events/Duel Channel: Ivy Vine, 2026-09-26). A section body renders only for a
 * section the event has.
 */

// tsx compiles the page's JSX to React.createElement (tsconfig keeps JSX for Next).
(globalThis as { React?: typeof React }).React = React;
const render = (element: ReactElement) => renderToStaticMarkup(
  createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, unoptimized: true } }, regionalFixture(element)));

type PageProps = Parameters<typeof EventDetailPage>[0];
const page = (over: Partial<PageProps>) => render(createElement(EventDetailPage, {
  name: 'Test Event', poster: null, images: [], artAspect: '1024 / 328', dateRange: '2026/09/25–2026/10/09', isPredicted: false,
  bannerName: null, bannerImage: null, lineupPending: null, featuredOperators: [], skins: [], rewardStores: [], materialOrder: [], ...over,
}));

/** The section column under the art (.event-detail-right, from when it sat beside the art),
 *  where the tabs, the empty state and the section bodies are. */
function column(html: string): string {
  const start = html.indexOf('class="event-detail-right"');
  assert.ok(start >= 0, 'the page renders its section column');
  return html.slice(start);
}

test('an event with nothing linked shows exactly one empty-state hint and no section body', () => {
  const right = column(page({}));
  assert.equal((right.match(/class="hint"/g) ?? []).length, 1, right);
  assert.match(right, /No banner, reward store or skins are linked to this event yet\./);
  assert.doesNotMatch(right, /op-section/, 'no section body under the empty state');
  assert.doesNotMatch(right, /role="group"/, 'no section tabs');
});

test('an event with only a reward store opens on it, with no banner body or banner hint', () => {
  const right = column(page({
    rewardStores: [{ type: 'Event Store', name: 'Store', items: [{ name: 'Device', quantity: 1, price: 10, currency: 'Token', stock: '3', iconPath: null }] }],
  }));
  assert.doesNotMatch(right, /No banner|No banner, reward store/);
  assert.match(right, /event-reward-total-name">Device</, 'the rewards body is the one on screen');
  assert.doesNotMatch(right, /event-detail-banner-art-wrap/);
});

test('an event with a banner opens on the banner', () => {
  const right = column(page({ bannerName: 'Test Pool #1' }));
  assert.match(right, /event-detail-banner-art-wrap/);
  assert.equal((right.match(/No banner/g) ?? []).length, 0);
});

const extras = (over: Partial<NonNullable<PageProps['extras']>>) => ({ packs: [], furniture: [], notices: [], news: [], board: [], ...over });

test('an event whose rewards are only an announcement and packs has Rewards, opened on the first of them', () => {
  // Rhodes Island Icebreaker Games, Wishes from Stars and eleven more: no store and no table
  // blocks, so there is nothing to total and no All tab to open on "Nothing here.".
  const right = column(page({
    extras: extras({
      notices: [{ title: 'Login gifts', source: 'https://example.invalid/post', lines: ['REWARDS: 10 Headhunting Permits'] }],
      packs: [{ title: 'Packs', source: 'https://example.invalid/post', packs: [{ name: 'Starter Pack', start: '2026-09-16T15:00:00.000Z', end: null, contents: [] }] }],
    }),
  }));
  assert.match(right, /id="event-section-panel-rewards"/, 'the Rewards body is on screen');
  assert.match(right, /REWARDS: 10 Headhunting Permits/, 'it opens on Announced');
  assert.doesNotMatch(right, /Nothing here\./);
  assert.doesNotMatch(right, />All</, 'no All tab with nothing to total');
  assert.match(right, />Announced<[\s\S]*>Packs</);
});

test('All is the reward card when the release carries one', () => {
  const right = column(page({
    rewardStores: [{ type: 'Login event', name: 'Sign-in', items: [{ name: 'Orundum', quantity: 600, price: null, currency: '', stock: '1', iconPath: null }] }],
    summary: { rows: [{ label: 'Headhunting', items: [{ name: 'Orundum', count: 600, iconPath: null }] }], sources: ['Login event'] },
  }));
  assert.match(right, /class="reward-summary"/);
  assert.match(right, /reward-summary-label">Headhunting</);
  assert.match(right, /Free rewards: Login event/);
  assert.doesNotMatch(right, /event-reward-totals/, 'the totals row is only the fallback');
});

test('an event with announced news has a News tab after its other sections; one without has none', () => {
  const news = [{ title: 'SANITY LIMIT INCREASE', source: 'https://www.arknights.global/news/4814', published: '2026-10-09T10:58:00.000Z',
    lines: ['UPDATE TIME: October 14, 2026, 08:00 (UTC-7)', 'DETAILS: After the update, all players will receive a 30-point increase to max Sanity.', 'Note:', '- One', '- Two'], art: [], postArt: null }];
  const store = [{ type: 'Event Store', name: 'Store', items: [{ name: 'Device', quantity: 1, price: 10, currency: 'Token', stock: '3', iconPath: null }] }];
  const right = column(page({ rewardStores: store, extras: extras({ news }) }));
  assert.match(right, />Rewards<[\s\S]*>News</, 'News comes after Rewards');
  assert.doesNotMatch(right, /SANITY LIMIT INCREASE/, 'it opens on Rewards, not News');
  // Only news: the page opens on it, keys as labels, a "- " list as a list, the post linked once.
  const only = column(page({ extras: extras({ news }) }));
  assert.match(only, /<h3>SANITY LIMIT INCREASE<\/h3>/);
  assert.match(only, /event-news-key">Update time<\/span> October 14, 2026/);
  assert.match(only, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
  assert.match(only, /From the official announcement of 2026\/10\/09\./);
  assert.equal((only.match(/href="https:\/\/www\.arknights\.global\/news\/4814"/g) ?? []).length, 1);
  assert.doesNotMatch(column(page({ rewardStores: store, extras: extras({}) })), />News</, 'no news, no tab');
  // A page compiled by a release from before the News tab: no `news` key at all.
  const older = { packs: [], furniture: [], notices: [] } as unknown as NonNullable<PageProps['extras']>;
  assert.doesNotMatch(column(page({ rewardStores: store, extras: older })), />News</);
});

test("the News tab shows the official pictures where the post has them, and the board's banner art above the posts", () => {
  const image = (name: string) => `https://webusstatic.yo-star.com/web-cms-test/upload/content/2026/10/09/${name}.jpg`;
  const news = [{ title: 'SANITY LIMIT INCREASE', source: 'https://www.arknights.global/news/4814', published: '2026-10-09T10:58:00.000Z',
    lines: ['UPDATE TIME: October 14, 2026, 08:00 (UTC-7)', 'DETAILS: Max Sanity +30.'], art: [{ url: image('title'), at: -1 }, { url: image('middle'), at: 1 }, { url: image('end'), at: 2 }], postArt: image('lead') }];
  const board = [{ title: 'Sealed With Time', source: 'https://ark-us-static-online.yo-star.com/announce/Android/announcement/1634.html', shown: '2026-10-14',
    image: 'https://ark-us-static-online.yo-star.com/announce/images/20261009/8aebe82a214826a0ed47455f8b70a821.jpg' }];
  const html = column(page({ extras: extras({ news, board }) }));
  const at = (text: string) => html.indexOf(text);
  assert.ok(at('On the in-game notice board.') < at('From the official announcement'), 'the board first');
  assert.match(html, /class="event-news-board-art"[^>]*alt="Sealed With Time"/);
  assert.match(html, /Shown from 2026\/10\/14\./);
  assert.ok(at(image('lead')) < at(image('title')) && at(image('title')) < at('SANITY LIMIT INCREASE'), "the post's own picture, then the section's title picture above its heading");
  assert.ok(at('UPDATE TIME') < at(image('middle')) && at(image('middle')) < at('Max Sanity'), 'a picture between the lines it stood between');
  assert.ok(at('Max Sanity') < at(image('end')), 'and one at the end of its section');
  assert.match(html, /loading="lazy"/);
  // Only the board: the tab is there.
  assert.match(column(page({ extras: extras({ board }) })), /On the in-game notice board\./);
  // A release from before the art: news sections without it, and no board, still render.
  const older = { packs: [], furniture: [], notices: [], news: news.map(({ art: _art, postArt: _lead, ...section }) => section) } as unknown as NonNullable<PageProps['extras']>;
  assert.match(column(page({ extras: older })), /SANITY LIMIT INCREASE/);
});
