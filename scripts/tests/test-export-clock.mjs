import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { buildClockVerdict, exportClockVerdict, guardExportClock, KNOWN_BUILD_CLOCK_READS, KNOWN_EXPORT_CLOCK_READS } from '../content/export-clock.mjs';
import { BUILD_OUTPUTS, CLOCK_FIELDS, findClockFields, findPublicClockFields } from '../content/clock-fields.mjs';
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
  // Every route that used to decide release state at export now exports markers and decides per
  // request (the /planner picker) or no longer carries the value at all (the operator page's
  // related cards), so no route is an exception any more, and a read on any route fails.
  assert.deepEqual(Object.keys(KNOWN_EXPORT_CLOCK_READS), []);
  assert.match(exportClockVerdict('/planner', ['at getStaticProps (pages/planner.tsx:1)']) ?? '', /\/planner read the clock 1 time/);
  assert.match(exportClockVerdict('/operators/[name]', ['at getStaticProps (pages/operators/[name].tsx:1)']) ?? '', /read the clock 1 time/);
});

test('release page data may not carry values the export decided from its clock', () => {
  // As the 2026-09-24 release had them, page by page.
  const frozen = {
    '/schedule': {
      eventRows: [{ name: 'People, A People', isOngoing: true, pullBannerName: 'Standard Pool #176' }],
      pullBannerLinks: { 'standard pool #176': 'Standard Pool #176' },
    },
    '/farming': {
      countdowns: { Grindstone: { status: 'countdown', text: '34 days', stageCode: 'MT-9' } },
      eventStoreCountdown: { status: 'now', text: 'NOW' },
    },
    '/obtain-method': { limitedBannerInfo: { Ling: { type: 'Festival', lastBannerDate: '2025/07/17', nextScheduledDate: null } } },
    '/games/music-guesser': { asOf: '2026-09-24' },
    '/stages/supplies': { now: 1790000000000, buildDay: 'Thursday' },
  };
  assert.deepEqual(Object.fromEntries(Object.entries(frozen).map(([route, props]) => [route, findClockFields(props, route).sort()])), {
    '/schedule': ['props.eventRows[0].isOngoing', 'props.eventRows[0].pullBannerName', 'props.pullBannerLinks'],
    '/farming': ['props.countdowns', 'props.eventStoreCountdown'],
    '/obtain-method': ['props.limitedBannerInfo.Ling.lastBannerDate', 'props.limitedBannerInfo.Ling.nextScheduledDate'],
    '/games/music-guesser': ['props.asOf'],
    '/stages/supplies': ['props.buildDay', 'props.now'],
  });
  // The route is required: without it the derived paths would silently go unchecked.
  assert.throws(() => findClockFields({ now: 1 }), /needs the page's route/);
  // Raw windows and source records (an operator's own isFuture flag) are fine.
  const raw = {
    eventRows: [{ name: 'People, A People', start: 1789570800000, end: 1790766000000, pullBanner: { name: 'Standard Pool #176', end: 1790812799000 } }],
    windows: { materials: { Grindstone: [{ start: 1792000000000, end: 1793000000000, stageCode: 'MT-9' }] }, eventStore: [] },
    limitedBannerInfo: { Ling: { type: 'Festival', appearances: ['2025/07/17'] } },
    operators: [{ name: 'Ling', isFuture: false, release: { releasedAt: 1680000000000 } }],
  };
  for (const route of ['/schedule', '/obtain-method', '/farming']) assert.deepEqual(findClockFields(raw, route), []);
  assert.ok(CLOCK_FIELDS.has('isOngoing') && !CLOCK_FIELDS.has('isFuture'));
});

/* The check used to match any key named like a clock field at any depth, records included:
   an arkpedia-data event that gained 'isOngoing', or a table row with 'now', would have
   failed validate-release and blocked the daily release over a data field. */
test('a record\'s own field named like a clock field never blocks a release', () => {
  const props = {
    // Records copied from arkpedia-data into props, and the release's tables.
    events: [{ name: 'People, A People', isOngoing: true, now: 'a data field', asOf: '2026-09-01' }],
    eventRows: [{ name: 'People, A People', start: 1, end: 2, source: { isOngoing: true, countdowns: {} } }],
    __contentTables: { headhunting_banners: [{ name: 'Standard Pool #176', now: true, lastBannerDate: '2026/09/25' }], event_colors: { now: '#fff' } },
    windows: { materials: { Grindstone: [{ start: 1, end: 2, nextScheduledDate: '2026/10/01' }] } },
    limitedBannerInfo: { Ling: { type: 'Festival', appearances: [{ lastBannerDate: 'a record field one level down' }] } },
  };
  for (const route of ['/schedule', '/obtain-method', '/farming', '/events/People%2C%20A%20People']) assert.deepEqual(findClockFields(props, route), [], route);
  // Public records (stage and enemy details, lyrics) are not searched by name at all.
  for (const file of ['enemy-detail/originium-slug.json', 'stage-detail/1-7.json', 'stages-index.json', 'planner-data/Ling.json']) {
    assert.deepEqual(findPublicClockFields({ now: 1, asOf: 2, isOngoing: true }, file), [], file);
  }
});

test('public JSON a build script writes as its own object may not carry clock fields either', () => {
  assert.deepEqual(findPublicClockFields({ catalogueUrl: '/stage-guesser/catalogue.json', groups: [], asOf: '2026-09-24' }, 'stage-guesser/manifest.json'), ['stage-guesser/manifest.json.asOf']);
  assert.deepEqual(findPublicClockFields({ operators: [], now: 1790000000000 }, 'operator-search.json'), ['operator-search.json.now']);
  // Its rows are records the script projects: an operator's isFuture is not a clock field name.
  assert.deepEqual(findPublicClockFields({ operators: [{ name: 'Ling', isFuture: false }] }, 'operator-search.json'), []);
  assert.deepEqual(findPublicClockFields({ entries: [], answers: [] }, 'stage-guesser/catalogue.json'), []);
  for (const file of BUILD_OUTPUTS) assert.ok(fs.readFileSync('scripts/content/export.mjs', 'utf8').includes(file.split('/')[0].replace('.json', '')), `${file} is one the export publishes`);
});

test('release validation applies the clock-field check to every page and every build output', () => {
  const source = fs.readFileSync(new URL('../content/validate-release.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ findClockFields, findPublicClockFields \} from '\.\/clock-fields\.mjs'/);
  assert.match(source, /if \(file\.path\.startsWith\('pages\/'\)\) \{[\s\S]*?findClockFields\(json\.props, routeOf\.get\(file\.path\)\)[\s\S]*?check\(!frozen\.length[\s\S]*?\} else \{[\s\S]*?findPublicClockFields\(json, publicNameOf\.get\(file\.path\)\)[\s\S]*?check\(!frozen\.length/);
  assert.match(source, /const routeOf = new Map\(Object\.entries\(m\.pages\)\.map\(\(\[route, file\]\) => \[file\.path, route\]\)\)/);
});

/* build-operator-search.ts and build-stage-guesser.ts read the clock outside the export
   worker, and their public JSON is published beside the pages: nothing stopped a new build
   script, or a new clock read in another one, from freezing that moment into the release. */
const BUILD_RUNNER = path.resolve('scripts/content/export-build.mjs');
const TSX = path.resolve('node_modules/tsx/dist/cli.mjs');
function runBuild(files, script) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'export-build-'));
  try {
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), text);
    }
    return spawnSync(process.execPath, [TSX, BUILD_RUNNER, script], { cwd, encoding: 'utf8' });
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

test('the build scripts the export runs are held to the export clock guard', () => {
  const clean = runBuild({ 'scripts/build/build-clean.mjs': "console.log('built', new Date('2026-09-24T00:00:00Z').toISOString());\n" }, 'scripts/build/build-clean.mjs');
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /built 2026-09-24T00:00:00\.000Z/);
  const reads = runBuild({ 'scripts/build/build-new.ts': "const stamp: number = Date.now();\nconsole.log(stamp);\n" }, 'scripts/build/build-new.ts');
  assert.notEqual(reads.status, 0);
  assert.match(reads.stderr, /Content export read the clock .*build-new\.ts/);
  // A listed script that stops reading the clock has to leave the list.
  const [known] = Object.keys(KNOWN_BUILD_CLOCK_READS);
  const stale = runBuild({ [known]: "console.log('no clock');\n" }, known);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /no longer reads the clock at export: remove it from KNOWN_BUILD_CLOCK_READS/);
  assert.equal(buildClockVerdict(known, ['at somewhere']), null);
  assert.match(buildClockVerdict('scripts/build/build-x.ts', ['at a (lib/x.ts:1:1)']) ?? '', /read the clock 1 time\(s\).*public data/);
});

test('export.mjs runs every build script through the guarded runner', () => {
  const source = fs.readFileSync('scripts/content/export.mjs', 'utf8');
  const scripts = [...source.matchAll(/'(scripts\/build\/[\w.-]+)'/g)].map(match => match[1]);
  assert.ok(scripts.length >= 5, 'not vacuous: the build list was found');
  assert.match(source, /execFileSync\('node', \['node_modules\/tsx\/dist\/cli\.mjs', 'scripts\/content\/export-build\.mjs', \.\.\.script\]/);
  // No build script started any other way.
  assert.doesNotMatch(source, /\['node', \['(?:node_modules\/tsx\/dist\/cli\.mjs', ')?scripts\/build\//);
  for (const known of Object.keys(KNOWN_BUILD_CLOCK_READS)) assert.ok(scripts.includes(known), `${known} is a script the export runs`);
});

test('withContentPage itself never reads the clock while exporting', async () => {
  const saved = { disabled: process.env.ARKPEDIA_CONTENT_DISABLED, exporting: process.env.ARKPEDIA_EXPORT_CONTENT };
  process.env.ARKPEDIA_CONTENT_DISABLED = '1';
  process.env.ARKPEDIA_EXPORT_CONTENT = '1';
  const clock = guardExportClock(frame => frame.includes(`${path.sep}lib${path.sep}content${path.sep}`));
  try {
    // /schedule declares tables (lib/content/tables.mjs), so the export also attaches them here.
    const tables = { event_colors: async () => ({ event: '#fff' }), event_materials: async () => ({}), headhunting_banners: async () => [] };
    const result = await withContentPage('/schedule', async () => ({ props: { value: 'record' } }), { tables })({ revalidateReason: 'build' });
    const projected = await result.props;
    delete projected.__contentTables['regional-schedules'];
    assert.deepEqual(projected, { value: 'record', __contentTables: { event_colors: { event: '#fff' }, event_materials: {}, headhunting_banners: [] } });
  } finally {
    clock.restore();
    if (saved.disabled === undefined) delete process.env.ARKPEDIA_CONTENT_DISABLED; else process.env.ARKPEDIA_CONTENT_DISABLED = saved.disabled;
    if (saved.exporting === undefined) delete process.env.ARKPEDIA_EXPORT_CONTENT; else process.env.ARKPEDIA_EXPORT_CONTENT = saved.exporting;
  }
  assert.deepEqual(clock.reads, []);
});
