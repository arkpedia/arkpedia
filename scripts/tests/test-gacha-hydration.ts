import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import './css-modules';
import GachaSimulator from '../../pages/gacha';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';
import { renderOnHost } from './host-clock';

// /gacha is rendered on the server at the request's moment and hydrated in the reader's
// browser later. Its Upcoming tab and LIVE NOW badge used to read the host's clock during
// render, so a reader who arrived after a banner closed got React #425/#418/#423 and the
// server markup thrown away (arkpedia-dev, clock set to 2026-09-30T11:05Z, just after Rage
// of The Many closed at 11:00Z). Both renders now come from the `now` prop alone. Banner
// names and lineups are invented; the windows are the real boundary's.
const banner = (name: string, global_date: string, extra: Partial<HeadhuntingBanner> = {}): HeadhuntingBanner => ({
  name, category: 'limited', cn_date: null, global_date, six_stars: [], five_stars: [], pull_type: 'limited', year: 2026, linked_event: null, banner_image: null, ...extra,
});
const banners = [
  banner('Fixture Next Limited', '2026/10/01–2026/10/15'),
  banner('Fixture Standard Pool', '2026/09/24–2026/10/08', { category: 'standard', pull_type: 'standard' }),
  banner('Fixture Rage', '2026/09/16–2026/09/30'),
];
const props = (now: number) => ({
  pools: { six: [], five: [], four: [], three: [] }, banners, kernelLookup: {}, releaseLookup: {}, kernelExclusiveNames: [],
  howToObtainLookup: {}, operatorSeriesMap: {}, now,
});
const at = (iso: string) => Date.parse(iso);
const render = (zone: string, hostClock: string, now: number) => renderOnHost(zone, at(hostClock), createElement(GachaSimulator, props(now)));
const liveBadges = (html: string) => html.match(/LIVE NOW/g)?.length ?? 0;

test('/gacha renders the same HTML on the server and in a browser on either side of a banner closing', () => {
  // The server rendered a minute before Rage closed (contentPageClock rounds to the minute).
  const now = at('2026-09-30T10:59:00Z');
  const server = render('UTC', '2026-09-30T10:59:30Z', now);
  for (const [zone, clock] of [
    ['UTC', '2026-09-30T11:05:00Z'], // just after Rage closed: the case that threw on arkpedia-dev
    ['America/Los_Angeles', '2026-10-02T12:00:00Z'], // after the next banner opened, too
    ['Asia/Tokyo', '2026-09-30T10:00:00Z'], // a browser clock running behind
  ] as const) {
    assert.equal(render(zone, clock, now), server, `a browser in ${zone} at ${clock} would not hydrate`);
  }
  // And the markup is the request's: Rage and the standard pool are live at `now`.
  assert.equal(liveBadges(server), 2, 'Rage and the standard pool are LIVE NOW at the request\'s clock');
  assert.ok(server.includes('Fixture Rage'), 'Rage is still in the Upcoming tab at the request\'s clock');
});

test('the prop, not the host, moves a banner out of the Upcoming tab', () => {
  // The same host clock, a request after Rage closed: Rage is gone and one banner is live.
  const after = render('UTC', '2026-09-30T10:59:30Z', at('2026-09-30T11:00:00Z'));
  assert.equal(liveBadges(after), 1);
  assert.ok(!after.includes('Fixture Rage'), 'an ended banner leaves the Upcoming tab');
});
