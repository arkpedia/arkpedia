import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error JavaScript importer is also run directly by the refresh job.
import { rewardNames, globalStart, localizeRewards, iconFile } from '../sync/sync-reward-names.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { checkCompleteness, readCompletenessInputs } from '../content/check-completeness.mjs';

/* IDs and names copied from the live CN and EN building_data / item_table entries for
   the People, A People store (furni_ursusRoom_*), plus one furniture the EN client does
   not have yet (Critical Phase Transition) and one CN name shared by two IDs. */
const cn = {
  items: { items: { 4001: { name: '龙门币' }, dupe_a: { name: '同名家具' } } },
  building: { customData: { furnitures: {
    furni_ursusRoom_basin_01: { name: '制式木盆' },
    furni_ursusRoom_floor_01: { name: '“烛火之中”' },
    furni_rabbitCinema_stool_01: { name: '“回看”高脚凳' },
    dupe_b: { name: '同名家具' },
  } } },
};
const en = {
  items: { items: { 4001: { name: 'LMD' }, dupe_a: { name: 'Same Name A' } } },
  building: { customData: { furnitures: {
    furni_ursusRoom_basin_01: { name: 'Standard Wooden Basin' },
    furni_ursusRoom_floor_01: { name: "'V Plameni Svechi'" },
    dupe_b: { name: 'Same Name B' },
  } } },
};
const store = (items: object[]) => ({ type: 'Events Store', name: 'Snow-soaked Campfire', currency: 'Broken Poetry Verse', items });
const item = (name: string, extra: object = {}) => ({ name, type: 'material', reward_quantity: 1, stock: '1', price: 40, icon: 'white_square', ...extra });
const now = Date.parse('2026-09-23T00:00:00Z');

test('CN reward names map to official EN names by game ID only, never by guessing', () => {
  const names = rewardNames(cn, en);
  assert.equal(names.get('制式木盆'), 'Standard Wooden Basin');
  assert.equal(names.get('“烛火之中”'), "'V Plameni Svechi'");
  assert.equal(names.get('龙门币'), 'LMD');
  assert.equal(names.has('“回看”高脚凳'), false, 'not in the EN client yet');
  assert.equal(names.has('同名家具'), false, 'two IDs with different EN names');
});

test('an event is renamed once it has started on Global, keeping the CN name and the published icon', () => {
  const events: any[] = [
    { name: '[Side Story] People, A People', global: { dateRange: '2026/09/16–2026/09/30', startAt: '2026-09-16T15:00:00.000Z' },
      rewards: store([item('制式木盆'), item('“烛火之中”'), item('Headhunting Permit'), item('Infiltrator', { type: 'skin' }), item('“回看”高脚凳')]) },
    { name: '[Celebration] Critical Phase Transition', global: { dateRange: '2026/10/14–2026/10/28' }, rewards: store([item('制式木盆')]) },
    { name: 'Unannounced', global: { dateRange: null }, rewards: [store([item('制式木盆')])] },
  ];
  const published = new Set(['制式木盆.webp', '“烛火之中”.webp', 'Headhunting Permit.webp']);
  const { events: next, renamed } = localizeRewards(events, rewardNames(cn, en), published, now);
  const items = next[0].rewards.items;
  assert.deepEqual(items.map((i: any) => [i.name, i.cnName, i.iconName]), [
    ['Standard Wooden Basin', '制式木盆', '制式木盆'],
    ["'V Plameni Svechi'", '“烛火之中”', '“烛火之中”'],
    ['Headhunting Permit', undefined, undefined],
    ['Infiltrator', undefined, undefined],
    ['“回看”高脚凳', undefined, undefined],
  ]);
  assert.equal(items[0].price, 40);
  assert.equal(renamed.length, 2);
  // Not started on Global: untouched, whatever the EN tables already hold.
  assert.equal(next[1].rewards.items[0].name, '制式木盆');
  assert.equal(next[2].rewards[0].items[0].name, '制式木盆');
  // The input is not mutated, and a second run changes nothing.
  assert.equal(events[0].rewards.items[0].name, '制式木盆');
  assert.deepEqual(localizeRewards(next, rewardNames(cn, en), published, now).events, next);
  // Once the EN-named copy is published the item shows it, and only then.
  const withEnglish = new Set([...published, iconFile('Standard Wooden Basin'), iconFile("'V Plameni Svechi'")]);
  const after = localizeRewards(next, rewardNames(cn, en), withEnglish, now).events[0].rewards.items;
  assert.deepEqual(after.slice(0, 2).map((i: any) => [i.name, i.cnName, i.iconName]),
    [['Standard Wooden Basin', '制式木盆', undefined], ["'V Plameni Svechi'", '“烛火之中”', undefined]]);
});

test('Global start is the client window when known, else the announced UTC−7 day', () => {
  assert.equal(globalStart({ global: { startAt: '2026-09-16T15:00:00.000Z', dateRange: '2026/09/16–2026/09/30' } }), Date.parse('2026-09-16T15:00:00.000Z'));
  assert.equal(globalStart({ global: { dateRange: '2026/10/14–2026/10/28' } }), Date.parse('2026-10-14T07:00:00.000Z'));
  assert.equal(globalStart({ global: { dateRange: null } }), null);
  assert.equal(iconFile('Chimed "Tapestry"/Rack?'), 'Chimed TapestryRack.webp');
});

test('publication fails when a renamed reward would render without an icon', () => {
  const input = readCompletenessInputs();
  const event = { name: '[Side Story] People, A People', rewards: store([item('Standard Wooden Basin', { cnName: '制式木盆', iconName: '制式木盆' })]) };
  const assets = new Set([...input.assets, 'material-icons/制式木盆.webp']);
  assert.deepEqual(checkCompleteness({ ...input, events: [...input.events, event], assets }), []);
  const dropped = { ...event, rewards: store([item('Standard Wooden Basin', { cnName: '制式木盆' })]) };
  assert.match(checkCompleteness({ ...input, events: [...input.events, dropped], assets }).join('\n'),
    /People, A People reward Standard Wooden Basin: missing asset material-icons\/Standard Wooden Basin\.webp/);
});
