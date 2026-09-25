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

function hydrate(sourceFiles: Record<string, string>, appFiles: Record<string, string>) {
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
    assert.equal(run.status, 0, run.stderr);
    const kept = new Map(Object.keys(appFiles).filter(file => fs.existsSync(path.join(app, file)))
      .map(file => [file, fs.readFileSync(path.join(app, file), 'utf8')]));
    return { read: (file: string) => kept.get(file) ?? null, stderr: run.stderr };
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
