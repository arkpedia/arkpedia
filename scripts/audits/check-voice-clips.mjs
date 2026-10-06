import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';
import { clipFile, folderListingUrl, packFolder, restrictToRecordedClips } from '../lib/voice-clip-availability.mjs';
import { beginStage, defaultNow } from '../lib/quarantine.mjs';

/*
 * Every clip an operator page offers that a builder narrowed file by file, checked at the
 * pins the release publishes:
 *
 *  - legacy packs, in the operator's own voice (and in an outfit's, should one ever have
 *    one), asked for the way readers ask, one HEAD per clip. A legacy pack was recorded
 *    before the actor changed and may lack lines (Exusiai's legacy English has no CN_043),
 *    so the voice builder narrows availablePacks to the files each legacy folder holds; this
 *    catches one the page would still offer that is not there.
 *  - outfit voice sets (skinVoices), whose packs are all current ones: each folder listed
 *    once by the contents API at the pinned revision (GH_TOKEN; 66 folders today, past the
 *    unauthenticated limit), and every clip a line offers looked up in it. The builder
 *    lists the same folders, but at the pins of the voices stage; the staged-art stage
 *    re-pins every asset repository after it, and this runs after that. A template that
 *    would not reach its folder (a raw '#' in an outfit's word key ends the address there)
 *    is a builder bug and throws.
 *
 * An operator's own current packs are whole-game dumps found by folder, and are covered by
 * their revision records, which check-published-assets.mjs verifies; they are not listed
 * file by file here or in the builder.
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
 *                                           (stage 'voice-clips', key voice:<charId>:<pack>,
 *                                           or voice:<charId>:<setId>:<pack> in an outfit's
 *                                           set). A day the voices stage failed keeps
 *                                           yesterday's lines, and a newly adopted voice
 *                                           revision may drop a clip they offer; either used
 *                                           to fail the whole release over one line.
 *
 * A request that does not answer 200 or 404 (a 429, a 5xx, a timeout) is asked again, three
 * times in all with a pause between. One still unanswered is a clip nobody could check (for
 * a folder, every clip it offers): CI fails on it, and the release holds it back like a
 * missing one, with its own reason, rather than offer what it could not confirm.
 */
export const STAGE = 'voice-clips';
const VOICE_LINES = 'data/operator-voice-lines.json';
const LEGACY = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/(arkpedia-voice-[a-z]+)\/(?:main|[a-f0-9]{40})\/(.+)$/;
const read = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** An operator's voice sets: its own (set null), then each outfit's (its word key). */
export function voiceSets(operator) {
  return [{ set: null, ...operator }, ...(operator.skinVoices ?? []).map(entry => ({ ...entry, set: entry.id }))];
}

/** Every clip a legacy pack offers on an operator page, in the operator's voice or an
 * outfit's (skinVoices), with where to ask for it. */
export function offeredLegacyClips(voices, revisions) {
  const clips = [];
  for (const [charId, operator] of Object.entries(voices.operators)) {
    for (const { set, lines, packs } of voiceSets(operator)) {
      const owner = set ? `${charId} ${set}` : charId;
      for (const pack of packs.filter(pack => pack.status === 'legacy' && pack.audioTemplate)) {
        const match = pack.audioTemplate.match(LEGACY);
        // A template outside the pinned repositories is a builder bug, not a missing file.
        if (!match || !revisions[match[1]]) throw new Error(`${owner} ${pack.id}: legacy voice template outside the pinned voice repositories: ${pack.audioTemplate}`);
        for (const line of lines) {
          if (hasRecording(line, pack)) clips.push({ charId, set, pack, line, repo: match[1], path: decodeURIComponent(clipUrl(match[2], line.id)) });
        }
      }
    }
  }
  return clips;
}

/** Whether every segment of a template's path is percent-encoded once, as the browser needs
 * it: a raw '#' or space would end or break the address. The file name, with its placeholder,
 * is the one segment left as written. */
function encodedOnce(template) {
  return template.replace(/^https:\/\/[^/]+\//, '').split('/').slice(0, -1).every(segment => {
    try { return encodeURIComponent(decodeURIComponent(segment)) === segment; } catch { return false; }
  });
}

/** Every clip an outfit's voice set offers in a current pack, with the folder that holds it:
 * the clips no HEAD above asks for, looked up in the folder's listing instead. */
export function offeredOutfitClips(voices, revisions) {
  const clips = [];
  for (const [charId, operator] of Object.entries(voices.operators)) {
    for (const entry of operator.skinVoices ?? []) {
      for (const pack of entry.packs.filter(pack => pack.status !== 'legacy' && pack.audioTemplate)) {
        const found = packFolder(pack);
        const owner = `${charId} ${entry.id} ${pack.id}`;
        if (!found || !revisions[found.repository]) throw new Error(`${owner}: outfit voice template outside the pinned voice repositories: ${pack.audioTemplate}`);
        if (!encodedOnce(pack.audioTemplate)) throw new Error(`${owner}: outfit voice template not percent-encoded (a raw '#' ends the address there): ${pack.audioTemplate}`);
        for (const line of entry.lines) {
          if (hasRecording(line, pack)) clips.push({ charId, set: entry.id, pack, line, repo: found.repository, folder: found.folder, file: clipFile(pack, line.id) });
        }
      }
    }
  }
  return clips;
}

/** A folder's file names at a revision, 'absent', or the last error of one never listed. */
export async function listFolder(repository, folder, revision, { fetcher = fetch, token = process.env.GH_TOKEN, attempts = 3, sleep = pause, backoffMs = 2000 } = {}) {
  let last = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(folderListingUrl(repository, folder, revision), {
        method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return 'absent';
      if (response.ok) {
        const entries = await response.json();
        if (Array.isArray(entries)) return new Set(entries.filter(entry => entry.type === 'file').map(entry => entry.name));
        last = 'not a folder';
      } else {
        last = `HTTP ${response.status}`;
      }
    } catch (error) {
      last = error?.name === 'TimeoutError' ? 'timed out' : String(error?.message ?? error);
    }
    if (attempt < attempts) await sleep(backoffMs * attempt);
  }
  return { error: last };
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
export async function checkVoiceClips({ root, quarantine = false, fetcher = fetch, token = process.env.GH_TOKEN, now = defaultNow(), sleep = pause, attempts = 3, batch = 8 }) {
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
  // Outfit voice sets: one listing per folder, every offered clip looked up in it.
  const outfitClips = offeredOutfitClips(voices, revisions);
  const folders = new Map();
  for (const clip of outfitClips) {
    const key = `${clip.repo}/${clip.folder}`;
    folders.set(key, [...(folders.get(key) ?? []), clip]);
  }
  const groups = [...folders.values()];
  for (let offset = 0; offset < groups.length; offset += batch) {
    await Promise.all(groups.slice(offset, offset + batch).map(async group => {
      const { repo, folder } = group[0];
      const listing = await listFolder(repo, folder, revisions[repo], { fetcher, token, attempts, sleep });
      for (const clip of group) {
        if (listing === 'absent' || (listing instanceof Set && !listing.has(clip.file))) absent.push(clip);
        else if (!(listing instanceof Set)) unchecked.push({ ...clip, address: folderListingUrl(repo, folder, revisions[repo]), error: listing.error });
      }
    }));
  }
  const checked = `${clips.length} legacy voice clips and ${outfitClips.length} outfit voice clips in ${folders.size} folders`;
  const kind = clip => clip.pack.status === 'legacy' ? 'legacy pack' : 'outfit voice set';
  const owner = clip => clip.set ? `${clip.charId} ${clip.set}` : clip.charId;
  const where = clip => `${owner(clip)} ${clip.pack.id} ${clip.line.id}`;
  const out = [], errors = [];
  if (!quarantine) {
    if (absent.length) {
      errors.push(`Operator pages offer ${absent.length} voice clip(s) the pinned voice repositories do not have: ${absent.map(where).sort().slice(0, 15).join(', ')}. `
        + 'Rebuild the voice lines (npm run voices:refresh), which leaves a clip out of availablePacks when its legacy or outfit folder lacks it. '
        + '(The release job runs this with --quarantine: there the clip is held back, not the release.)');
    }
    if (unchecked.length) {
      errors.push(`${unchecked.length} voice clip(s) could not be checked after ${attempts} tries: ${[...new Set(unchecked.map(clip => `${clip.error}: ${clip.address}`))].slice(0, 5).join(', ')}`);
    }
    if (!errors.length) out.push(`Verified ${checked}.`);
    return { exitCode: errors.length ? 1 : 0, out, errors };
  }

  // Hold back what could not be confirmed: narrow each affected line the way the builder
  // does, and name the operator's pack -- or the outfit set's -- in the quarantine.
  const held = new Map();
  for (const [clip, kind] of [...absent.map(clip => [clip, 'absent']), ...unchecked.map(clip => [clip, 'unchecked'])]) {
    const key = clip.set ? `voice:${clip.charId}:${clip.set}:${clip.pack.id}` : `voice:${clip.charId}:${clip.pack.id}`;
    const entry = held.get(key) ?? { clip, absent: [], unchecked: [] };
    entry[kind].push(clip.line.id);
    held.set(key, entry);
  }
  /** One voice set's lines with the held clips left out of their packs. */
  const narrow = (charId, set, { lines, packs }) => {
    const mine = [...held.values()].filter(({ clip }) => clip.charId === charId && clip.set === set);
    if (!mine.length) return lines;
    const lost = new Set(mine.flatMap(({ clip, absent: a, unchecked: u }) => [...a, ...u].map(id => `${clip.pack.id}\n${id}`)));
    // A listing per affected pack: every clip it offers, less the ones held back.
    const listings = new Map();
    for (const pack of packs.filter(pack => [...lost].some(item => item.startsWith(`${pack.id}\n`)))) {
      listings.set(pack.id, new Set(lines.filter(line => hasRecording(line, pack) && !lost.has(`${pack.id}\n${line.id}`)).map(line => clipFile(pack, line.id))));
    }
    return restrictToRecordedClips(lines, packs, listings);
  };
  const operators = { ...voices.operators };
  for (const charId of new Set([...held.values()].map(({ clip }) => clip.charId))) {
    const operator = operators[charId];
    operators[charId] = {
      ...operator,
      lines: narrow(charId, null, operator),
      ...(operator.skinVoices ? { skinVoices: operator.skinVoices.map(entry => ({ ...entry, lines: narrow(charId, entry.id, entry) })) } : {}),
    };
  }
  const holds = beginStage(root, STAGE, now);
  for (const [key, { clip, absent: missing, unchecked: unknown }] of held) {
    const parts = [];
    if (missing.length) parts.push(`the pinned voice repository has no clip for ${missing.sort().join(', ')}`);
    if (unknown.length) parts.push(`${unknown.sort().join(', ')} could not be checked`);
    holds.add({ key, action: 'published-partial', reason: `${owner(clip)} ${clip.pack.label || clip.pack.id} (${kind(clip)}): ${parts.join('; ')}. Those lines are not offered in this pack.` });
  }
  const written = holds.commit();
  if (held.size) {
    const text = `${JSON.stringify({ ...voices, operators }, null, 2)}\n`;
    fs.writeFileSync(path.join(root, VOICE_LINES), text);
    out.push(`${absent.length + unchecked.length} of ${clips.length + outfitClips.length} voice clip(s) held back (stage '${STAGE}' in data/quarantine.json), not failed:`);
    for (const entry of written) out.push(`  ! ${entry.key}: ${entry.reason}`);
  } else {
    out.push(`Verified ${checked}.`);
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
