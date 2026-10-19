import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { currentMaintenance, currentRegionalMaintenance, maintenanceText } from '../../lib/home/maintenance';
import { readMaintenanceWindows } from '../../lib/home/maintenanceServer';
import MaintenanceNotice from '../../components/home/MaintenanceNotice';

// tsx compiles the component's JSX to React.createElement (tsconfig keeps JSX for Next).
(globalThis as { React?: typeof React }).React = React;

const url = 'https://ark-us-static-online.yo-star.com/announce/Android/announcement/1640.html';
const window = { startAt: '2026-10-21T15:00:00.000Z', endAt: '2026-10-21T16:00:00.000Z', url };

const none = { en: [], jp: [], kr: [] };

test('a maintenance window reads in its own server\'s time while it is to come or under way, and not after', () => {
  assert.equal(maintenanceText(window, Date.parse('2026-10-20T00:00:00Z'), 'en'), 'Global server maintenance Oct 21, 08:00–09:00 (UTC−7)');
  assert.equal(maintenanceText(window, Date.parse('2026-10-21T15:30:00Z'), 'en'), 'Global server maintenance under way until 09:00 (UTC−7)');
  const overnight = { ...window, startAt: '2026-10-22T06:00:00.000Z', endAt: '2026-10-22T09:00:00.000Z' };
  assert.equal(maintenanceText(overnight, Date.parse('2026-10-20T00:00:00Z'), 'en'), 'Global server maintenance Oct 21, 23:00–Oct 22, 02:00 (UTC−7)');
  const jp = { startAt: '2026-10-14T01:00:00.000Z', endAt: '2026-10-14T07:00:00.000Z', url };
  assert.equal(maintenanceText(jp, Date.parse('2026-10-13T00:00:00Z'), 'jp'), 'Japan server maintenance Oct 14, 10:00–16:00 (UTC+9)');
  assert.equal(maintenanceText(jp, Date.parse('2026-10-14T02:00:00Z'), 'kr'), 'Korea server maintenance under way until 16:00 (UTC+9)');
  assert.deepEqual(currentMaintenance([overnight, window], Date.parse('2026-10-20T00:00:00Z')), [window, overnight]);
  assert.deepEqual(currentMaintenance([window], Date.parse('2026-10-21T16:00:00Z')), []);
  assert.deepEqual(currentRegionalMaintenance({ jp: [window] }, Date.parse('2026-10-20T00:00:00Z')), { en: [], jp: [window], kr: [] }, 'every server, a missing one empty');
});

test('the home notice renders every server\'s from the props and the clock, each marked for CSS, and nothing once over', () => {
  const jp = { startAt: '2026-10-21T07:00:00.000Z', endAt: '2026-10-21T08:00:00.000Z', url };
  const html = renderToStaticMarkup(createElement(MaintenanceNotice, { maintenance: { ...none, en: [window], jp: [jp] }, now: Date.parse('2026-10-20T00:00:00Z') }));
  assert.match(html, /class="maintenance-notice" data-server="en"/);
  assert.match(html, /class="maintenance-notice" data-server="jp"/);
  assert.doesNotMatch(html, /data-server="kr"/, 'a server with none has no notice');
  assert.match(html, /Global server maintenance Oct 21, 08:00–09:00 \(UTC−7\)/);
  assert.match(html, /Japan server maintenance Oct 21, 16:00–17:00 \(UTC\+9\)/);
  assert.match(html, new RegExp(`href="${url}"`));
  assert.equal(renderToStaticMarkup(createElement(MaintenanceNotice, { maintenance: { ...none, en: [window] }, now: Date.parse('2026-10-22T00:00:00Z') })), '');
});

test('the stylesheet shows only the site server\'s notice, Global when none is set', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'styles/home/front.css'), 'utf8');
  assert.match(css, /html:not\(\[data-site-server="jp"\]\):not\(\[data-site-server="kr"\]\) \.maintenance-notice:not\(\[data-server="en"\]\)/);
  assert.match(css, /html\[data-site-server="jp"\] \.maintenance-notice:not\(\[data-server="jp"\]\)/);
  assert.match(css, /html\[data-site-server="kr"\] \.maintenance-notice:not\(\[data-server="kr"\]\)/);
});

test('the home page reads each server\'s notices with a window, and none without the content run\'s file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-maintenance-'));
  const cwd = process.cwd();
  try {
    process.chdir(root);
    assert.deepEqual(readMaintenanceWindows(), none);
    fs.mkdirSync('data');
    const notice = (id: string, group: string, maintenance: unknown) => ({ id, group, title: 't', url: `https://x.test/${id}.html`, firstSeen: '2026-10-18', ...(maintenance === undefined ? {} : { maintenance }) });
    fs.writeFileSync('data/official-bulletins.json', JSON.stringify({ version: 1, regions: {
      en: { bulletins: [], notices: [notice('1', 'SYSTEM', window), notice('2', 'SYSTEM', null), notice('3', 'ACTIVITY', undefined), notice('4', 'SYSTEM', { startAt: '2026-10-01T15:00:00.000Z', endAt: '2026-10-01T16:00:00.000Z' }), notice('5', 'SYSTEM', window)] },
      jp: { bulletins: [], notices: [notice('9', 'ACTIVITY', window)] } } }));
    const old = { startAt: '2026-10-01T15:00:00.000Z', endAt: '2026-10-01T16:00:00.000Z' };
    const read = readMaintenanceWindows();
    assert.deepEqual(read.en, [{ ...old, url: 'https://x.test/4.html' }, { ...window, url: 'https://x.test/1.html' }], 'one per window');
    assert.deepEqual(read.jp, [{ ...window, url: 'https://x.test/9.html' }], 'JP lists its maintenance under ACTIVITY');
    assert.deepEqual(read.kr, []);
    assert.deepEqual(currentRegionalMaintenance(read, Date.parse('2026-10-20T00:00:00Z')).en, [{ ...window, url: 'https://x.test/1.html' }], 'the page keeps the ones not over');
  } finally {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
