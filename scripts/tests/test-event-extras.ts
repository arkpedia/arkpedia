import './css-modules';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import React, { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { eventExtras, EVENTS_STORE, furniturePieceSource, TABLE_REWARD_LABEL, tableRewardStores, type TableRewardGroup } from '../../lib/events/tableRewards';
import type { ResolvedRewardStore } from '../../lib/events/rewardTotals';
import { eventTitle, isRerun } from '../../lib/events/eventName.mjs';
import { EventFurniture, EventPacks, packDay } from '../../components/events/EventExtras';

/*
 * An event's rewards beyond its store, as /events/[slug] lays them out (lib/events/tableRewards.ts):
 * which groups of data/event-rewards.json become reward blocks and under which tab, which become
 * the Packs, Announced and Furniture tabs, and where the furniture checklist says a piece comes
 * from. The groups are made up in the file's shape; nothing here reads data/, so the day's refresh
 * cannot move a case.
 */
(globalThis as { React?: typeof React }).React = React;
const render = (element: ReactElement) => renderToStaticMarkup(
  createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, unoptimized: true } }, element));

const item = (name: string, kind: string, count = 1) => ({ name, kind, count, id: `id_${name}` });
const group = (kind: TableRewardGroup['kind'], title: string, items: ReturnType<typeof item>[], extra: Partial<TableRewardGroup> = {}): TableRewardGroup => ({ kind, title, source: 'test', items, ...extra });
const groups: TableRewardGroup[] = [
  group('login', 'Sign-in', [item('Orundum', 'currency', 600), item('Headhunting Permit', 'permit', 2)]),
  group('banner-gift', 'Banner gift', [item('Sing while Drinking Headhunting Permit (ten-roll)', 'permit')]),
  group('free-rolls', 'Daily free rolls', [item('Daily free headhunting roll', 'free-roll', 14)]),
  group('missions', 'Event missions', [item('Dusk Inkstick', 'event-item', 200), item('Kroos the Keen Glint', 'operator'), item('Chair', 'furniture')]),
  // A group of tokens only: nothing left to list.
  group('missions', 'Daily missions', [item('Dusk Inkstick', 'event-item', 50)]),
  group('milestones', 'Point rewards', [item('Duel Trophy', 'furniture')]),
  group('first-clear', 'Event stage first clears', [item('Originite Prime', 'currency', 28)]),
  group('pray', 'Lucky draw', []),
  group('packs', 'Packs', [], { packs: [{ name: 'Starter Pack', start: '2026-09-16T15:00:00.000Z', end: '2026-09-30T06:59:00.000Z', contents: [{ name: 'Orundum', count: 1200, kind: 'currency' }] }] }),
  group('notice', 'Login gifts', [], { lines: ['DURATION: two weeks', 'REWARDS: 10 Headhunting Permits'] }),
  group('furniture-set', 'Duel Set', [], { description: 'A set.', pieces: [{ name: 'Chair', id: 'furni_chair', obtain: 'Furniture store', comfort: 10 }, { name: 'Table', id: 'furni_table', obtain: null, comfort: null }] }),
  // An empty notice and an empty pack group are no tab of their own.
  group('notice', 'Nothing to say', [], { lines: [] }),
  group('packs', 'No packs', [], { packs: [] }),
];

test('each group of rewards to total becomes a block under its tab; draws, packs, notices and sets do not', () => {
  const blocks = tableRewardStores(groups, (reward) => `/icons/${reward.name}`);
  assert.deepEqual(blocks.map((block) => [block.type, block.name]), [
    ['Login event', 'Sign-in'], ['Headhunting', 'Banner gift'], ['Headhunting', 'Daily free rolls'],
    ['Missions', 'Event missions'], ['Milestones', 'Point rewards'], ['First clears', 'Event stage first clears'],
  ]);
  for (const kind of ['pray', 'packs', 'notice', 'furniture-set'] as const) assert.equal(TABLE_REWARD_LABEL[kind], null, kind);
  // Tokens are the store's currency: in no block, and a group of nothing else is no block at all.
  assert.ok(blocks.every((block) => block.items.every((reward) => reward.name !== 'Dusk Inkstick')));
  assert.equal(blocks.some((block) => block.name === 'Daily missions'), false);
  // Every listing is free, once, with the icon the page resolves for it.
  assert.deepEqual(blocks[3].items, [
    { name: 'Kroos the Keen Glint', quantity: 1, price: null, currency: '', stock: '1', iconPath: '/icons/Kroos the Keen Glint' },
    { name: 'Chair', quantity: 1, price: null, currency: '', stock: '1', iconPath: '/icons/Chair' },
  ]);
});

test('packs, announced gifts and furniture sets become their own tabs, empty ones left out', () => {
  const extras = eventExtras(groups, (name) => (name === 'Orundum' ? '/icons/Orundum' : null));
  assert.deepEqual(extras.packs.map((g) => g.packs.map((pack) => [pack.name, pack.end, pack.contents])), [
    [['Starter Pack', '2026-09-30T06:59:00.000Z', [{ name: 'Orundum', count: 1200, kind: 'currency', iconPath: '/icons/Orundum' }]]],
  ]);
  assert.deepEqual(extras.notices, [{ title: 'Login gifts', source: 'test', lines: ['DURATION: two weeks', 'REWARDS: 10 Headhunting Permits'] }]);
  assert.deepEqual(extras.furniture.map((set) => [set.title, set.description, set.pieces.map((piece) => piece.name)]), [['Duel Set', 'A set.', ['Chair', 'Table']]]);
  // A pack with no end in the post keeps null (JSON cannot carry undefined).
  const open = eventExtras([group('packs', 'P', [], { packs: [{ name: 'Open', start: '2026-09-16T15:00:00.000Z', contents: [] }] })], () => null);
  assert.equal(open.packs[0].packs[0].end, null);
});

test('furniture uses published official Global shop art, then CN, including old rerun records', () => {
  const set = group('furniture-set', "Paganini's Firearms Workshop", [], {
    source: 'building_data furni_set_gunworkshop', inherited: 'Original run',
    pieces: [{ name: 'Storage Rack', id: 'furni_rack', obtain: 'Event missions', comfort: 95 }],
  });
  const cn = 'content-art/furni_set_gunworkshop-cn.webp';
  const en = 'content-art/furni_set_gunworkshop-en.webp';
  const extras = (published: string[]) => eventExtras([set], () => null, () => null, file => published.includes(file));
  assert.equal(extras([]).furniture[0].imagePath, null);
  assert.equal(extras([cn]).furniture[0].imagePath, `/${cn}`);
  assert.equal(extras([cn, en]).furniture[0].imagePath, `/${en}`);
  const html = render(createElement(EventFurniture, { sets: extras([cn, en]).furniture }));
  assert.match(html, /furni_set_gunworkshop-en.webp/);
  assert.match(html, /in-game shop artwork/);
  assert.match(html, /Storage Rack/);
  assert.doesNotMatch(render(createElement(EventFurniture, { sets: extras([]).furniture })), /<img/);
});

test("the furniture checklist names the store and price, else the block, by the blocks' own labels", () => {
  const blocks: ResolvedRewardStore[] = [
    { type: EVENTS_STORE, name: 'Duel Market', items: [{ name: 'Table', quantity: 1, price: 120, currency: 'Duel Coin', stock: '1', iconPath: null }, { name: 'Lamp', quantity: 1, price: null, currency: '', stock: '1', iconPath: null }] },
    ...tableRewardStores(groups, () => null),
  ];
  assert.equal(furniturePieceSource('Table', blocks), 'Duel Market: 120 Duel Coin');
  assert.equal(furniturePieceSource('Lamp', blocks), 'Duel Market');
  assert.equal(furniturePieceSource('Chair', blocks), 'Event missions');
  assert.equal(furniturePieceSource('Duel Trophy', blocks), 'Milestones');
  assert.equal(furniturePieceSource('Rug', blocks), null, 'the page then says how the game says it is obtained');
});

test('a pack window is dated on the Global server clock (UTC-7), day first, as the announcement dates it', () => {
  // "September 29, 2026, 23:59 (UTC-7)" is stored as the next day's 06:59 UTC: the post's day is the 29th.
  assert.match(packDay('2026-09-30T06:59:00.000Z'), /^29 Sept? 2026$/);
  assert.match(packDay('2026-09-30T07:00:00.000Z', { exclusiveEnd: true }), /^29 Sept? 2026$/);
  assert.match(packDay('2026-09-30T07:00:00.000Z'), /^30 Sept? 2026$/, 'ordinary publication/opening dates are not shifted');
  assert.match(packDay('2026-09-16T15:00:00.000Z'), /^16 Sept? 2026$/);
  assert.equal(packDay('soon'), 'soon', 'text that is not a date is shown as it is');
  const exclusive = eventExtras(groups, () => null).packs.map(group => ({ ...group, packs: group.packs.map(pack => ({ ...pack, end: '2026-09-30T07:00:00.000Z' })) }));
  const html = render(createElement(EventPacks, { groups: exclusive }));
  assert.match(html, /event-pack-window">16 Sept? 2026 – 29 Sept? 2026</);
  assert.doesNotMatch(html, /Sep 30|30 Sept?/);
});

test("an event's title drops its leading tag, and a rerun is known by either mark", () => {
  assert.equal(eventTitle('[Side Story – Festival] Invitation to Wine'), 'Invitation to Wine');
  assert.equal(eventTitle('Contingency Contract Obliteration'), 'Contingency Contract Obliteration');
  assert.ok(isRerun('[Rerun] Invitation to Wine Rerun') && isRerun('[Rerun] Invitation to Wine') && isRerun('Invitation to Wine Rerun'));
  assert.ok(!isRerun('[Side Story] Invitation to Wine') && !isRerun('Rerunner'));
});

test('the event name rules load in plain Node, as a pipeline script would import them', () => {
  // lib/events/eventName.mjs is plain JavaScript so the Node scripts can read the same two rules
  // the page does. Imported here by a bare `node` with tsx's loader taken off, so a type annotation
  // or a TypeScript-only import slipped into it fails this test, not a pipeline run.
  const script = "import { eventTitle, isRerun } from './lib/events/eventName.mjs'; process.stdout.write(JSON.stringify([eventTitle('[Rerun] Path of Life Rerun'), isRerun('[Rerun] Path of Life Rerun'), eventTitle(undefined)]));";
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['Path of Life Rerun', true, '']);
});
