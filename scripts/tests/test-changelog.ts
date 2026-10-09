import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHANGELOG, LATEST_CHANGE, type ChangelogEntry } from '../../lib/changelog/entries';
import { groupChangelogDays } from '../../lib/changelog/group';

// tsx compiles the components' JSX to React.createElement (tsconfig keeps JSX for Next).
(globalThis as { React?: typeof React }).React = React;

/* The What's new page (lib/changelog/entries.ts): newest first, each entry at a real UTC
   instant, and every item saying something, with any link pointing at a page the site has. */
test('the changelog is newest first, each entry at a real UTC instant, and every entry says something', () => {
  assert.ok(CHANGELOG.length > 0);
  assert.equal(LATEST_CHANGE, CHANGELOG[0].at);
  for (const [index, entry] of CHANGELOG.entries()) {
    // One instant for every reader, in UTC: the page shows it in each reader's own zone.
    assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${entry.at}: a UTC instant, YYYY-MM-DDTHH:MM:SSZ`);
    assert.equal(new Date(entry.at).toISOString().replace('.000', ''), entry.at, `${entry.at}: a real moment`);
    if (index > 0) assert.ok(entry.at < CHANGELOG[index - 1].at, `${entry.at} comes after ${CHANGELOG[index - 1].at}: newest first`);
    const items = [...(entry.added ?? []), ...(entry.changed ?? []), ...(entry.fixed ?? [])];
    assert.ok(items.length > 0, `${entry.at}: something added, changed or fixed`);
    for (const item of items) {
      // Skimmable: a title that is the point in a few words, and at most one short sentence.
      assert.ok(item.title.trim().length >= 4 && item.title.length <= 48, `${entry.at}: "${item.title}": a title of 4 to 48 characters`);
      assert.ok(!/[.!]$/.test(item.title), `${entry.at}: "${item.title}": a title, not a sentence`);
      if (item.detail !== undefined) {
        assert.ok(item.detail.length <= 130, `${entry.at}: "${item.title}": its detail is ${item.detail.length} characters, past 130`);
        assert.ok((item.detail.match(/[.!?](\s|$)/g) ?? []).length <= 1, `${entry.at}: "${item.title}": one sentence of detail`);
      }
      if (item.href) {
        const page = item.href === '/' ? 'index' : item.href.slice(1);
        assert.ok(['tsx', 'ts'].some((ext) => fs.existsSync(path.join('pages', `${page}.${ext}`)) || fs.existsSync(path.join('pages', page, `index.${ext}`))), `${item.href}: a page the site has`);
      }
    }
  }
});

test('daily grouping combines every category, keeps the newest timestamp and leaves source entries intact', () => {
  const releases: ChangelogEntry[] = [
    { at: '2026-10-08T23:51:56Z', title: 'Campaigns', added: [{ title: 'Campaign art' }], changed: [{ title: 'Daily discovery' }] },
    { at: '2026-10-07T10:00:00Z', title: 'Older update', fixed: [{ title: 'Older fix' }] },
    { at: '2026-10-09T09:56:52Z', title: 'Chibis', added: [{ title: 'Chibi breaks' }], fixed: [{ title: 'Newer fix' }] },
    { at: '2026-10-08T22:50:18Z', title: 'Artwork', changed: [{ title: 'Smoother artwork' }] },
  ];
  const before = structuredClone(releases);
  const days = groupChangelogDays(releases, 'Asia/Seoul');
  assert.deepEqual(days.map(({ day }) => day), ['2026-10-09', '2026-10-07']);
  assert.equal(days[0].at, '2026-10-09T09:56:52Z');
  assert.equal(days[0].title, undefined);
  assert.deepEqual(days[0].added?.map(({ title }) => title), ['Chibi breaks', 'Campaign art']);
  assert.deepEqual(days[0].changed?.map(({ title }) => title), ['Daily discovery', 'Smoother artwork']);
  assert.deepEqual(days[0].fixed?.map(({ title }) => title), ['Newer fix']);
  assert.equal(days[1].title, 'Older update');
  assert.deepEqual(releases, before);
  assert.deepEqual(groupChangelogDays([], 'UTC'), []);
});

test('daily groups follow the displayed timezone and calendar midnight, including daylight saving', () => {
  const releases = [
    { at: '2026-10-09T00:30:00Z', added: [{ title: 'After midnight' }] },
    { at: '2026-10-08T23:30:00Z', added: [{ title: 'Before midnight' }] },
  ];
  assert.equal(groupChangelogDays(releases, 'UTC').length, 2);
  assert.deepEqual(groupChangelogDays(releases, 'Asia/Seoul').map(({ day }) => day), ['2026-10-09']);
  assert.deepEqual(groupChangelogDays(releases, 'America/Los_Angeles').map(({ day }) => day), ['2026-10-08']);
  const fallBack = [
    { at: '2026-11-01T09:30:00Z', added: [{ title: 'After clock change' }] },
    { at: '2026-11-01T08:30:00Z', added: [{ title: 'Before clock change' }] },
  ];
  assert.equal(groupChangelogDays(fallBack, 'America/Los_Angeles').length, 1);
});

test('each displayed day is unique and later releases still update the unread timestamp', () => {
  for (const zone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles']) {
    const days = groupChangelogDays(CHANGELOG, zone);
    assert.equal(new Set(days.map(({ day }) => day)).size, days.length);
    assert.equal(days[0].at, LATEST_CHANGE);
    for (const kind of ['added', 'changed', 'fixed'] as const) {
      assert.equal(days.reduce((total, day) => total + (day[kind]?.length ?? 0), 0),
        CHANGELOG.reduce((total, entry) => total + (entry[kind]?.length ?? 0), 0));
    }
  }
});

test('formatInstant writes an instant in the given zone, en-GB, to the day or the minute', async () => {
  const { formatInstant } = await import('../../components/ui/LocalTime');
  assert.equal(formatInstant('2026-10-05T08:26:00Z', 'minute', 'UTC'), '5 Oct 2026, 08:26 UTC');
  // The zone's name is ICU's (CEST, GMT+8 ...), which differs between Node builds: the time is the point.
  assert.match(formatInstant('2026-10-05T08:26:00Z', 'minute', 'Europe/Berlin'), /^5 Oct 2026, 10:26 \S+$/);
  assert.match(formatInstant('2026-10-05T08:26:00Z', 'minute', 'Asia/Shanghai'), /^5 Oct 2026, 16:26 \S+$/);
  // Across midnight the reader's day is the one shown.
  assert.match(formatInstant('2026-10-05T23:30:00Z', 'minute', 'Asia/Tokyo'), /^6 Oct 2026, 08:30 \S+$/);
  assert.match(formatInstant('2026-10-05T08:26:00Z', 'minute', 'America/Los_Angeles'), /^5 Oct 2026, 01:26 \S+$/);
  // To the day, as What's new shows an entry: no time, and still the reader's day.
  assert.equal(formatInstant('2026-10-05T08:26:00Z', 'day', 'UTC'), '5 Oct 2026');
  assert.equal(formatInstant('2026-10-05T23:30:00Z', 'day', 'Asia/Tokyo'), '6 Oct 2026');
  assert.equal(formatInstant('2026-10-05T03:00:00Z', 'day', 'America/Los_Angeles'), '4 Oct 2026');
});

test('LocalTime renders an entry\'s moment in UTC on the server, with the instant in dateTime and the UTC time as its title', async () => {
  // The browser's first render writes the same, so hydration has nothing to correct; the reader's
  // own zone replaces the text once mounted, which a static render never reaches.
  const { default: LocalTime } = await import('../../components/ui/LocalTime');
  assert.equal(renderToStaticMarkup(createElement(LocalTime, { iso: '2026-10-05T08:26:00Z', precision: 'minute' })),
    '<time dateTime="2026-10-05T08:26:00Z" title="5 Oct 2026, 08:26 UTC">5 Oct 2026, 08:26 UTC</time>');
  // To the day: the date alone, the full moment still in the tooltip.
  assert.equal(renderToStaticMarkup(createElement(LocalTime, { iso: '2026-10-05T08:26:00Z', precision: 'day' })),
    '<time dateTime="2026-10-05T08:26:00Z" title="5 Oct 2026, 08:26 UTC">5 Oct 2026</time>');
});
