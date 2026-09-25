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
