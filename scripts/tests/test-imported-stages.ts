import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { KEPT_HERE, importedStages } from '../content/run-stage.mjs';

/* Data split phase 2: compiling arkpedia-data's imports branch, a step its importer already ran is
   not run again here, read from the importer's own step lists (run-stage.mjs importedStages). */

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

test('the nightly compiles the imports branch only under ARKPEDIA_IMPORTS_IN_DATA, and says which steps it skips', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  assert.match(workflow, /DATA_REF: \$\{\{ inputs\.data_ref \|\| \(github\.event_name == 'schedule' && vars\.ARKPEDIA_IMPORTS_IN_DATA == '1' && 'imports'\) \|\| 'main' \}\}/);
  assert.match(workflow, /ARKPEDIA_IMPORTED_FROM: \$\{\{ \(inputs\.data_ref == 'imports' \|\| \(github\.event_name == 'schedule' && vars\.ARKPEDIA_IMPORTS_IN_DATA == '1'\)\) && format\('\{0\}\/arkpedia-data\/importer', runner\.temp\)/);
  assert.match(workflow, /key: prepared-content-v1-\$\{\{ steps\.upstream\.outputs\.fingerprint \}\}\$\{\{ steps\.imports\.outputs\.head/, 'new imports are never taken for a prepared input set');
});
