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
  createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, unoptimized: true } }, element));

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

const extras = (over: Partial<NonNullable<PageProps['extras']>>) => ({ packs: [], furniture: [], notices: [], ...over });

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
