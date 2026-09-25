import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { exportClockVerdict, guardExportClock, KNOWN_EXPORT_CLOCK_READS } from '../content/export-clock.mjs';
import { CLOCK_FIELDS, findClockFields } from '../content/clock-fields.mjs';
import { withContentPage } from '../../lib/content/server.ts';

// A page module and a dependency, written to disk so their stack frames carry real
// paths the way the export bundle's do.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-clock-'));
fs.writeFileSync(path.join(dir, 'page.cjs'), `
exports.now = () => Date.now();
exports.construct = () => new Date();
exports.call = () => Date();
exports.defaulted = (now = Date.now()) => now;
exports.swallowed = () => { try { return Date.now(); } catch { return 0; } };
exports.fixed = () => new Date('2026-09-24T12:00:00Z');
exports.parsed = () => Date.parse('2026-09-24T12:00:00Z') + Date.UTC(1970, 0, 2);
`);
fs.mkdirSync(path.join(dir, 'node_modules'));
fs.writeFileSync(path.join(dir, 'node_modules', 'dependency.cjs'), 'exports.now = () => Date.now();');
const load = createRequire(import.meta.url);
const page = load(path.join(dir, 'page.cjs'));
const dependency = load(path.join(dir, 'node_modules', 'dependency.cjs'));
const isPageFrame = frame => frame.includes(dir) && !frame.includes(`${path.sep}node_modules${path.sep}`);

test('page code cannot read the clock during content export, even when it catches the refusal', () => {
  const RealDate = Date;
  const clock = guardExportClock(isPageFrame);
  try {
    for (const read of [page.now, page.construct, page.call, page.defaulted]) assert.throws(read, /Content export read the clock/);
    assert.equal(page.swallowed(), 0);
    assert.equal(clock.reads.length, 5, 'a caught refusal is still recorded');
    assert.ok(clock.reads.every(frame => frame.includes('page.cjs')));
    // Dates built from data are not clock reads, and still behave as dates.
    const fixed = page.fixed();
    assert.ok(fixed instanceof RealDate && fixed instanceof Date);
    assert.equal(fixed.toISOString(), '2026-09-24T12:00:00.000Z');
    assert.equal(page.parsed(), Date.parse('2026-09-24T12:00:00Z') + 86_400_000);
    // Node and dependencies keep their own timing.
    assert.ok(Number.isFinite(dependency.now()));
    assert.equal(clock.reads.length, 5);
  } finally { clock.restore(); }
  assert.equal(Date, RealDate);
  assert.ok(Number.isFinite(page.now()));
});

test('a route with a known export clock read is recorded, not refused', () => {
  const clock = guardExportClock(isPageFrame, { refuse: false });
  try { assert.ok(Number.isFinite(page.now())); } finally { clock.restore(); }
  assert.equal(clock.reads.length, 1);
});

test('the export verdict fails a new clock read and a stale exception, and passes the rest', () => {
  assert.equal(exportClockVerdict('/farming', []), null);
  assert.match(exportClockVerdict('/farming', ['at getFarmingWindows (lib/schedule/materialCountdown.ts:48:14)']) ?? '', /\/farming read the clock 1 time\(s\).*\n.*materialCountdown\.ts:48/);
  const [known] = Object.keys(KNOWN_EXPORT_CLOCK_READS);
  assert.equal(exportClockVerdict(known, ['at somewhere']), null);
  assert.match(exportClockVerdict(known, []) ?? '', /no longer reads the clock.*remove it/);
});

test('release page data may not carry values the export decided from its clock', () => {
  // As the 2026-09-24 release had them.
  const frozen = {
    eventRows: [{ name: 'People, A People', isOngoing: true, pullBannerName: 'Standard Pool #176' }],
    pullBannerLinks: { 'standard pool #176': 'Standard Pool #176' },
    countdowns: { Grindstone: { status: 'countdown', text: '34 days', stageCode: 'MT-9' } },
    eventStoreCountdown: { status: 'now', text: 'NOW' },
    limitedBannerInfo: { Ling: { type: 'Festival', lastBannerDate: '2025/07/17', nextScheduledDate: null } },
    asOf: '2026-09-24',
    now: 1790000000000,
  };
  assert.deepEqual(findClockFields(frozen).sort(), [
    'props.asOf', 'props.countdowns', 'props.eventRows[0].isOngoing', 'props.eventRows[0].pullBannerName', 'props.eventStoreCountdown',
    'props.limitedBannerInfo.Ling.lastBannerDate', 'props.limitedBannerInfo.Ling.nextScheduledDate', 'props.now', 'props.pullBannerLinks',
  ]);
  // Raw windows and source records (an operator's own isFuture flag) are fine.
  const raw = {
    eventRows: [{ name: 'People, A People', start: 1789570800000, end: 1790766000000, pullBanner: { name: 'Standard Pool #176', end: 1790812799000 } }],
    windows: { materials: { Grindstone: [{ start: 1792000000000, end: 1793000000000, stageCode: 'MT-9' }] }, eventStore: [] },
    limitedBannerInfo: { Ling: { type: 'Festival', appearances: ['2025/07/17'] } },
    operators: [{ name: 'Ling', isFuture: false, release: { releasedAt: 1680000000000 } }],
  };
  assert.deepEqual(findClockFields(raw), []);
  assert.ok(CLOCK_FIELDS.has('isOngoing') && !CLOCK_FIELDS.has('isFuture'));
});

test('release validation applies the clock-field check to every page', () => {
  const source = fs.readFileSync(new URL('../content/validate-release.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ findClockFields \} from '\.\/clock-fields\.mjs'/);
  assert.match(source, /if \(file\.path\.startsWith\('pages\/'\)\) \{[\s\S]*?findClockFields\(json\.props\)[\s\S]*?check\(!frozen\.length/);
});

test('withContentPage itself never reads the clock while exporting', async () => {
  const saved = { disabled: process.env.ARKPEDIA_CONTENT_DISABLED, exporting: process.env.ARKPEDIA_EXPORT_CONTENT };
  process.env.ARKPEDIA_CONTENT_DISABLED = '1';
  process.env.ARKPEDIA_EXPORT_CONTENT = '1';
  const clock = guardExportClock(frame => frame.includes(`${path.sep}lib${path.sep}content${path.sep}`));
  try {
    const result = await withContentPage('/schedule', async () => ({ props: { value: 'record' } }))({ revalidateReason: 'build' });
    assert.deepEqual(await result.props, { value: 'record' });
  } finally {
    clock.restore();
    if (saved.disabled === undefined) delete process.env.ARKPEDIA_CONTENT_DISABLED; else process.env.ARKPEDIA_CONTENT_DISABLED = saved.disabled;
    if (saved.exporting === undefined) delete process.env.ARKPEDIA_EXPORT_CONTENT; else process.env.ARKPEDIA_EXPORT_CONTENT = saved.exporting;
  }
  assert.deepEqual(clock.reads, []);
});
