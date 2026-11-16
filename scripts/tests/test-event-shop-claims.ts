import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventShopPermitClaims, parseEventPermitClaims } from '../../lib/account-import/eventShopClaims';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';

const shop = 'shop_act42sre';
const catalogue = (quantity = 1, itemId = '7003') => ({ data: { shopId: shop, shopGroup: { group: { shopGood: {
  permit: { goodId: 'permit', goodType: 'NORMAL', item: { id: itemId, count: quantity }, availCount: 3 },
  material: { goodId: 'material', goodType: 'NORMAL', item: { id: '30013', count: 1 }, availCount: 10 },
} } } } });

test('shop purchases identify permits by catalogue items, including partial purchases and explicit zero', () => {
  for (const count of [0, 1, 2, 3]) assert.equal(eventShopPermitClaims(shop, { info: [{ id: 'permit', count }, { id: 'material', count: 8 }] }, catalogue()), count);
  assert.equal(eventShopPermitClaims(shop, { info: [] }, catalogue()), 0);
  assert.equal(eventShopPermitClaims(shop, { info: [{ id: 'permit', count: 2 }] }, catalogue(2)), 4);
  assert.equal(eventShopPermitClaims(shop, { info: [{ id: 'permit', count: 1 }] }, catalogue(1, '7004')), 10);
});

test('missing, malformed or unrelated shops remain unknown rather than resetting claims', () => {
  for (const snapshot of [undefined, {}, { info: null }, { info: [{ id: 'permit', count: -1 }] }, { info: [{ id: 'permit', count: 1.2 }] }, { info: [{ id: 'permit', count: 4 }] }, { info: [{ id: 'permit', count: 1 }, { id: 'permit', count: 1 }] }]) assert.equal(eventShopPermitClaims(shop, snapshot, catalogue()), null);
  assert.equal(eventShopPermitClaims('shop_act42side', { info: [] }, catalogue()), null);
  assert.equal(eventShopPermitClaims(shop, { info: [] }, { result: 1, ...catalogue() }), null);
  assert.equal(eventShopPermitClaims(shop, { info: [] }, catalogue(1, '30013')), null);
  assert.equal(eventShopPermitClaims(shop, { info: [] }, { data: { shopId: shop } }), null);
});

test('normalized claims survive the real account importer and account backup parser', () => {
  const record = accountFromGame({ status: {}, arkpediaEventPermits: { act42sre: 3, act50side: 0 } }, { version: 1, chars: {} }, 'en');
  assert.deepEqual(record.eventPermits, { act42sre: 3, act50side: 0 });
  assert.deepEqual(parseAccount(JSON.stringify(record))?.eventPermits, record.eventPermits);
  for (const value of [[], { act42sre: -1 }, { act42sre: '3' }, { act42sre: 0.5 }, JSON.parse('{"__proto__":3}')]) assert.equal(parseEventPermitClaims(value), undefined);
});

test('shop discovery uses regional shop expiry, not stage expiry, and maps the regional activity back to the plan', async () => {
  const { activeEventShopRequests } = await import('../../lib/account-import/eventShopSchedule');
  const event = { name: 'Rerun', event: 'Rerun', cnAct: 'act42sre', start: '2026-11-05', end: '2026-11-15', startAt: '2026-11-05T15:00:00Z', endAt: '2026-11-15T11:00:00Z', hasShop: true, shopPermits: 3, rerun: true, op: 41, opSource: 'cn' as const, inBacklog: false, wishActId: null, wishDays: 0, wishOrundum: 0 };
  const regional = { sources: {}, events: { Rerun: { startAt: event.startAt, endAt: event.endAt, shopEndAt: '2026-11-19T11:00:00Z', activityId: 'act42regional', timingSource: 'fixture' } } };
  assert.deepEqual(activeEventShopRequests([event], regional, Date.parse('2026-11-15T18:00:00Z')), [{ shopId: 'shop_act42regional', eventId: 'act42sre' }]);
  assert.deepEqual(activeEventShopRequests([event], regional, Date.parse('2026-11-19T11:00:00Z')), []);
  assert.deepEqual(activeEventShopRequests([event], regional, Date.parse('2026-11-01T11:00:00Z')), []);
});
