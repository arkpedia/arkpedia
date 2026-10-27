import assert from 'node:assert/strict';
import test from 'node:test';
import tiers from '../../data/farming-tiers.json';
import materials from '../../data/event_materials.json';
import { getFarmingSources } from '../../lib/farming/farmingSources';
import { getFarmingWindows } from '../../lib/schedule/materialCountdown';

test('farming source previews resolve chapter and event artwork for every guide stage', () => {
  const sources = getFarmingSources({ windows: getFarmingWindows(materials), __contentTables: { 'farming-tiers': tiers } });
  for (const tier of tiers) for (const material of tier.materials) for (const stage of material.stages) {
    if (stage.label === 'Event Store') continue;
    assert.ok(sources[stage.label]?.name, stage.label);
    assert.ok(sources[stage.label]?.art, stage.label);
  }
  assert.equal(sources['MB-6'].name, 'Mansfield Break');
  assert.equal(sources['JT8-3'].name, 'Roaring Flare');
  assert.match(sources['JT8-3'].art!, /content-art\/main_8\.webp/);
});

test('source previews use the release table and exact event identity, including old releases', () => {
  const event = '[Rerun] The Masses\' Travels Rerun';
  const sources = getFarmingSources({ windows: { materials: {}, eventStore: [{ event, start: 1, end: 2 }] }, __contentTables: { 'farming-tiers': [] } });
  assert.deepEqual(Object.keys(sources), [event]);
  assert.equal(sources[event].name, event);
  assert.ok(sources[event].art);
  assert.deepEqual(getFarmingSources({}), {});
});

test('chapter-release shops stay active after battles close and repair older farming windows', async () => {
  const { getEventStoreWindows, withCurrentEventStores } = await import('../../lib/schedule/materialCountdown');
  const { resolveEventStoreCountdown } = await import('../../lib/schedule/countdownWindows');
  const shop = getEventStoreWindows().find(window => window.event === '[Celebration] Critical Phase Transition');
  assert.ok(shop);
  assert.equal(shop.end, Date.parse('2026-11-04T11:00:00Z'));
  const legacy = { materials: {}, eventStore: [] };
  const repaired = withCurrentEventStores(legacy);
  const now = Date.parse('2026-10-29T11:00:00Z');
  assert.equal(resolveEventStoreCountdown(repaired, now)?.event, shop.event);
  assert.equal(resolveEventStoreCountdown(repaired, now)?.text, '6 days left');
  assert.equal(resolveEventStoreCountdown({ materials: {}, eventStore: [shop] }, shop.end), null);
  assert.deepEqual(legacy.eventStore, [], 'published props are never mutated');
  const published = { ...shop, end: shop.end + 1000 };
  assert.deepEqual(withCurrentEventStores({ materials: {}, eventStore: [published] }).eventStore.find(window => window.event === shop.event), published);
  assert.ok(getFarmingSources({ windows: repaired })[shop.event!]?.art);
});

test('published chapter names and art cover guide stages newer than the app snapshot', () => {
  const props = { __contentTables: { 'farming-tiers': [{ tier: 3, materials: [{ name: 'Gas', stages: [{ label: '17-5', kind: 'efficient' }] }] }] } };
  const chapter = { id: 'act4mainss_zone1', kind: 'story', label: 'EP 17', name: 'Critical Phase Transition', art: '/event-poster/chapter17.webp' };
  assert.deepEqual(getFarmingSources(props, [chapter])['17-5'], { name: chapter.name, art: chapter.art });
});

test('legacy published props remain serializable when they predate raw countdown windows', async () => {
  const { finalizeFarmingSources } = await import('../../lib/farming/farmingSources');
  const result = await finalizeFarmingSources({});
  assert.equal(Object.hasOwn(result, 'windows'), false);
  assert.deepEqual(result, { sources: {} });
});

test('newly published event shop names and artwork do not require an app deployment', () => {
  const event = { name: '[Side Story] A Future Event Not In The Bundle', poster: '/event-poster/future-event.webp' };
  const props = { windows: { materials: {}, eventStore: [{ event: event.name, start: 1, end: 2 }] } };
  assert.equal(getFarmingSources(props)[event.name], undefined);
  assert.deepEqual(getFarmingSources(props, [], [event])[event.name], { name: event.name, art: event.poster });
});
