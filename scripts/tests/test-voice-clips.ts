import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';
// @ts-expect-error Node audit scripts are plain JavaScript.
import { checkVoiceClips, offeredOutfitClips } from '../audits/check-voice-clips.mjs';
import { alternateAssetUrl } from '../../lib/assets/githubRetry.mjs';
// @ts-expect-error Node build helpers are plain JavaScript.
import { clipFile, fetchFolderListing, legacyFolder, listFolderClips, listLegacyClips, packFolder, restrictToRecordedClips, unlistedRecordings } from '../lib/voice-clip-availability.mjs';

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
  await assert.rejects(() => listLegacyClips(packs, { revisions: { 'arkpedia-voice-english': revision }, token: '', sleep: async () => {},
    fetcher: async () => ({ ok: false, status: 403, statusText: 'rate limited', json: async () => ({}) }) }), /403 rate limited/);
  const local = await listLegacyClips(packs, { revisions: {}, localIndex: { 'arkpedia-voice-english/legacy/cb13f0369f083541c7143cc4bb50b2eb448dc9fc/char_103_angel': ['CN_044.mp3'] } });
  assert.deepEqual([...local], [['old_en', new Set(['CN_044.mp3'])]]);
});

/* An outfit's voice set (skinVoices) reads a current folder named after its word key, which
   has a '#': the template encodes it, the listing decodes it, and the contents API is asked
   for it encoded again -- never a raw '#', which would end the path there. */
test('an outfit set folder is listed at the adopted revision with its # encoded once', async () => {
  const outfit = { id: 'jp', label: 'Japanese', actors: [], status: 'current' as const, audioTemplate: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/current/char_311_mudrok%231/{voiceIdLower}.mp3' };
  assert.deepEqual(packFolder(outfit), { repository: 'arkpedia-voice-japanese', folder: 'current/char_311_mudrok#1' });
  assert.equal(legacyFolder(outfit), null, 'a current folder is never a legacy one');
  assert.equal(clipFile(outfit, 'CN_002'), 'cn_002.mp3');
  const revision = 'f'.repeat(40);
  const requested: string[] = [];
  const listings = await listFolderClips([outfit], { revisions: { 'arkpedia-voice-japanese': revision }, token: '', fetcher: async (url: string) => {
    requested.push(url);
    return { ok: true, status: 200, statusText: 'OK', json: async () => [{ name: 'cn_001.mp3', type: 'file' }] };
  } });
  assert.deepEqual(requested, [`https://api.github.com/repos/arkpedia/arkpedia-voice-japanese/contents/current/char_311_mudrok%231?ref=${revision}`]);
  const lines = [line('CN_001'), line('CN_002')];
  const restricted = restrictToRecordedClips(lines, [outfit], listings);
  assert.equal(restricted[0], lines[0]);
  assert.deepEqual(restricted[1].availablePacks, [], 'the line says No recording rather than playing a 404');
  // The operator's own legacy listing still skips current packs.
  assert.deepEqual([...await listLegacyClips([outfit], { revisions: {}, token: '', fetcher: async () => { throw new Error('not asked'); } })], []);
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
function voiceTree(skinVoices?: object[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-voice-clips-'));
  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
  };
  write('data/assets/revisions.json', { 'arkpedia-voice-english': REVISION, 'arkpedia-voice-japanese': REVISION });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.copyFileSync('config/asset-delivery.json', path.join(root, 'config/asset-delivery.json'));
  write('data/operator-voice-lines.json', { meta: { note: 'fixture' }, operators: { char_103_angel: { textLocale: 'en', lines, packs, ...(skinVoices ? { skinVoices } : {}) } } });
  return root;
}
/** A host that answers each clip by its line id, at any encoding of its address (a raw 404 is
 *  asked again at the others, lib/assets/githubRetry.mjs); `calls` counts the requests per line
 *  and `asked` lists them. */
function host(answers: Record<string, number[]>) {
  const calls: Record<string, number> = {};
  const asked: string[] = [];
  const fetcher = async (url: string, init: { method?: string }) => {
    // A folder listing (an outfit set's current pack): every clip there.
    if (init.method === 'GET') return { ok: true, status: 200, json: async () => ['cn_006.mp3', 'cn_042.mp3', 'cn_043.mp3', 'cn_044.mp3'].map(name => ({ name, type: 'file' })) } as unknown as Response;
    assert.equal(init.method, 'HEAD');
    // At the pinned revision, through the delivery template, as readers ask.
    assert.ok(url.startsWith(`https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/${REVISION}/legacy/cb13f0369f083541c7143cc4bb50b2eb448dc9fc/char_103_angel/`), url);
    asked.push(url);
    const id = decodeURIComponent(url).match(/\/(CN_\d+)\.mp3$/)![1];
    calls[id] = (calls[id] ?? 0) + 1;
    const queue = answers[id] ?? [200];
    const status = queue[Math.min(calls[id], queue.length) - 1];
    if (status === 0) throw new TypeError('fetch failed');
    return { ok: status >= 200 && status < 300, status } as Response;
  };
  return { fetcher, calls, asked };
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
    assert.match(result.errors.join('\n'), /offer 1 voice clip\(s\) the pinned voice repositories do not have: char_103_angel old_en CN_043/);
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
    // A 404 counts once its own address and the three other encodings all say it.
    assert.deepEqual(calls, { CN_042: 1, CN_043: 4, CN_044: 1 });
    const narrowed = readTree(root, 'data/operator-voice-lines.json').operators.char_103_angel.lines;
    assert.deepEqual(narrowed[1], { ...lines[1], availablePacks: ['en', 'jp'] }, 'the page says No recording in the legacy pack');
    for (const i of [0, 2, 3]) assert.deepEqual(narrowed[i], lines[i]);
    assert.deepEqual(readTree(root, 'data/quarantine.json').entries, [{
      key: 'voice:char_103_angel:old_en', stage: 'voice-clips', action: 'published-partial', firstSeen: '2026-09-26',
      reason: 'char_103_angel Legacy EN (legacy pack): the pinned voice repository has no clip for CN_043. Those lines are not offered in this pack.',
    }]);
    // The next run no longer offers it, so there is nothing to hold.
    const again = await checkVoiceClips({ root, quarantine: true, fetcher: host({}).fetcher, sleep: noPause });
    assert.deepEqual(again.out, ['Verified 2 legacy voice clips and 0 outfit voice clips in 0 folders.']);
    assert.deepEqual(readTree(root, 'data/quarantine.json').entries, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("GitHub's false 404 is not a missing clip: one 200 at another encoding wins, and only a 404 at every one counts", async () => {
  const root = voiceTree();
  try {
    // Twice "404: Not Found" (GitHub's CDN keeps one per address), then the file.
    const flaky = host({ CN_043: [404, 404, 200] });
    const result = await checkVoiceClips({ root, fetcher: flaky.fetcher, sleep: noPause });
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
    assert.equal(flaky.calls.CN_043, 3);
    const own = flaky.asked.find(url => url.endsWith('/CN_043.mp3'))!;
    assert.deepEqual(flaky.asked.filter(url => /CN_043|%43N_043|%43%4E_043/.test(url)), [own, alternateAssetUrl(own, 1), alternateAssetUrl(own, 2)]);
    const release = await checkVoiceClips({ root, quarantine: true, fetcher: host({ CN_043: [404, 404, 200] }).fetcher, sleep: noPause });
    assert.deepEqual(release.out, ['Verified 3 legacy voice clips and 0 outfit voice clips in 0 folders.'], 'nothing held back');
    assert.ok(!fs.existsSync(path.join(root, 'data/quarantine.json')) || readTree(root, 'data/quarantine.json').entries.length === 0);

    // A 404 at every address is a clip the repository lacks.
    const gone = host({ CN_043: [404, 404, 404, 404] });
    const strict = await checkVoiceClips({ root, fetcher: gone.fetcher, sleep: noPause });
    assert.equal(strict.exitCode, 1);
    assert.equal(gone.calls.CN_043, 4);
    assert.match(strict.errors.join('\n'), /do not have: char_103_angel old_en CN_043/);
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
    // A request that failed outright is asked again at once at another encoding of the address
    // (fetchAsset, lib/assets/githubRetry.mjs): only the 503 and the 429 wait.
    assert.deepEqual(pauses.sort((a, b) => a - b), [2000, 2000], 'a pause before each retry of a refused answer');

    const down = () => host({ CN_044: [503] }).fetcher;
    const strict = await checkVoiceClips({ root, fetcher: down(), sleep: noPause });
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), /1 voice clip\(s\) could not be checked after 3 tries: HTTP 503: .*CN_044\.mp3/);
    const release = await checkVoiceClips({ root, quarantine: true, fetcher: down(), sleep: noPause });
    assert.equal(release.exitCode, 0);
    assert.equal(readTree(root, 'data/operator-voice-lines.json').operators.char_103_angel.lines[2].availablePacks.join(), 'en,jp');
    assert.match(readTree(root, 'data/quarantine.json').entries[0].reason, /CN_044 could not be checked\. Those lines are not offered in this pack\./);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/* The check walks an outfit's voice set as it walks the operator's own: a legacy pack in a
   set (none today; the walk must not depend on that) is asked for clip by clip, named by
   the set in CI's message, and held back in that set alone, under its own quarantine key. */
test('a legacy clip an outfit voice set offers is checked, named by the set, and held back in it alone', async () => {
  const set = { id: 'char_103_angel_sale#1', label: 'Fixture outfit', skinIds: ['char_103_angel@sale#1'], textLocale: 'en', lines, packs };
  const root = voiceTree([set]);
  try {
    const { fetcher, calls } = host({ CN_043: [200, 404] });
    // The operator's CN_043 is there (first answer), the outfit's is not (second).
    const strict = await checkVoiceClips({ root, fetcher, sleep: noPause });
    assert.equal(strict.exitCode, 1);
    assert.deepEqual(calls, { CN_042: 2, CN_043: 5, CN_044: 2 }, 'every offered clip, in both voices (the missing one at all four addresses)');
    assert.match(strict.errors.join('\n'), /offer 1 voice clip\(s\) the pinned voice repositories do not have: char_103_angel char_103_angel_sale#1 old_en CN_043/);

    const release = await checkVoiceClips({ root, quarantine: true, fetcher: host({ CN_043: [200, 404] }).fetcher, sleep: noPause, now: new Date('2026-10-06T20:00:00Z') });
    assert.equal(release.exitCode, 0, release.errors.join('\n'));
    const operator = readTree(root, 'data/operator-voice-lines.json').operators.char_103_angel;
    assert.deepEqual(operator.lines, lines, 'the operator\'s own voice keeps every clip');
    assert.deepEqual(operator.skinVoices[0].lines[1], { ...lines[1], availablePacks: ['en', 'jp'] });
    assert.equal(operator.skinVoices[0].label, 'Fixture outfit');
    assert.deepEqual(readTree(root, 'data/quarantine.json').entries.map((entry: { key: string; reason: string }) => [entry.key, entry.reason]), [[
      'voice:char_103_angel:char_103_angel_sale#1:old_en',
      'char_103_angel char_103_angel_sale#1 Legacy EN (legacy pack): the pinned voice repository has no clip for CN_043. Those lines are not offered in this pack.',
    ]]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/* An outfit's voice set as every real one is: current packs only, in folders named after its
   word key ('#' and all). No HEAD asks for those clips; each folder is listed once at the
   pinned revision and every clip the set offers is looked up in it. The audit once walked
   outfit sets for legacy packs only, so with the real data it checked no outfit clip at all,
   while the staged-art stage re-pins the voice repositories after the voices stage built them. */
const OUTFIT = 'char_103_angel_sale#1';
const outfitPack = (id: string, repository: string) => ({ id, label: id === 'en' ? 'English' : 'Japanese', actors: [], status: 'current' as const,
  audioTemplate: `https://raw.githubusercontent.com/arkpedia/${repository}/main/current/${encodeURIComponent(OUTFIT)}/{voiceIdLower}.mp3` });
const outfitSet = (packs = [outfitPack('en', 'arkpedia-voice-english'), outfitPack('jp', 'arkpedia-voice-japanese')]) => ({
  id: OUTFIT, label: 'Fixture outfit', skinIds: ['char_103_angel@sale#1'], textLocale: 'en',
  lines: [line('CN_042'), line('CN_043'), line('CN_044', { availablePacks: ['jp'] })], packs,
});
/** HEADs answer 200; each listing answers from `folders` ({ repository: names | status[] }). */
function outfitHost(folders: Record<string, string[] | number[]>) {
  const listed: string[] = [];
  const headers: Record<string, string>[] = [];
  const calls: Record<string, number> = {};
  const fetcher = async (url: string, init: { method?: string; headers?: Record<string, string> }) => {
    if (init.method === 'HEAD') return { ok: true, status: 200 } as Response;
    listed.push(url);
    headers.push(init.headers ?? {});
    const repository = url.match(/\/repos\/arkpedia\/([^/]+)\//)![1];
    calls[repository] = (calls[repository] ?? 0) + 1;
    const answer = folders[repository];
    if (typeof answer[0] === 'number') {
      const status = (answer as number[])[Math.min(calls[repository], answer.length) - 1];
      return { ok: false, status, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => [...(answer as string[]).map(name => ({ name, type: 'file' })), { name: 'nested', type: 'dir' }] } as unknown as Response;
  };
  return { fetcher, listed, headers };
}

test('an outfit set\'s current clips are looked up in their folders\' listings at the pinned revision', async () => {
  const root = voiceTree([outfitSet()]);
  try {
    const { fetcher, listed, headers } = outfitHost({
      // English lacks CN_043; Japanese has every clip, and CN_044 is offered in Japanese only.
      'arkpedia-voice-english': ['cn_042.mp3'],
      'arkpedia-voice-japanese': ['cn_042.mp3', 'cn_043.mp3', 'cn_044.mp3'],
    });
    const strict = await checkVoiceClips({ root, fetcher, token: 'fixture-token', sleep: noPause });
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), new RegExp(`offer 1 voice clip\\(s\\) the pinned voice repositories do not have: char_103_angel ${OUTFIT} en CN_043\\.`));
    // One listing per folder, its '#' encoded once, at the pin, with the token.
    assert.deepEqual(listed.sort(), [
      `https://api.github.com/repos/arkpedia/arkpedia-voice-english/contents/current/char_103_angel_sale%231?ref=${REVISION}`,
      `https://api.github.com/repos/arkpedia/arkpedia-voice-japanese/contents/current/char_103_angel_sale%231?ref=${REVISION}`,
    ]);
    assert.ok(headers.every(header => header.Authorization === 'Bearer fixture-token'));
    const voices = readTree(root, 'data/operator-voice-lines.json');
    const revisions = readTree(root, 'data/assets/revisions.json');
    assert.deepEqual(offeredOutfitClips(voices, revisions).map((clip: { pack: { id: string }; line: { id: string }; file: string }) => `${clip.pack.id} ${clip.line.id} ${clip.file}`),
      ['en CN_042 cn_042.mp3', 'en CN_043 cn_043.mp3', 'jp CN_042 cn_042.mp3', 'jp CN_043 cn_043.mp3', 'jp CN_044 cn_044.mp3'], 'not vacuous: every offered clip of the set');

    const release = await checkVoiceClips({ root, quarantine: true, fetcher: outfitHost({ 'arkpedia-voice-english': ['cn_042.mp3'], 'arkpedia-voice-japanese': ['cn_042.mp3', 'cn_043.mp3', 'cn_044.mp3'] }).fetcher,
      token: '', sleep: noPause, now: new Date('2026-10-06T20:00:00Z') });
    assert.equal(release.exitCode, 0, release.errors.join('\n'));
    const operator = readTree(root, 'data/operator-voice-lines.json').operators.char_103_angel;
    assert.deepEqual(operator.lines, lines, 'the operator\'s own voice is untouched');
    assert.deepEqual(operator.skinVoices[0].lines.map((row: { availablePacks?: string[] }) => row.availablePacks), [undefined, ['jp'], ['jp']]);
    assert.deepEqual(readTree(root, 'data/quarantine.json').entries.map((entry: { key: string; reason: string }) => [entry.key, entry.reason]), [[
      `voice:char_103_angel:${OUTFIT}:en`,
      `char_103_angel ${OUTFIT} English (outfit voice set): the pinned voice repository has no clip for CN_043. Those lines are not offered in this pack.`,
    ]]);
    const again = await checkVoiceClips({ root, quarantine: true, fetcher: outfitHost({ 'arkpedia-voice-english': ['cn_042.mp3'], 'arkpedia-voice-japanese': ['cn_042.mp3', 'cn_043.mp3', 'cn_044.mp3'] }).fetcher, token: '', sleep: noPause });
    assert.deepEqual(again.out, ['Verified 3 legacy voice clips and 4 outfit voice clips in 2 folders.']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an outfit folder never listed fails CI for every clip it offers, a missing folder lacks them all, and a raw # throws', async () => {
  const root = voiceTree([outfitSet()]);
  try {
    const down = () => outfitHost({ 'arkpedia-voice-english': [503, 429, 503], 'arkpedia-voice-japanese': ['cn_042.mp3', 'cn_043.mp3', 'cn_044.mp3'] }).fetcher;
    const strict = await checkVoiceClips({ root, fetcher: down(), token: '', sleep: noPause });
    assert.equal(strict.exitCode, 1);
    assert.match(strict.errors.join('\n'), /2 voice clip\(s\) could not be checked after 3 tries: HTTP 503: https:\/\/api\.github\.com\/repos\/arkpedia\/arkpedia-voice-english\/contents\/current\/char_103_angel_sale%231\?ref=c{40}$/);
    const release = await checkVoiceClips({ root, quarantine: true, fetcher: down(), token: '', sleep: noPause });
    assert.equal(release.exitCode, 0);
    assert.match(readTree(root, 'data/quarantine.json').entries[0].reason, /English \(outfit voice set\): CN_042, CN_043 could not be checked\./);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }

  const gone = voiceTree([outfitSet()]);
  try {
    const strict = await checkVoiceClips({ root: gone, fetcher: outfitHost({ 'arkpedia-voice-english': [404], 'arkpedia-voice-japanese': ['cn_042.mp3', 'cn_043.mp3', 'cn_044.mp3'] }).fetcher, token: '', sleep: noPause });
    assert.match(strict.errors.join('\n'), new RegExp(`offer 2 voice clip\\(s\\) .*: char_103_angel ${OUTFIT} en CN_042, char_103_angel ${OUTFIT} en CN_043\\.`));
  } finally { fs.rmSync(gone, { recursive: true, force: true }); }

  // Written raw, the browser would end the address at the '#': a builder bug, not a missing file.
  const raw = outfitPack('en', 'arkpedia-voice-english');
  const broken = voiceTree([outfitSet([{ ...raw, audioTemplate: raw.audioTemplate.replace('%23', '#') }])]);
  try {
    await assert.rejects(() => checkVoiceClips({ root: broken, fetcher: outfitHost({}).fetcher, token: '', sleep: noPause }), /not percent-encoded/);
  } finally { fs.rmSync(broken, { recursive: true, force: true }); }
});

/* Luo Xiaohei's Elite 2 set lists 27 lines and its folders hold 38 clips: the recordings no
   line plays become Unused rows, offered where a folder holds them; a skill sound is no line. */
test('recordings a set\'s table has no line for become Unused rows, and only voice lines do', () => {
  const packs = [outfitPack('en', 'arkpedia-voice-english'), outfitPack('jp', 'arkpedia-voice-japanese')];
  const listings = new Map([
    ['en', new Set(['cn_042.mp3', 'cn_020.mp3', 'fx_023.mp3', 'fx_025_1.mp3'])],
    ['jp', new Set(['cn_042.mp3', 'cn_020.mp3', 'cn_042_a.mp3', 'notes.txt'])],
  ]);
  const rows = unlistedRecordings([line('CN_042')], packs, listings, (id: string) => (id === 'CN_020' ? 'Begin Operation' : null));
  assert.deepEqual(rows, [
    { id: 'CN_020', title: 'Begin Operation', text: null, category: 'unused', status: 'unused', unlock: null, order: 2000, availablePacks: ['en', 'jp'] },
    { id: 'CN_042_a', title: 'Unused recording CN_042_a', text: null, category: 'unused', status: 'unused', unlock: null, order: 2001, availablePacks: ['jp'] },
  ]);
  // A pack without a listing says nothing about its folder.
  assert.deepEqual(unlistedRecordings([line('CN_042')], packs, new Map()), []);
});

/* The contents API allows 60 unauthenticated requests an hour, and the outfit folders alone
   are 66: both steps that run the clip check pass the job's token. */
test('both steps that run the voice clip check pass a GitHub token for the folder listings', () => {
  const step = (file: string, run: RegExp) => {
    const workflow = fs.readFileSync(file, 'utf8');
    const at = workflow.search(run);
    assert.ok(at > 0, `${run} is not in ${file}`);
    const start = workflow.lastIndexOf('\n      - ', at);
    return workflow.slice(start, at);
  };
  assert.match(step('.github/workflows/check.yml', /npm run check:published-assets\n/), /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(step('.github/workflows/prepare-content.yml', /\n\s*npm run check:published-assets:release\n/), /GH_TOKEN: \$\{\{ github\.token \}\}/);
});

/* GitHub's contents API answers 404 now and then for a folder that is there (2026-10-15: one
   folder answered 404, 404, then its 38 files, and main's Check called 140 clips missing). A
   404 is asked again; only a folder every answer called missing is absent, in the release
   audit and in the voices stage alike. */
test('a folder listing that answers 404 before its files is present; one that only answers 404 is absent', async () => {
  const answering = (statuses: (number | string[])[]) => {
    let calls = 0;
    const fetcher = async () => {
      const answer = statuses[Math.min(calls++, statuses.length - 1)];
      if (Array.isArray(answer)) return { ok: true, status: 200, json: async () => answer.map(name => ({ name, type: 'file' })) } as unknown as Response;
      return { ok: false, status: answer, json: async () => ({}) } as unknown as Response;
    };
    return { fetcher, calls: () => calls };
  };
  const revision = 'e'.repeat(40);
  const flaky = answering([404, 404, ['cn_001.mp3']]);
  assert.deepEqual([...await fetchFolderListing('arkpedia-voice-mandarin', 'current/char_1041_angel2_iteration#6', revision, { fetcher: flaky.fetcher, token: '', sleep: noPause }) as Set<string>], ['cn_001.mp3']);
  assert.equal(flaky.calls(), 3);
  const gone = answering([404]);
  assert.equal(await fetchFolderListing('arkpedia-voice-mandarin', 'current/gone', revision, { fetcher: gone.fetcher, token: '', sleep: noPause }), 'absent');
  assert.equal(gone.calls(), 3, 'asked three times before it is called absent');
  assert.deepEqual(await fetchFolderListing('arkpedia-voice-mandarin', 'current/gone', revision, { fetcher: answering([404, 503, 404]).fetcher, token: '', sleep: noPause }), { error: 'HTTP 404' }, 'one answer that was not a 404 makes it unchecked, not absent');

  const outfit = { id: 'cn', label: 'Chinese', actors: [], status: 'current' as const, audioTemplate: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-mandarin/main/current/char_1041_angel2_iteration%236/{voiceIdLower}.mp3' };
  const listings = await listFolderClips([outfit], { revisions: { 'arkpedia-voice-mandarin': revision }, token: '', sleep: noPause, fetcher: answering([404, ['cn_001.mp3']]).fetcher });
  assert.deepEqual([...listings.get('cn')!], ['cn_001.mp3'], 'the voices stage keeps the folder a false 404 hid');
  await assert.rejects(() => listFolderClips([outfit], { revisions: { 'arkpedia-voice-mandarin': revision }, token: '', sleep: noPause, fetcher: answering([404]).fetcher }), /not found at e{40}/);

  const root = voiceTree([outfitSet()]);
  try {
    let english = 0;
    const fetcher = async (url: string, init: { method?: string }) => {
      if (init.method === 'HEAD') return { ok: true, status: 200 } as Response;
      const names = url.includes('arkpedia-voice-english') && english++ < 2 ? null : ['cn_042.mp3', 'cn_043.mp3', 'cn_044.mp3'];
      return (names ? { ok: true, status: 200, json: async () => names.map(name => ({ name, type: 'file' })) } : { ok: false, status: 404, json: async () => ({}) }) as unknown as Response;
    };
    const strict = await checkVoiceClips({ root, fetcher, token: '', sleep: noPause });
    assert.equal(strict.exitCode, 0, strict.errors.join('\n'));
    assert.equal(english, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
