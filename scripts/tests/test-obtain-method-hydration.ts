import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import ObtainMethodPage from '../../pages/obtain-method';
import type { RosterOperator } from '../../lib/operators/operatorTypes';
import type { LimitedOperatorInfo } from '../../lib/gacha/limitedBannerType';

(globalThis as { React?: typeof React }).React = React;

// Hydration compares the server's HTML (rendered on Vercel, in UTC, at the request's
// moment) with the browser's first render (in the reader's timezone, on the reader's
// clock). /obtain-method used to do its day math with setHours/getDate on whichever
// host rendered it: every reader outside UTC got React errors #425/#418/#423 and the
// server HTML thrown away. Both renders must now come out identical, character for
// character, from the props alone. The operators and dates are invented.
const operator = (name: string, releaseDate: string): RosterOperator => ({
  name, rarity: 6, class: 'Guard', branch: null, faction: null, isFuture: false,
  howToObtain: { Limited: 'Yes' } as RosterOperator['howToObtain'],
  characterInfo: { 'Release Date': releaseDate },
});
const props = {
  operators: [operator('Fixture Festival', '2025/07/17'), operator('Fixture Carnival', '2026/01/17'), operator('Fixture Celebration', '2025/05/01'), operator('Fixture Rerun', '2025/01/10')],
  limitedBannerInfo: {
    'Fixture Festival': { type: 'Festival', appearances: ['2025/07/17'] },
    'Fixture Carnival': { type: 'Carnival', appearances: ['2026/01/17'] },
    'Fixture Celebration': { type: 'Celebration', appearances: ['2025/05/01'] },
    'Fixture Rerun': { type: 'Celebration', appearances: ['2025/01/10', '2026/11/10'] },
  } satisfies Record<string, LimitedOperatorInfo>,
  celebrationBannerDates: ['2025/01/10', '2025/05/01', '2026/11/10', '2027/05/01'],
  // The request's clock: server day 2026-09-24.
  now: Date.parse('2026-09-24T12:00:00Z'),
};

/** Renders with the host's timezone and clock set, as a server or a browser would. */
function renderAs(zone: string, hostClock: number): string {
  const RealDate = Date;
  class HostDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) super(hostClock); else super(...(args as ConstructorParameters<typeof Date>));
    }
    static now() { return hostClock; }
  }
  const previous = process.env.TZ;
  process.env.TZ = zone;
  globalThis.Date = HostDate as DateConstructor;
  try {
    return renderToString(createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, unoptimized: true } }, createElement(ObtainMethodPage, props)));
  } finally {
    globalThis.Date = RealDate;
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
}

test('/obtain-method renders the same HTML on a UTC server and in a reader\'s timezone', () => {
  // The server renders at the request's moment; the reader hydrates hours later, on a
  // different calendar day in their own zone, across a daylight-saving change.
  const server = renderAs('UTC', props.now);
  for (const [zone, clock] of [
    ['America/Los_Angeles', '2026-09-25T03:00:00Z'],
    ['Europe/Berlin', '2026-11-02T23:30:00Z'],
    ['Pacific/Auckland', '2027-03-15T12:00:00Z'],
    ['Asia/Tokyo', '2026-09-24T12:00:00Z'],
  ] as const) {
    assert.equal(renderAs(zone, Date.parse(clock)), server, `${zone} at ${clock} would not hydrate`);
  }
  // And the notes are the request's, counted in whole server days.
  for (const note of [
    'Festival — est. 296 days until next rerun',
    'Carnival — est. 115 days until next rerun',
    'Celebration — est. 47 days until next rerun',
    'Celebration — 47 days until scheduled rerun',
  ]) assert.ok(server.includes(note), `missing "${note}"`);
});
