import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getSongChoices } from '../../lib/music-guesser/catalogue';
import type { SongChoice } from '../../lib/music-guesser/game';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { failureLine } from '../content/run-stage.mjs';
import { checkPayloadBudgets, MUSIC_CATALOGUE, MUSIC_SELECTION, musicCataloguePayload, musicSelectionPayload, payloadBytes } from '../audits/check-payload-budgets';

/*
 * The guessers' size budgets were assertions in npm test, which the release job's Validate
 * step also runs, on the day's data. The albums stage appends every new Monster Siren song
 * on its own, so the music guesser's 50 KB budget (48,322 bytes on 2026-09-25) would have
 * failed the release a few months on, and every release after it, with no record at fault.
 * They are scripts/audits/check-payload-budgets.ts now: strict in Check, a stage hold in the
 * release job. None of these tests measure the real catalogue against a budget.
 */

const row = (bytes: number) => ({ ...MUSIC_CATALOGUE, bytes });

test('a payload at or over its budget fails the check and names it; under budget passes', () => {
  const under = checkPayloadBudgets([row(MUSIC_CATALOGUE.limit - 1)]);
  assert.equal(under.exitCode, 0);
  assert.deepEqual(under.errors, []);
  assert.match(under.out[0], /^ok {3}music guesser catalogue: 49999 of 50000 bytes gzip/);
  for (const bytes of [MUSIC_CATALOGUE.limit, MUSIC_CATALOGUE.limit + 1644]) {
    const over = checkPayloadBudgets([row(1), row(bytes)]);
    assert.equal(over.exitCode, 1);
    assert.match(over.out[1], /^OVER music guesser catalogue/);
    assert.match(over.errors.join('\n'), new RegExp(`  music guesser catalogue: ${bytes} bytes gzip, budget 50000 \\(every song`));
    assert.match(over.errors.join('\n'), /release job this is the payload-budgets stage/);
    // The line a failed stage is reported by, in the stage report and the daily issue.
    assert.equal(failureLine(over.errors.join('\n')), `1 payload(s) over budget: music guesser catalogue ${bytes} of 50000 bytes gzip`);
  }
});

test('songs the albums stage keeps importing push the music guesser over budget, and the check reports it', () => {
  // A bare import, as scripts/sync/sync-albums.mjs writes it and getSongChoices projects it:
  // an id, a title and nothing editorial yet. Titles that do not compress to nothing.
  const imported = (i: number): SongChoice => ({ id: String(900_000 + i), title: createHash('sha256').update(String(i)).digest('base64').slice(0, 14), altTitle: null, videoId: '' });
  const songs = getSongChoices();
  const grown = [...songs];
  let bytes = payloadBytes(musicCataloguePayload(grown), 'gzip');
  // Grow until over, however close to the budget the catalogue already is.
  while (bytes < MUSIC_CATALOGUE.limit && grown.length < songs.length + 20_000) {
    for (let i = 0; i < 50; i++) grown.push(imported(grown.length));
    bytes = payloadBytes(musicCataloguePayload(grown), 'gzip');
  }
  assert.ok(bytes >= MUSIC_CATALOGUE.limit, 'not vacuous: the grown catalogue is over budget');
  const selection = payloadBytes(musicSelectionPayload(grown), 'gzip');
  const verdict = checkPayloadBudgets([{ ...MUSIC_CATALOGUE, bytes }, { ...MUSIC_SELECTION, bytes: selection }]);
  assert.equal(verdict.exitCode, 1, 'the signal still fires where it is run');
  assert.match(verdict.errors.join('\n'), /music guesser catalogue/);
});

// Every file the npm test script runs, from its own globs.
function npmTestFiles(): string[] {
  const script: string = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test;
  const globs = script.split(/\s+/).filter((word) => /\.(ts|mjs)$/.test(word));
  assert.ok(globs.length >= 2, `could not read the npm test globs from: ${script}`);
  return globs.flatMap((glob) => {
    const dir = path.dirname(glob), pattern = path.basename(glob);
    if (!pattern.includes('*')) return [glob];
    const [prefix, suffix] = pattern.split('*');
    return fs.readdirSync(dir).filter((name) => name.startsWith(prefix) && name.endsWith(suffix)).map((name) => path.join(dir, name));
  });
}

test('nothing npm test runs holds real data to a size budget', () => {
  const files = npmTestFiles();
  assert.ok(files.includes(path.join('scripts', 'tests', 'test-music-guesser.ts')), 'not vacuous: the guesser suites are in the glob');
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /from ['"](?:node:)?zlib['"]/, `${file} measures compressed size; budgets belong in scripts/audits/check-payload-budgets.ts`);
    assert.doesNotMatch(text, /byteLength\(.*\)\s*<\s*[\d_]+/, `${file} caps a byte length; budgets belong in scripts/audits/check-payload-budgets.ts`);
  }
});

test('Check runs the budgets strictly, and the release job runs them as a stage that cannot hold it back', () => {
  assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts['check:payload-budgets'], 'tsx scripts/audits/check-payload-budgets.ts');
  assert.match(fs.readFileSync('.github/workflows/check.yml', 'utf8'), /\n\s+run: npm run check:payload-budgets\n/);
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const stage = workflow.match(/^\s*stage payload-budgets (.*)$/m);
  assert.ok(stage, 'prepare-content.yml runs the budgets as a refresh stage');
  assert.equal(stage[1], '-- npm run check:payload-budgets', 'no --invariant: a payload over budget must not stop the release');
  // After the stages that add what it measures.
  for (const earlier of [/stage albums /, /stage catalogue /, /bash scripts\/sync\/refresh-stage-data\.sh/]) {
    const at = workflow.search(earlier);
    assert.ok(at >= 0 && at < stage.index!, `${earlier} runs before the payload-budgets stage`);
  }
  const validate = workflow.slice(workflow.indexOf('- name: Validate and compile data'), workflow.indexOf('- name: Publish the validated public release'));
  assert.ok(validate.includes('npm test'), 'not vacuous: the Validate step was found');
  assert.doesNotMatch(validate, /check:payload-budgets|check-payload-budgets/, 'the Validate step must not fail a release over payload size');
});
