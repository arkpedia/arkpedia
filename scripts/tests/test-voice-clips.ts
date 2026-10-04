import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';
// @ts-expect-error Node audit scripts are plain JavaScript.
import { checkVoiceClips } from '../audits/check-voice-clips.mjs';
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
  assert.ok(at(/stage voices /) < at(/\n\s*npm run check:published-assets:release\n/), 'the Validate step checks what the refresh wrote');
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  // App CI stays strict; the release holds a missing clip back instead of failing.
  assert.match(scripts['check:published-assets'], /node scripts\/audits\/check-voice-clips\.mjs$/);
  // The release also holds a folder this code does not map yet (check-published-assets.mjs).
  assert.match(scripts['check:published-assets:release'], /^node scripts\/audits\/check-published-assets\.mjs --quarantine && node scripts\/audits\/check-voice-clips\.mjs --quarantine$/);
  assert.doesNotMatch(workflow, /\n\s*npm run check:published-assets\n/, 'the release job never runs the strict clip check');
  assert.match(fs.readFileSync('.github/workflows/check.yml', 'utf8'), /npm run check:published-assets\n/, 'app CI runs the strict one');
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

/* The check against a made-up tree: Exusiai's shape, a fake host that answers per clip, and
   no real pauses between retries. App CI fails on a missing clip; the release job
   (--quarantine) holds back that clip -- the line stops offering the pack, and the pack is a
   published-partial quarantine entry -- where it used to fail the whole release over one
   line: the first run after merge keeps data main's un-narrowed lines if the voices stage
   fails that day, and a newly adopted voice revision can drop a clip. */
const REVISION = 'c'.repeat(40);
function voiceTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-voice-clips-'));
  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
  };
  write('data/assets/revisions.json', { 'arkpedia-voice-english': REVISION });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.copyFileSync('config/asset-delivery.json', path.join(root, 'config/asset-delivery.json'));
  write('data/operator-voice-lines.json', { meta: { note: 'fixture' }, operators: { char_103_angel: { textLocale: 'en', lines, packs } } });
  return root;
}
/** A host that answers each clip by its line id; `calls` counts the requests per line. */
function host(answers: Record<string, number[]>) {
  const calls: Record<string, number> = {};
  const fetcher = async (url: string, init: { method?: string }) => {
    assert.equal(init.method, 'HEAD');
    // At the pinned revision, through the delivery template, as readers ask.
    assert.ok(url.startsWith(`https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/${REVISION}/legacy/cb13f0369f083541c7143cc4bb50b2eb448dc9fc/char_103_angel/`), url);
    const id = url.match(/\/(CN_\d+)\.mp3$/)![1];
    calls[id] = (calls[id] ?? 0) + 1;
    const queue = answers[id] ?? [200];
    const status = queue[Math.min(calls[id], queue.length) - 1];
    if (status === 0) throw new TypeError('fetch failed');
    return { ok: status >= 200 && status < 300, status } as Response;
  };
  return { fetcher, calls };
}
const noPause = async () => {};
const readTree = (root: string, file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('app CI fails on an offered legacy clip the repository lacks, and writes nothing', async () => {
  const root = voiceTree();
  try {
    const before = fs.readFileSync(path.join(root, 'data/operator-voice-lines.json'), 'utf8');
    const { fetcher } = host({ CN_043: [404] });
    const result = await checkVoiceClips({ root, fetcher, sleep: noPause });
    assert.equal(result.exitCode, 1);
    assert.match(result.errors.join('\n'), /offer 1 legacy voice clip\(s\) the pinned voice repositories do not have: char_103_angel old_en CN_043/);
    assert.equal(fs.readFileSync(path.join(root, 'data/operator-voice-lines.json'), 'utf8'), before);
    assert.ok(!fs.existsSync(path.join(root, 'data/quarantine.json')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the release holds back a missing legacy clip instead of failing, and the hold ends when it is no longer offered', async () => {
  const root = voiceTree();
  try {
    const { fetcher, calls } = host({ CN_043: [404] });
    const result = await checkVoiceClips({ root, quarantine: true, fetcher, sleep: noPause, now: new Date('2026-09-26T20:00:00Z') });
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
    assert.deepEqual(calls, { CN_042: 1, CN_043: 1, CN_044: 1 });
    const narrowed = readTree(root, 'data/operator-voice-lines.json').operators.char_103_angel.lines;
    assert.deepEqual(narrowed[1], { ...lines[1], availablePacks: ['en', 'jp'] }, 'the page says No recording in the legacy pack');
    for (const i of [0, 2, 3]) assert.deepEqual(narrowed[i], lines[i]);
    assert.deepEqual(readTree(root, 'data/quarantine.json').entries, [{
      key: 'voice:char_103_angel:old_en', stage: 'voice-clips', action: 'published-partial', firstSeen: '2026-09-26',
      reason: 'char_103_angel Legacy EN (legacy pack): the pinned voice repository has no clip for CN_043. Those lines are not offered in this pack.',
    }]);
    // The next run no longer offers it, so there is nothing to hold.
    const again = await checkVoiceClips({ root, quarantine: true, fetcher: host({}).fetcher, sleep: noPause });
    assert.deepEqual(again.out, ['Verified 2 legacy voice clips.']);
    assert.deepEqual(readTree(root, 'data/quarantine.json').entries, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a clip the host fails to answer is asked again; one never answered fails CI and is held back by the release', async () => {
  const root = voiceTree();
  try {
    const pauses: number[] = [];
    const flaky = host({ CN_042: [503, 0, 200], CN_044: [429, 200] });
    const recovered = await checkVoiceClips({ root, fetcher: flaky.fetcher, sleep: async (ms: number) => { pauses.push(ms); } });
    assert.equal(recovered.exitCode, 0, recovered.errors.join('\n'));
    assert.deepEqual(flaky.calls, { CN_042: 3, CN_043: 1, CN_044: 2 });
    assert.deepEqual(pauses.sort((a, b) => a - b), [2000, 2000, 4000], 'a longer pause before each retry');

    const down = () => host({ CN_044: [503] }).fetcher;
    const strict = await checkVoiceClips({ root, fetcher: down(), sleep: noPause });
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), /1 legacy voice clip\(s\) could not be checked after 3 tries: HTTP 503: .*CN_044\.mp3/);
    const release = await checkVoiceClips({ root, quarantine: true, fetcher: down(), sleep: noPause });
    assert.equal(release.exitCode, 0);
    assert.equal(readTree(root, 'data/operator-voice-lines.json').operators.char_103_angel.lines[2].availablePacks.join(), 'en,jp');
    assert.match(readTree(root, 'data/quarantine.json').entries[0].reason, /CN_044 could not be checked\. Those lines are not offered in this pack\./);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
