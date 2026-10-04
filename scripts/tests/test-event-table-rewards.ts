import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error Node scripts are plain JavaScript.
import { buildEventRewards, eventTitle, globalStart } from '../build/build-event-rewards.mjs';

/*
 * The rewards the game tables list for an event beyond its store (build-event-rewards.mjs),
 * held to a community compilation of Invitation to Wine (Global, 2022-07-29): its login event
 * gave 3 Originite Prime, 600 Orundum and 2 Headhunting Permits, and its stages 28 Originite
 * Prime on first clear. The fixture is cut from the Global tables at the pinned commit.
 */
const fixture = JSON.parse(fs.readFileSync('scripts/tests/fixtures/event-rewards-invitation-to-wine.json', 'utf8'));
type Item = { name: string; count: number; kind: string };
type Group = { kind: string; title: string; source: string; items: Item[]; days?: number; count?: number; daily?: Item[][]; rules?: string[] };

test('Invitation to Wine: the login event, the banner gift, the missions and the first clears, as the compilation counts them', () => {
  const result = buildEventRewards([fixture.event], fixture.tables, [], null);
  const event = result[fixture.event.name] as { activity: string; groups: Group[] };
  assert.equal(event.activity, 'act15side');
  const group = (kind: string) => event.groups.find(g => g.kind === kind)!;
  const count = (g: Group, name: string) => g.items.find(i => i.name === name)?.count ?? 0;

  const login = group('login');
  assert.equal(login.source, 'activity_table act25sign');
  assert.deepEqual([count(login, 'Originite Prime'), count(login, 'Orundum'), count(login, 'Headhunting Permit')], [3, 600, 2]);
  assert.equal(login.daily!.length, login.days);
  assert.equal(login.daily!.flat().filter(i => i.name === 'Orundum').reduce((n, i) => n + i.count, 0), 600, 'the days add up to the total');

  const firstClear = group('first-clear');
  assert.deepEqual([firstClear.count, count(firstClear, 'Originite Prime')], [28, 28]);

  assert.deepEqual(group('banner-gift').items.map(i => [i.name, i.count, i.kind]), [['Sing while Drinking Headhunting Permit', 1, 'permit']]);
  assert.ok(group('missions').items.some(i => i.name === 'Kroos the Keen Glint' && i.kind === 'operator'));
  // A draw login is named, with its rules, and never given a made-up payout.
  assert.deepEqual(group('pray').items, []);
  assert.ok(group('pray').rules!.length > 0);
});

test('an event is matched to its own activity by name and Global start, not by a neighbour', () => {
  assert.equal(eventTitle('[Side Story – Festival] Invitation to Wine'), 'Invitation to Wine');
  assert.equal(globalStart({ global: { dateRange: '2022/07/29–2022/08/12' } }), Date.UTC(2022, 6, 29, 7) / 1000);
  assert.equal(globalStart({ global: { dateRange: '' } }), null);
  // A week off: not this event's activity, so nothing is attached.
  const late = { ...fixture.event, global: { dateRange: '2022/08/20–2022/09/01' } };
  assert.deepEqual(buildEventRewards([late], fixture.tables, [], null), {});
  // A rerun spelled "X Rerun" in the records matches the tables' "X - Rerun".
  const tables = structuredClone(fixture.tables);
  tables.activity.basicInfo.act15side.name = 'Invitation to Wine - Rerun';
  assert.ok(buildEventRewards([{ ...fixture.event, name: '[Rerun] Invitation to Wine Rerun' }], tables, [], null)['[Rerun] Invitation to Wine Rerun']);
});

test('an official announcement\'s packs belong to the event it announces, and to no other', () => {
  const post = JSON.parse(fs.readFileSync('scripts/tests/fixtures/official-news/4635.json', 'utf8'));
  const people = { name: '[Side Story] People, A People', global: { dateRange: '2026/09/16–2026/09/30' } };
  const other = { name: '[Side Story] Somewhere Else', global: { dateRange: '2026/09/16–2026/09/30' } };
  const empty = { activity: { basicInfo: {}, activity: {}, missionData: [] }, stages: { stages: {} }, items: { items: {} }, building: { customData: { furnitures: {}, themes: {} } }, characters: {}, skins: { charSkins: {} } };
  const result = buildEventRewards([people, other], empty, [post], null);
  assert.equal(result[other.name], undefined, 'a same-day event the post does not name gets nothing');
  const packs = (result[people.name].groups as Group[]).filter(g => g.kind === 'packs');
  assert.ok(packs.length >= 1);
  assert.equal((packs[0] as Group & { source: string }).source, 'https://www.arknights.global/news/4635');
  // A week later: not this post's event.
  assert.deepEqual(buildEventRewards([{ ...people, global: { dateRange: '2026/09/23–2026/10/07' } }], empty, [post], null), {});
});

test('a rerun shows its original run\'s missions, first clears and furniture until its own are out', () => {
  const rerun = { name: '[Rerun] Invitation to Wine Rerun', global: { dateRange: '2099/01/01–2099/01/10' } };
  const result = buildEventRewards([fixture.event, rerun], fixture.tables, [], null);
  const entry = result[rerun.name] as { inheritsFrom: string; groups: (Group & { inherited?: string })[] };
  assert.equal(entry.inheritsFrom, fixture.event.name);
  assert.deepEqual(entry.groups.map(g => g.kind).sort(), ['first-clear', 'missions']);
  assert.ok(entry.groups.every(g => g.inherited === fixture.event.name));
  // Never the original's dated sign-in or gifts: those were the original run's days.
  assert.ok(!entry.groups.some(g => g.kind === 'login' || g.kind === 'banner-gift'));
  assert.throws(() => buildEventRewards([fixture.event], fixture.tables, [], undefined), /CN tables/);
});

test('an event Global has not had yet is built from the CN tables, with Global names where Global has the item', () => {
  // The fixture's tables standing in for the CN client: the same activity, on a CN date, with Global
  // having none of it.
  const cnTables = structuredClone(fixture.tables);
  const upcoming = { name: '[Celebration] Somewhere New', global: { dateRange: '2099/01/01–2099/01/10' }, cn: { dateRange: '2022/07/29–2022/08/12' } };
  const global = { ...fixture.tables, activity: { basicInfo: {}, activity: {}, missionData: [] }, stages: { stages: {} } };
  const result = buildEventRewards([upcoming], global, [], cnTables);
  const entry = result[upcoming.name] as { region: string; groups: (Group & { region?: string })[] };
  assert.equal(entry.region, 'CN');
  assert.ok(entry.groups.length > 0 && entry.groups.every(g => g.region === 'CN'));
  assert.ok(entry.groups.find(g => g.kind === 'login')!.items.some(i => i.name === 'Orundum'), 'an item Global has is named in English');
  // A Global event already dated in the past is never built from CN.
  assert.deepEqual(buildEventRewards([{ ...upcoming, global: { dateRange: '2001/01/01–2001/01/10' } }], global, [], cnTables), {});
});
