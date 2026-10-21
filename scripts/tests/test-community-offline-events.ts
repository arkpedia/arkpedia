import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENTS } from '../../lib/schedule/eventsConfig';

/** An ISO instant that names its zone: a record without one reads in whatever zone the
 *  build machine runs in. */
const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
const KINDS = [undefined, 'collab', 'guest', 'fan'];

test('every offline event has a zoned date range and a kind the list can label', () => {
  for (const event of EVENTS) {
    assert.ok(event.name.trim(), 'every event has a name');
    assert.ok(event.country.trim(), `${event.name}: names a country`);
    assert.match(event.startTime, ZONED, `${event.name}: start names its zone`);
    assert.ok(event.endTime, `${event.name}: has an end`);
    assert.match(event.endTime!, ZONED, `${event.name}: end names its zone`);
    assert.ok(Date.parse(event.endTime!) > Date.parse(event.startTime), `${event.name}: ends after it starts`);
    assert.ok(Math.abs(event.lat) <= 90 && Math.abs(event.lng) <= 180, `${event.name}: pin is on the map`);
    // EventListPanel labels a kind through KIND_LABELS; an unknown kind would render blank.
    assert.ok(KINDS.includes(event.kind), `${event.name}: kind is one of ${KINDS.filter(Boolean).join(', ')} or absent`);
  }
});

test('guest and fan records each link a public page a reader can open', () => {
  for (const event of EVENTS.filter(event => event.kind === 'guest' || event.kind === 'fan')) {
    assert.equal(new URL(event.url).protocol, 'https:', `${event.name}: an https source`);
  }
});
