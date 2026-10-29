import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

/*
 * Every run that needs records -- the release job, Check, local dev (scripts/content/pull-data.mjs)
 * -- replaces the checkout's data/ with arkpedia-data's source/ and deletes what source/ lacks,
 * so a deleted record cannot reappear. The app keeps no records of its own: a new one goes into
 * arkpedia-data first. Run in a made-up app and data repository, never the worktree: the script
 * deletes data/ files.
 */
const SCRIPT = path.resolve('scripts/content/hydrate-source.mjs');
const REQUIRED = ['data/headhunting_banners.json', 'data/skins.json', 'data/assets/revisions.json', 'public/stages-index.json'];

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
    fs.mkdirSync(app, { recursive: true });
    const run = spawnSync(process.execPath, [SCRIPT, data], { cwd: app, encoding: 'utf8' });
    if (fails) return { read: () => null, stderr: run.stderr, status: run.status };
    assert.equal(run.status, 0, run.stderr);
    const kept = new Map([...Object.keys(appFiles), ...Object.keys(sourceFiles)].filter(file => fs.existsSync(path.join(app, file)))
      .map(file => [file, fs.readFileSync(path.join(app, file), 'utf8')]));
    return { read: (file: string) => kept.get(file) ?? null, stderr: run.stderr, status: run.status };
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 });
  }
}

/* The app once kept records arkpedia-data did not have yet, behind a hand-kept list. A release
   that ran before the list named a new file deleted it and failed every test that read it
   (2026-10-29). There is no list any more: a record the data repository lacks is gone. */
test('the data repository is the only source: what it has is written, what it lacks is deleted', () => {
  const run = hydrate(
    { 'data/rerun-clear-operators.json': '{"published":true}', 'data/polls/power-scale-v1.0.json': '{"schema":1}' },
    { 'data/rerun-clear-operators.json': '{"app":true}', 'data/app-only.json': '{}', 'data/lyrics/old_lyrics.lrc': '[00:01]x' },
  );
  assert.equal(run.read('data/rerun-clear-operators.json'), '{"published":true}');
  assert.equal(run.read('data/polls/power-scale-v1.0.json'), '{"schema":1}');
  assert.equal(run.read('data/app-only.json'), null);
  assert.equal(run.read('data/lyrics/old_lyrics.lrc'), null);
});

test('a fresh checkout with no data/ folder yet is filled', () => {
  const run = hydrate({ 'data/skins-extra.json': '[1]' }, {});
  assert.equal(run.read('data/skins-extra.json'), '[1]');
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
