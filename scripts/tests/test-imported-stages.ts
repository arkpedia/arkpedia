import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { KEPT_HERE, importedStages, recordStageHolds } from '../content/run-stage.mjs';

/* Compiling arkpedia-data's imports branch, a step its importer already ran is not run again here,
   and its holds are kept: both read from the importer's own step lists (run-stage.mjs). */

const SCRIPT = path.resolve('scripts/content/run-stage.mjs');
function importer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-importer-'));
  fs.mkdirSync(path.join(dir, 'scripts/content'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts/sync'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts/content/run-imports.sh'), 'stage pin-upstream -- node x\n  stage catalogue -- node y\n');
  fs.writeFileSync(path.join(dir, 'scripts/sync/refresh-stage-data.sh'), 'stage recruitment -- node z\nstage completeness --invariant -- node c\n# stage commented-out -- no\n');
  return dir;
}

test("the importer's steps are read from its own lists, less those that always run here", () => {
  const dir = importer();
  assert.deepEqual([...importedStages(dir)].sort(), ['catalogue', 'recruitment']);
  for (const name of ['pin-upstream', 'upstream-cn', 'upstream-en', 'completeness']) assert.ok(KEPT_HERE.has(name), name);
  assert.equal(importedStages(''), null, 'unset: nothing is imported, every step runs');
  assert.throws(() => importedStages(path.join(dir, 'nowhere')), /has no scripts\/content\/run-imports\.sh/);
});

test('a step the importer ran is not run again, and one it did not still is', () => {
  const dir = importer();
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-app-'));
  const run = (name: string, env: Record<string, string>) => spawnSync(process.execPath, [SCRIPT, 'run', name, '--', process.execPath, '-e', "require('fs').writeFileSync('ran-'+process.argv[1], '')", name],
    { cwd: app, encoding: 'utf8', env: { ...process.env, ...env } });
  const moved = run('catalogue', { ARKPEDIA_IMPORTED_FROM: dir });
  assert.equal(moved.status, 0, moved.stderr);
  assert.match(moved.stdout, /catalogue: run by arkpedia-data's importer/);
  assert.equal(fs.existsSync(path.join(app, 'ran-catalogue')), false, 'its command never ran');
  fs.mkdirSync(path.join(app, 'data'), { recursive: true });
  spawnSync(process.execPath, [SCRIPT, 'begin'], { cwd: app });
  const kept = run('pulls', { ARKPEDIA_IMPORTED_FROM: dir });
  assert.equal(kept.status, 0, kept.stderr);
  assert.ok(fs.existsSync(path.join(app, 'ran-pulls')), 'a step the importer does not run still runs');
  const off = run('catalogue', { ARKPEDIA_IMPORTED_FROM: '' });
  assert.equal(off.status, 0, off.stderr);
  assert.ok(fs.existsSync(path.join(app, 'ran-catalogue')), 'with the switch off, every step runs');
});

test("a hold the importer's quarantine file brought is kept; one for a step neither repository declares is dropped", () => {
  const dir = importer();
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-app-'));
  fs.mkdirSync(path.join(app, 'data'), { recursive: true });
  fs.mkdirSync(path.join(app, '.github/workflows'), { recursive: true });
  fs.mkdirSync(path.join(app, 'scripts/sync'), { recursive: true });
  fs.writeFileSync(path.join(app, '.github/workflows/prepare-content.yml'), '          stage pulls -- npm run pulls:refresh\n');
  fs.writeFileSync(path.join(app, 'scripts/sync/refresh-stage-data.sh'), 'stage story-covers -- node s\n');
  const hold = (name: string) => ({ stage: 'refresh', key: `stage:${name}`, action: 'kept-previous', reason: 'failed', firstSeen: '2026-10-29T00:00:00.000Z' });
  fs.writeFileSync(path.join(app, 'data/quarantine.json'), JSON.stringify({ version: 1, entries: [hold('catalogue'), hold('retired')] }));
  const before = process.env.ARKPEDIA_IMPORTED_FROM;
  process.env.ARKPEDIA_IMPORTED_FROM = dir;
  try { recordStageHolds(app, [{ stage: 'pulls', status: 'ok' }], new Date('2026-10-30T00:00:00Z')); }
  finally { if (before === undefined) delete process.env.ARKPEDIA_IMPORTED_FROM; else process.env.ARKPEDIA_IMPORTED_FROM = before; }
  const keys = JSON.parse(fs.readFileSync(path.join(app, 'data/quarantine.json'), 'utf8')).entries.filter((entry: any) => entry.stage === 'refresh').map((entry: any) => entry.key);
  assert.deepEqual(keys, ['stage:catalogue']);
});

test('a refresh compiles the imports branch merged with main, and names the importer every time', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  assert.doesNotMatch(workflow, /ARKPEDIA_IMPORTS_IN_DATA/, 'no switch back to the in-app import');
  assert.match(workflow, /DATA_REF: \$\{\{ inputs\.data_ref \|\| \(\(github\.event_name == 'schedule' \|\| inputs\.refresh_upstream\) && 'imports'\) \|\| 'main' \}\}/);
  assert.match(workflow, /ARKPEDIA_IMPORTED_FROM: \$\{\{ format\('\{0\}\/arkpedia-data\/importer', runner\.temp\) \}\}/);
  assert.match(workflow, /key: prepared-content-v1-\$\{\{ steps\.upstream\.outputs\.fingerprint \}\}\$\{\{ steps\.imports\.outputs\.head/, 'new imports are never taken for a prepared input set');
});
