import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import EventsPanel from '../../components/schedule/EventsPanel';
import FarmableMaterialsPanel from '../../components/home/FarmableMaterialsPanel';
import type { GameEvent } from '../../lib/home/frontPageContent';
import type { FarmingMaterial } from '../../lib/farming/farmingTypes';
import { renderOnHost } from './host-clock';

// The home page's Events panel picked its "Currently Farmable" materials with the host's
// clock on the first render (`now ?? new Date()`). On arkpedia-dev at 2026-10-02T12:00Z
// the server listed PA-7, PA-6 and PA-8 and the browser rendered "No event-boosted
// materials right now.", and React threw the markup away (#418/#423). It now renders from
// the page's `now` prop alone; the reader's clock takes over after mount. Names are
// invented; the windows are People, A People's (closing 2026-09-30T11:00Z).
const start = new Date('2026-09-16T15:00:00Z'), end = new Date('2026-09-30T11:00:00Z');
const ongoing: GameEvent[] = [{ name: 'Fixture Event', poster: null, year: 2026, dateRange: '2026/09/16–2026/09/30', start, end }];
const upcoming: GameEvent = { name: 'Fixture Next Event', poster: null, year: 2026, dateRange: '2026/10/14–2026/10/28',
  start: new Date('2026-10-14T15:00:00Z'), end: new Date('2026-10-28T11:00:00Z') };
const material = (name: string, label: string): FarmingMaterial => ({
  name, icon: `/material-icons/${name}.webp`, stages: [{ label, kind: 'eventActive', startAt: start.toISOString(), endAt: end.toISOString() }],
});
const farmableMaterials = [material('Fixture Aketon', 'PA-7'), material('Fixture Manganese', 'PA-6')];
const at = (iso: string) => Date.parse(iso);
const render = (zone: string, hostClock: string, now: number) =>
  renderOnHost(zone, at(hostClock), createElement(Fragment, null,
    createElement(EventsPanel, { ongoing, upcoming, now }),
    createElement(FarmableMaterialsPanel, { materials: farmableMaterials, now })));

test('the event and farming cards render the same HTML on the server and in a browser on either side of an event closing', () => {
  const now = at('2026-09-30T10:59:00Z');
  const server = render('UTC', '2026-09-30T10:59:30Z', now);
  for (const [zone, clock] of [
    ['UTC', '2026-09-30T11:00:30Z'], // just after the event's stages closed
    ['America/Los_Angeles', '2026-10-02T12:00:00Z'], // the case that threw on arkpedia-dev
    ['Asia/Tokyo', '2026-09-30T09:00:00Z'], // a browser clock running behind
  ] as const) {
    assert.equal(render(zone, clock, now), server, `a browser in ${zone} at ${clock} would not hydrate`);
  }
  assert.ok(server.includes('PA-7') && server.includes('PA-6'), 'the materials boosted at the request\'s clock are listed');
  assert.ok(!server.includes('No event-boosted materials'), server);
});

test('the prop, not the host, decides what is farmable', () => {
  const after = render('UTC', '2026-09-30T10:59:30Z', at('2026-09-30T11:00:00Z'));
  assert.ok(after.includes('No event-boosted materials right now, play any stage you would like.'), 'at the close the materials leave the panel');
});
