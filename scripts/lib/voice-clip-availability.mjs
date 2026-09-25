/**
 * Which clips a legacy voice pack really has. A legacy pack is one folder per operator in a
 * voice repository (legacy/<source commit>/<charId>/CN_xxx.mp3), recorded before the game
 * replaced the actor, and not every line was recorded then: Exusiai's legacy English folder
 * has 37 of her 38 lines and no CN_043 "Birthday". Without a per-line restriction the
 * operator page offered that line in the legacy pack and played a 404. The builder lists
 * each legacy folder at the adopted repository revision and narrows the line's
 * availablePacks to the packs that hold the file, so the page says "No recording" instead.
 *
 * Current packs are left as they are: their folders are whole-game dumps, found by folder
 * (build-operator-voices.mjs's directory index), and are not listed file by file.
 */
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';

const LEGACY = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/(arkpedia-voice-[a-z]+)\/(?:main|[a-f0-9]{40})\/(legacy\/.+)\/[^/]+$/;

/** A legacy pack's repository and folder, from its template, or null. */
export function legacyFolder(pack) {
  if (pack?.status !== 'legacy' || !pack.audioTemplate) return null;
  const match = pack.audioTemplate.match(LEGACY);
  return match ? { repository: match[1], folder: match[2] } : null;
}

/** The file a pack's template names for a line: the last segment of its address, decoded. */
export function clipFile(pack, lineId) {
  return decodeURIComponent(clipUrl(pack.audioTemplate, lineId).split('/').pop());
}

/**
 * The lines with availablePacks narrowed wherever a listed pack lacks the line's clip:
 * listed with every pack that does record it, and without the ones that do not. `listings`
 * maps a pack id to the file names in its folder; a pack it does not name is taken as
 * complete. A line every listed pack records is returned as it was.
 */
export function restrictToRecordedClips(lines, packs, listings) {
  return lines.map(line => {
    const missing = packs.filter(pack => listings.has(pack.id) && hasRecording(line, pack) && !listings.get(pack.id).has(clipFile(pack, line.id)));
    if (!missing.length) return line;
    return { ...line, availablePacks: packs.filter(pack => hasRecording(line, pack) && !missing.includes(pack)).map(pack => pack.id) };
  });
}

/**
 * The file names in each legacy pack's folder, at the voice repository revision the release
 * adopts (data/assets/revisions.json), by the GitHub contents API. `localIndex` stands in
 * for the API ({ "<repository>/<folder>": [names] }), for tests and offline runs.
 */
export async function listLegacyClips(packs, { revisions, fetcher = fetch, token = process.env.GH_TOKEN, localIndex = null }) {
  const listings = new Map();
  for (const pack of packs) {
    const found = legacyFolder(pack);
    if (!found) continue;
    const key = `${found.repository}/${found.folder}`;
    if (localIndex) {
      if (localIndex[key]) listings.set(pack.id, new Set(localIndex[key]));
      continue;
    }
    const revision = revisions[found.repository];
    if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error(`Missing adopted voice revision: ${found.repository}`);
    const response = await fetcher(`https://api.github.com/repos/arkpedia/${found.repository}/contents/${found.folder.split('/').map(encodeURIComponent).join('/')}?ref=${revision}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Legacy voice folder ${key}: ${response.status} ${response.statusText}`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error(`Legacy voice folder ${key} is not a folder`);
    listings.set(pack.id, new Set(entries.filter(entry => entry.type === 'file').map(entry => entry.name)));
  }
  return listings;
}
