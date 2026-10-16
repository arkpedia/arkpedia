import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

/*
 * The release run replaces the app checkout's data/ with arkpedia-data's source/ and
 * deletes what source/ lacks, so a deleted record cannot reappear. A table the app has
 * just moved out of its browser code (lib/content/tables.mjs) is not in source/ until
 * the first release publishes it, and deleting it would fail that export. Run in a made-up
 * app and data repository, never the worktree: the script deletes data/ files.
 */
const SCRIPT = path.resolve('scripts/content/hydrate-source.mjs');
const REQUIRED = ['data/headhunting_banners.json', 'data/skins.json', 'data/assets/revisions.json', 'public/stages-index.json'];
const LEDGER = 'data/seeded-source-files.json';
const ledger = (...files: string[]) => `${JSON.stringify({ version: 1, files }, null, 2)}\n`;

function hydrate(sourceFiles: Record<string, string>, appFiles: Record<string, string>, { fails = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-hydrate-'));
  const write = (base: string, file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
    fs.writeFileSync(path.join(base, file), text);
  };
  try {
    const app = path.join(root, 'app'), data = path.join(root, 'arkpedia-data');
    // The snapshot guard wants a thousand records; these stand in for the catalogue.
    for (let i = 0; i < 1000; i++) write(path.join(data, 'source'), `data/records/record-${i}.json`, '{}');
    for (const file of REQUIRED) write(path.join(data, 'source'), file, '{}');
    for (const [file, text] of Object.entries(sourceFiles)) write(path.join(data, 'source'), file, text);
    for (const [file, text] of Object.entries(appFiles)) write(app, file, text);
    const run = spawnSync(process.execPath, [SCRIPT, data], { cwd: app, encoding: 'utf8' });
    if (fails) return { read: () => null, stderr: run.stderr, status: run.status };
    assert.equal(run.status, 0, run.stderr);
    const kept = new Map([...Object.keys(appFiles), LEDGER].filter(file => fs.existsSync(path.join(app, file)))
      .map(file => [file, fs.readFileSync(path.join(app, file), 'utf8')]));
    return { read: (file: string) => kept.get(file) ?? null, stderr: run.stderr, status: run.status };
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 });
  }
}

test('a table the app introduced survives hydration until arkpedia-data carries it, and then the data repository wins', () => {
  const before = hydrate({}, { 'data/farming-tiers.json': '["app"]', 'data/retired.json': '{}' });
  assert.equal(before.read('data/farming-tiers.json'), '["app"]');
  assert.match(before.stderr, /arkpedia-data does not carry data\/farming-tiers\.json yet/);
  // Every other record the data repository lacks is still deleted.
  assert.equal(before.read('data/retired.json'), null);
  const after = hydrate({ 'data/farming-tiers.json': '["data repository"]' }, { 'data/farming-tiers.json': '["app"]' });
  assert.equal(after.read('data/farming-tiers.json'), '["data repository"]');
  assert.doesNotMatch(after.stderr, /does not carry/);
});

/* A hand-kept record the refresh itself reads must be seeded, or the first release after
   it lands deletes the app's copy and fails at the stage that reads it: data/game-modes.json
   is read by build-mode-exclusions.mjs and by the stage pages. */
test('the hand-kept game-modes record survives hydration until arkpedia-data carries it', () => {
  const kept = hydrate({}, { 'data/game-modes.json': '{"version":1}' });
  assert.equal(kept.read('data/game-modes.json'), '{"version":1}');
  assert.match(kept.stderr, /does not carry [^\n]*data\/game-modes\.json/);
});

/* /skins and every operator page import data/dynamic-art.json (scripts/sync/sync-dynamic-art.mjs):
   the first release after it lands must not delete the app's copy before the data repository
   has one, nor a run whose stage failed. */
test('the animated-art pointers survive hydration until arkpedia-data carries them', () => {
  const kept = hydrate({}, { 'data/dynamic-art.json': '{"schemaVersion":1}' });
  assert.equal(kept.read('data/dynamic-art.json'), '{"schemaVersion":1}');
  assert.match(kept.stderr, /does not carry [^\n]*data\/dynamic-art\.json/);
});

test('the complete story library and sections survive the first hydration, then follow the published source', () => {
  const app = { 'data/story-library.json': '{"entries":["app"]}', 'data/story-chapters.json': '{"chapters":{"app":[]}}' };
  const first = hydrate({}, app);
  for (const [file, text] of Object.entries(app)) assert.equal(first.read(file), text);
  const published = { 'data/story-library.json': '{"entries":["published"]}', 'data/story-chapters.json': '{"chapters":{"published":[]}}' };
  const later = hydrate(published, app);
  for (const [file, text] of Object.entries(published)) assert.equal(later.read(file), text);
});

test('a canvas-only source retains listed off-canvas chapters, while a complete source can remove them', () => {
  const library = JSON.stringify({ entries: [{ id: 'main', category: 'main' }, { id: 'record', category: 'record' }] });
  const app = { 'data/story-library.json': library, 'data/story-chapters.json': JSON.stringify({ chapters: { main: [[0]], record: [[1]], removed: [[2]] } }) };
  const source = { 'data/story-library.json': library, 'data/story-chapters.json': JSON.stringify({ chapters: { main: [[9]] } }) };
  const legacy = hydrate(source, app);
  assert.deepEqual(JSON.parse(legacy.read('data/story-chapters.json')!).chapters, { record: [[1]], main: [[9]] });
  assert.match(legacy.stderr, /retained 1 library groups/);
  const complete = hydrate({ ...source, 'data/story-chapters.json': JSON.stringify({ completeLibrary: true, chapters: { main: [[9]] } }) }, app);
  assert.deepEqual(JSON.parse(complete.read('data/story-chapters.json')!).chapters, { main: [[9]] });
});

/* SEEDED_SOURCE_FILES had no end: whenever arkpedia-data lacked one of the tables, the app's
   copy was kept and published again, so a table the data repository deleted on purpose came
   back from the app's stale copy with the next release. The ledger, carried in the data
   repository, remembers every seeded table it has had. */
test('a seeded table the data repository has carried is never brought back once it deletes it', () => {
  // The first release seeds it and records that; so does a run that finds it there.
  const seeded = hydrate({}, { 'data/farming-tiers.json': '["app"]' });
  assert.equal(seeded.read(LEDGER), ledger('data/farming-tiers.json'));
  const carried = hydrate({ 'data/farming-tiers.json': '["data repository"]' }, { 'data/farming-tiers.json': '["app"]' });
  assert.equal(carried.read(LEDGER), ledger('data/farming-tiers.json'));
  // Deleted there on purpose later: gone here too, and said so.
  const deleted = hydrate({ [LEDGER]: ledger('data/farming-tiers.json') }, { 'data/farming-tiers.json': '["app, stale"]' });
  assert.equal(deleted.read('data/farming-tiers.json'), null);
  assert.match(deleted.stderr, /arkpedia-data has carried data\/farming-tiers\.json and no longer does, so the app's copy is not seeded again/);
  assert.doesNotMatch(deleted.stderr, /does not carry/);
  // The other tables it has never had are still seeded.
  const others = hydrate({ [LEDGER]: ledger('data/farming-tiers.json') }, { 'data/farming-tiers.json': '[]', 'data/base-skill-slots.json': '{"app":1}' });
  assert.equal(others.read('data/base-skill-slots.json'), '{"app":1}');
  assert.equal(others.read('data/farming-tiers.json'), null);
  assert.equal(others.read(LEDGER), ledger('data/base-skill-slots.json', 'data/farming-tiers.json'));
});

test('the seed ledger changes only when a table first reaches the data repository, so a quiet day publishes nothing new', () => {
  const all = ['data/base-group-rosters.json', 'data/base-skill-slots.json', 'data/farming-tiers.json'];
  const tables = Object.fromEntries(all.map(file => [file, '{}']));
  // The data branch that carries the three tables, before any release wrote the ledger.
  const first = hydrate(tables, tables);
  assert.equal(first.read(LEDGER), ledger(...all));
  // Every later day: the ledger comes back byte for byte.
  const later = hydrate({ ...tables, [LEDGER]: ledger(...all) }, tables);
  assert.equal(later.read(LEDGER), ledger(...all));
  assert.doesNotMatch(later.stderr, /does not carry|no longer does/);
  // A malformed ledger stops the run rather than being guessed at.
  const malformed = hydrate({ [LEDGER]: '{"files":"data/farming-tiers.json"}' }, { 'data/farming-tiers.json': '[]' }, { fails: true });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /seeded-source-files\.json is not \{"version":1,"files":\[\.\.\.\]\}/);
});

/* data/stages.json (a wiki.gg scrape), data/stage_index.json and the data/events-data/
   folder were read by nothing and still published in every release. Retired by path and,
   for the folder, by prefix: an old release still carrying them never hydrates them back,
   and the next publication drops them from arkpedia-data's source/. */
test('retired records and folders are never hydrated back from an old release', () => {
  const run = hydrate({
    'data/stages.json': '[]',
    'data/stage_index.json': '[]',
    'data/events-data/Act or Die.json': '{}',
    'data/events-data-keep.json': '{}',
  }, { 'data/stages.json': '[]', 'data/events-data/Act or Die.json': '{}', 'data/events-data-keep.json': '{}' });
  assert.equal(run.read('data/stages.json'), null);
  assert.equal(run.read('data/events-data/Act or Die.json'), null);
  // A prefix is a folder: a record whose name only starts the same way is a record.
  assert.equal(run.read('data/events-data-keep.json'), '{}');
});
