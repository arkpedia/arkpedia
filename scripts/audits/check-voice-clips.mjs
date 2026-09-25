import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';
import { clipFile, restrictToRecordedClips } from '../lib/voice-clip-availability.mjs';
import { beginStage, defaultNow } from '../lib/quarantine.mjs';

/*
 * Every clip an operator page offers in a legacy voice pack, asked for the way readers ask.
 * A legacy pack was recorded before the actor changed and may lack lines (Exusiai's legacy
 * English has no CN_043), so the voice builder narrows availablePacks to the files each
 * legacy folder holds; this catches one the page would still offer that is not there.
 * Current packs are whole-game dumps and are covered by their revision records, which
 * check-published-assets.mjs verifies.
 *
 * A check of data/operator-voice-lines.json, which the voices stage rebuilds, so it is not
 * part of check-published-assets.mjs: the asset-revisions stage runs that one on the day's
 * new pins, before the voices stage, and failed there on the lines the voices stage was
 * about to narrow. Two modes, as check:assets has:
 *
 *   npm run check:published-assets          (app CI) fails on an offered clip the pinned
 *                                           repository lacks, or one it cannot check.
 *   npm run check:published-assets:release  (--quarantine, the release job's Validate
 *                                           step, after every refresh stage) holds back
 *                                           only those clips: the line stops offering the
 *                                           pack (availablePacks, the voice builder's own
 *                                           narrowing), and the operator's pack becomes a
 *                                           published-partial entry in data/quarantine.json
 *                                           (stage 'voice-clips', key voice:<charId>:<pack>).
 *                                           A day the voices stage failed keeps yesterday's
 *                                           lines, and a newly adopted voice revision may
 *                                           drop a clip they offer; either used to fail the
 *                                           whole release over one line.
 *
 * A HEAD request that does not answer 200 or 404 (a 429, a 5xx, a timeout) is asked again,
 * three times in all with a pause between. One still unanswered is a clip nobody could
 * check: CI fails on it, and the release holds it back like a missing one, with its own
 * reason, rather than offer what it could not confirm.
 */
export const STAGE = 'voice-clips';
const VOICE_LINES = 'data/operator-voice-lines.json';
const LEGACY = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/(arkpedia-voice-[a-z]+)\/(?:main|[a-f0-9]{40})\/(.+)$/;
const read = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Every clip a legacy pack offers on an operator page, with where to ask for it. */
export function offeredLegacyClips(voices, revisions) {
  const clips = [];
  for (const [charId, operator] of Object.entries(voices.operators)) {
    for (const pack of operator.packs.filter(pack => pack.status === 'legacy' && pack.audioTemplate)) {
      const match = pack.audioTemplate.match(LEGACY);
      // A template outside the pinned repositories is a builder bug, not a missing file.
      if (!match || !revisions[match[1]]) throw new Error(`${charId} ${pack.id}: legacy voice template outside the pinned voice repositories: ${pack.audioTemplate}`);
      for (const line of operator.lines) {
        if (hasRecording(line, pack)) clips.push({ charId, pack, line, repo: match[1], path: decodeURIComponent(clipUrl(match[2], line.id)) });
      }
    }
  }
  return clips;
}

/** 'present', 'absent', or the last error of a clip that never answered either way. */
export async function probeClip(address, { fetcher = fetch, attempts = 3, sleep = pause, backoffMs = 2000 } = {}) {
  let last = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(address, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
      if (response.ok) return 'present';
      if (response.status === 404) return 'absent';
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error?.name === 'TimeoutError' ? 'timed out' : String(error?.message ?? error);
    }
    if (attempt < attempts) await sleep(backoffMs * attempt);
  }
  return { error: last };
}

/** Runs the check on the tree under `root`; returns what it prints and how it exits. */
export async function checkVoiceClips({ root, quarantine = false, fetcher = fetch, now = defaultNow(), sleep = pause, attempts = 3, batch = 8 }) {
  const revisions = read(root, 'data/assets/revisions.json');
  const cdn = read(root, 'config/asset-delivery.json');
  // Fetch through the same template the site emits, so this verifies what readers load.
  const url = (repo, file) => cdn.template.replace('{repository}', repo).replace('{revision}', revisions[repo]).replace('{path}', file.split('/').map(encodeURIComponent).join('/'));
  const voices = read(root, VOICE_LINES);
  const clips = offeredLegacyClips(voices, revisions);
  const absent = [], unchecked = [];
  // Small batches avoid rate spikes against the public host.
  for (let offset = 0; offset < clips.length; offset += batch) {
    await Promise.all(clips.slice(offset, offset + batch).map(async clip => {
      const address = url(clip.repo, clip.path);
      const verdict = await probeClip(address, { fetcher, attempts, sleep });
      if (verdict === 'absent') absent.push(clip);
      else if (verdict !== 'present') unchecked.push({ ...clip, address, error: verdict.error });
    }));
  }
  const where = clip => `${clip.charId} ${clip.pack.id} ${clip.line.id}`;
  const out = [], errors = [];
  if (!quarantine) {
    if (absent.length) {
      errors.push(`Operator pages offer ${absent.length} legacy voice clip(s) the pinned voice repositories do not have: ${absent.map(where).sort().slice(0, 15).join(', ')}. `
        + 'Rebuild the voice lines (npm run voices:refresh), which leaves a clip out of availablePacks when its legacy folder lacks it. '
        + '(The release job runs this with --quarantine: there the clip is held back, not the release.)');
    }
    if (unchecked.length) {
      errors.push(`${unchecked.length} legacy voice clip(s) could not be checked after ${attempts} tries: ${unchecked.slice(0, 5).map(clip => `${clip.error}: ${clip.address}`).join(', ')}`);
    }
    if (!errors.length) out.push(`Verified ${clips.length} legacy voice clips.`);
    return { exitCode: errors.length ? 1 : 0, out, errors };
  }

  // Hold back what could not be confirmed: narrow each affected line the way the builder
  // does, and name the operator's pack in the quarantine.
  const held = new Map();
  for (const [clip, kind] of [...absent.map(clip => [clip, 'absent']), ...unchecked.map(clip => [clip, 'unchecked'])]) {
    const key = `voice:${clip.charId}:${clip.pack.id}`;
    const entry = held.get(key) ?? { clip, absent: [], unchecked: [] };
    entry[kind].push(clip.line.id);
    held.set(key, entry);
  }
  const operators = { ...voices.operators };
  for (const charId of new Set([...held.values()].map(({ clip }) => clip.charId))) {
    const operator = operators[charId];
    const lost = new Set([...held.values()].filter(({ clip }) => clip.charId === charId).flatMap(({ clip, absent: a, unchecked: u }) => [...a, ...u].map(id => `${clip.pack.id}\n${id}`)));
    // A listing per affected pack: every clip it offers, less the ones held back.
    const listings = new Map();
    for (const pack of operator.packs.filter(pack => [...lost].some(item => item.startsWith(`${pack.id}\n`)))) {
      listings.set(pack.id, new Set(operator.lines.filter(line => hasRecording(line, pack) && !lost.has(`${pack.id}\n${line.id}`)).map(line => clipFile(pack, line.id))));
    }
    operators[charId] = { ...operator, lines: restrictToRecordedClips(operator.lines, operator.packs, listings) };
  }
  const holds = beginStage(root, STAGE, now);
  for (const [key, { clip, absent: missing, unchecked: unknown }] of held) {
    const parts = [];
    if (missing.length) parts.push(`the pinned voice repository has no clip for ${missing.sort().join(', ')}`);
    if (unknown.length) parts.push(`${unknown.sort().join(', ')} could not be checked`);
    holds.add({ key, action: 'published-partial', reason: `${clip.charId} ${clip.pack.label || clip.pack.id} (legacy pack): ${parts.join('; ')}. Those lines are not offered in this pack.` });
  }
  const written = holds.commit();
  if (held.size) {
    const text = `${JSON.stringify({ ...voices, operators }, null, 2)}\n`;
    fs.writeFileSync(path.join(root, VOICE_LINES), text);
    out.push(`${absent.length + unchecked.length} of ${clips.length} legacy voice clip(s) held back (stage '${STAGE}' in data/quarantine.json), not failed:`);
    for (const entry of written) out.push(`  ! ${entry.key}: ${entry.reason}`);
  } else {
    out.push(`Verified ${clips.length} legacy voice clips.`);
  }
  return { exitCode: 0, out, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // No top-level await: the test suite loads this module as CommonJS.
  checkVoiceClips({ root: fileURLToPath(new URL('../..', import.meta.url)), quarantine: process.argv.includes('--quarantine') }).then(({ exitCode, out, errors }) => {
    for (const line of out) console.log(line);
    for (const line of errors) console.error(line);
    process.exit(exitCode);
  }, error => { console.error(error); process.exit(1); });
}
