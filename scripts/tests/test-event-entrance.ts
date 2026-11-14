import assert from 'node:assert/strict';
import { test } from 'node:test';
import { curveValue } from '../../lib/events/gameUiPlayer';
import { eventEntrance, entranceForUrl } from '../../lib/events/eventEntrance';

test('native curves preserve endpoints, Hermite slopes, weights and stepped keys', () => {
  assert.equal(curveValue([[0, 0, 0, 0, 0, 1/3, 1/3], [1, 1, 0, 0, 0, 1/3, 1/3]], .25), .15625);
  const weighted: Parameters<typeof curveValue>[0] = [[0, 0, 0, 0, 2, 1/3, .1], [1, 1, 0, 0, 1, .6, 1/3]];
  assert.ok(Math.abs(curveValue(weighted, .3125) - .5) < .000001);
  assert.equal(curveValue(weighted, -5), 0); assert.equal(curveValue(weighted, 5), 1);
  assert.equal(curveValue([[0, 4, null, null, 0, 1/3, 1/3], [1, 9, 0, 0, 0, 1/3, 1/3]], .999), 4);
});
test('reviewed entrance matches separate original/rerun and regional assets', () => {
  assert.equal(eventEntrance("[Side Story] The Masses' Travels", 'en')?.id, 'act42side');
  assert.equal(eventEntrance("[Rerun] The Masses' Travels Rerun", 'en')?.id, 'act42sre');
  assert.equal(eventEntrance("[Rerun] The Masses' Travels Rerun", 'jp')?.id, 'act42sre');
  assert.equal(eventEntrance("[Rerun] The Masses' Travels Rerun", 'kr')?.id, 'act42sre');
  assert.equal(eventEntrance("[Rerun] The Masses' Travels Rerun", 'cn'), null);
  assert.equal(eventEntrance('[Side Story] Another Event', 'en'), null);
  const path = '/events/' + encodeURIComponent("[Side Story] The Masses' Travels");
  assert.equal(entranceForUrl(path, 'https://arkpedia.net', 'en')?.id, 'act42side');
  assert.equal(entranceForUrl('https://example.com' + path, 'https://arkpedia.net', 'en'), null);
  assert.equal(entranceForUrl('/events/%xx', 'https://arkpedia.net', 'en'), null);
  assert.equal(entranceForUrl('/schedule', 'https://arkpedia.net', 'en'), null);
});

test('upcoming events use reviewed CN packs without confusing original and rerun versions', () => {
  for (const server of ['en', 'jp', 'kr']) {
    const thunder = eventEntrance('[Side Story – Crossover] Thunder in the Azure Dream', server);
    assert.equal(thunder?.id, 'act50side');
    assert.match(thunder!.folder, /players\/cn\/act50side\//);
    assert.equal(eventEntrance('[Rerun] A Flurry to the Flame Rerun', server)?.id, 'act24sre');
    assert.equal(eventEntrance('[Rerun] Act or Die Rerun', server)?.id, 'act43sre');
    assert.equal(eventEntrance('[Side Story] Ato', server)?.id, 'act44side');
    assert.equal(eventEntrance('[Rerun] Ato Rerun', server)?.id, 'act44sre');
  }
  assert.equal(eventEntrance('[Side Story] A Flurry to the Flame', 'en'), null);
  assert.equal(eventEntrance('[Side Story] Act or Die', 'en'), null);
  assert.equal(eventEntrance('Positional Football Championship', 'en'), null);
});
