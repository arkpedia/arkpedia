import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';
// @ts-expect-error Node build helpers are plain JavaScript.
import { clipFile, legacyFolder, listLegacyClips, restrictToRecordedClips } from '../lib/voice-clip-availability.mjs';

/* Exusiai's shape, frozen: two current packs, a legacy English pack whose folder lacks the
   Birthday line (CN_043), and an unused recording that only exists in Japanese. */
const LEGACY = 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/legacy/cb13f0369f083541c7143cc4bb50b2eb448dc9fc/char_103_angel/{voiceId}.mp3';
const packs = [
  { id: 'en', label: 'English', actors: [], status: 'current' as const, audioTemplate: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/current/char_103_angel/{voiceIdLower}.mp3' },
  { id: 'jp', label: 'Japanese', actors: [], status: 'current' as const, audioTemplate: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/current/char_103_angel/{voiceIdLower}.mp3' },
  { id: 'old_en', label: 'Legacy EN', actors: [], status: 'legacy' as const, audioTemplate: LEGACY },
];
const line = (id: string, extra: object = {}) => ({ id, title: id, text: null, category: 'special', status: 'current', unlock: null, order: 0, ...extra });
const lines = [line('CN_042'), line('CN_043'), line('CN_044'), line('CN_006', { status: 'unused', category: 'unused', availablePacks: ['jp'] })];

test('a legacy pack offers only the clips its folder holds; every other pack keeps the line', () => {
  const listings = new Map([['old_en', new Set(['CN_042.mp3', 'CN_044.mp3'])]]);
  const restricted = restrictToRecordedClips(lines, packs, listings);
  assert.deepEqual(restricted[1], { ...lines[1], availablePacks: ['en', 'jp'] });
  // Lines the folder has, and a line the legacy pack never offered, are untouched.
  for (const i of [0, 2, 3]) assert.equal(restricted[i], lines[i]);
  const offered = (id: string, pack: string) => hasRecording(restricted.find((row: { id: string }) => row.id === id), packs.find(entry => entry.id === pack));
  assert.equal(offered('CN_043', 'old_en'), false, 'the page says No recording instead of playing a 404');
  assert.equal(offered('CN_043', 'en'), true);
  assert.equal(offered('CN_042', 'old_en'), true);
  assert.equal(offered('CN_006', 'old_en'), false);
  // A pack with no listing is taken as complete.
  assert.deepEqual(restrictToRecordedClips(lines, packs, new Map()), lines);
});

test('the legacy folder is listed at the adopted voice revision, or from a local index', async () => {
  assert.deepEqual(legacyFolder(packs[2]), { repository: 'arkpedia-voice-english', folder: 'legacy/cb13f0369f083541c7143cc4bb50b2eb448dc9fc/char_103_angel' });
  assert.equal(legacyFolder(packs[0]), null);
  assert.equal(clipFile(packs[2], 'CN_043'), 'CN_043.mp3');
  assert.equal(clipFile(packs[0], 'CN_043'), 'cn_043.mp3');
  assert.equal(clipUrl(packs[0].audioTemplate, 'CN_043'), 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/current/char_103_angel/cn_043.mp3');
  const revision = 'e'.repeat(40);
  const requested: string[] = [];
  const listings = await listLegacyClips(packs, { revisions: { 'arkpedia-voice-english': revision }, token: '', fetcher: async (url: string) => {
    requested.push(url);
    return { ok: true, status: 200, statusText: 'OK', json: async () => [{ name: 'CN_042.mp3', type: 'file' }, { name: 'nested', type: 'dir' }] };
  } });
  assert.deepEqual(requested, [`https://api.github.com/repos/arkpedia/arkpedia-voice-english/contents/legacy/cb13f0369f083541c7143cc4bb50b2eb448dc9fc/char_103_angel?ref=${revision}`]);
  assert.deepEqual([...listings], [['old_en', new Set(['CN_042.mp3'])]]);
  await assert.rejects(() => listLegacyClips(packs, { revisions: {}, token: '', fetcher: async () => { throw new Error('unreachable'); } }), /Missing adopted voice revision/);
  await assert.rejects(() => listLegacyClips(packs, { revisions: { 'arkpedia-voice-english': revision }, token: '',
    fetcher: async () => ({ ok: false, status: 403, statusText: 'rate limited', json: async () => ({}) }) }), /403 rate limited/);
  const local = await listLegacyClips(packs, { revisions: {}, localIndex: { 'arkpedia-voice-english/legacy/cb13f0369f083541c7143cc4bb50b2eb448dc9fc/char_103_angel': ['CN_044.mp3'] } });
  assert.deepEqual([...local], [['old_en', new Set(['CN_044.mp3'])]]);
});

/* The release job's asset-revisions stage adopts the day's pins and checks the files at
   them (update-asset-revisions.mjs runs check-published-assets.mjs). The voice lines are
   rebuilt against those pins by the voices stage, later in the same run, so a check of the
   lines inside the asset stage judged yesterday's lines: in a rehearsal of the first run
   after the builder learnt to narrow legacy packs, it failed on the 18 clips the voices
   stage was about to leave out, and the day's asset pins were thrown away with it. */
test('the voice lines are checked after the voices stage rebuilds them, never in the asset-revisions stage', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const at = (pattern: RegExp) => {
    const match = workflow.match(pattern);
    assert.ok(match, `${pattern} is not in prepare-content.yml`);
    return match.index!;
  };
  assert.ok(at(/stage asset-revisions -- npm run assets:update\n/) < at(/stage voices /));
  assert.ok(at(/stage voices /) < at(/\n\s*npm run check:published-assets\n/), 'the Validate step checks what the refresh wrote');
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  assert.match(scripts['check:published-assets'], /node scripts\/audits\/check-voice-clips\.mjs/);
  assert.equal(scripts['assets:update'], 'node scripts/sync/update-asset-revisions.mjs');
  // Everything the asset stage runs, through the scripts it starts.
  const reached = new Set<string>();
  const queue = ['scripts/sync/update-asset-revisions.mjs'];
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (reached.has(file)) continue;
    reached.add(file);
    for (const [, script] of fs.readFileSync(file, 'utf8').matchAll(/['"](scripts\/[\w/.-]+\.(?:mjs|cjs|js))['"]/g)) queue.push(script);
  }
  assert.ok(reached.has('scripts/audits/check-published-assets.mjs'), 'not vacuous: the asset stage checks the files at its pins');
  for (const file of reached) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /operator-voice-lines\.json|voiceRecording\.mjs|check-voice-clips/, `${file} runs in the asset-revisions stage, before the voices stage rebuilds the lines`);
  }
});
