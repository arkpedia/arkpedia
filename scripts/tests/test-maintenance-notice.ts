import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { currentMaintenance, maintenanceText } from '../../lib/home/maintenance';
import { readMaintenanceWindows } from '../../lib/home/maintenanceServer';
import MaintenanceNotice from '../../components/home/MaintenanceNotice';

// tsx compiles the component's JSX to React.createElement (tsconfig keeps JSX for Next).
(globalThis as { React?: typeof React }).React = React;

const url = 'https://ark-us-static-online.yo-star.com/announce/Android/announcement/1640.html';
const window = { startAt: '2026-10-21T15:00:00.000Z', endAt: '2026-10-21T16:00:00.000Z', url };

test('a maintenance window reads in Global server time while it is to come or under way, and not after', () => {
  assert.equal(maintenanceText(window, Date.parse('2026-10-20T00:00:00Z')), 'Global server maintenance Oct 21, 08:00–09:00 (UTC−7)');
  assert.equal(maintenanceText(window, Date.parse('2026-10-21T15:30:00Z')), 'Global server maintenance under way until 09:00 (UTC−7)');
  const overnight = { ...window, startAt: '2026-10-22T06:00:00.000Z', endAt: '2026-10-22T09:00:00.000Z' };
  assert.equal(maintenanceText(overnight, Date.parse('2026-10-20T00:00:00Z')), 'Global server maintenance Oct 21, 23:00–Oct 22, 02:00 (UTC−7)');
  assert.deepEqual(currentMaintenance([overnight, window], Date.parse('2026-10-20T00:00:00Z')), [window, overnight]);
  assert.deepEqual(currentMaintenance([window], Date.parse('2026-10-21T16:00:00Z')), []);
});

test('the home notice renders from the props and the clock, and nothing once the window is over', () => {
  const html = renderToStaticMarkup(createElement(MaintenanceNotice, { windows: [window], now: Date.parse('2026-10-20T00:00:00Z') }));
  assert.match(html, /class="maintenance-notice"/);
  assert.match(html, /Global server maintenance Oct 21, 08:00–09:00 \(UTC−7\)/);
  assert.match(html, new RegExp(`href="${url}"`));
  assert.equal(renderToStaticMarkup(createElement(MaintenanceNotice, { windows: [window], now: Date.parse('2026-10-22T00:00:00Z') })), '');
});

test('the home page reads only EN SYSTEM notices with a window, and none without the content run\'s file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-maintenance-'));
  const cwd = process.cwd();
  try {
    process.chdir(root);
    assert.deepEqual(readMaintenanceWindows(), []);
    fs.mkdirSync('data');
    const notice = (id: string, group: string, maintenance: unknown) => ({ id, group, title: 't', url: `https://x.test/${id}.html`, firstSeen: '2026-10-18', ...(maintenance === undefined ? {} : { maintenance }) });
    fs.writeFileSync('data/official-bulletins.json', JSON.stringify({ version: 1, regions: {
      en: { bulletins: [], notices: [notice('1', 'SYSTEM', window), notice('2', 'SYSTEM', null), notice('3', 'ACTIVITY', window), notice('4', 'SYSTEM', { startAt: '2026-10-01T15:00:00.000Z', endAt: '2026-10-01T16:00:00.000Z' }), notice('5', 'SYSTEM', window)] },
      jp: { bulletins: [], notices: [notice('9', 'SYSTEM', window)] } } }));
    const old = { startAt: '2026-10-01T15:00:00.000Z', endAt: '2026-10-01T16:00:00.000Z' };
    assert.deepEqual(readMaintenanceWindows(), [{ ...old, url: 'https://x.test/4.html' }, { ...window, url: 'https://x.test/1.html' }], 'one per window, EN SYSTEM only');
    assert.deepEqual(currentMaintenance(readMaintenanceWindows(), Date.parse('2026-10-20T00:00:00Z')), [{ ...window, url: 'https://x.test/1.html' }], 'the page keeps the ones not over');
  } finally {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
