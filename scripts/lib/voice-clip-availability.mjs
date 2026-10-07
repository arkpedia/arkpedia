/**
 * Which clips a legacy voice pack really has. A legacy pack is one folder per operator in a
 * voice repository (legacy/<source commit>/<charId>/CN_xxx.mp3), recorded before the game
 * replaced the actor, and not every line was recorded then: Exusiai's legacy English folder
 * has 37 of her 38 lines and no CN_043 "Birthday". Without a per-line restriction the
 * operator page offered that line in the legacy pack and played a 404. The builder lists
 * each legacy folder at the adopted repository revision and narrows the line's
 * availablePacks to the packs that hold the file, so the page says "No recording" instead.
 *
 * An operator's current packs are left as they are: their folders are whole-game dumps, found
 * by folder (build-operator-voices.mjs's directory index), and are not listed file by file.
 * An outfit's voice set is (listFolderClips): a handful of folders per run, which says which
 * of its lines each folder records and which recordings its table gives no line at all
 * (unlistedRecordings) -- Luo Xiaohei's Elite 2 set lists 27 lines, and its folders hold 38.
 */
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';

const FOLDER = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/(arkpedia-voice-[a-z]+)\/(?:main|[a-f0-9]{40})\/((?:current|legacy)\/.+)\/[^/]+$/;

/** A pack's repository and folder, from its template, or null. The folder is decoded
 * (current/char_311_mudrok#1): the template percent-encodes an outfit's '#'. */
export function packFolder(pack) {
  if (!pack?.audioTemplate) return null;
  const match = pack.audioTemplate.match(FOLDER);
  return match ? { repository: match[1], folder: match[2].split('/').map(decodeURIComponent).join('/') } : null;
}

/** A legacy pack's repository and folder, from its template, or null. */
export function legacyFolder(pack) {
  return pack?.status === 'legacy' ? packFolder(pack) : null;
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
 * The recordings in a voice set's listed folders that none of its lines plays, as Unused rows
 * shaped like the operator's own (build-operator-voices.mjs's unusedLines), each offered in the
 * packs whose folder holds it. Luo Xiaohei's Elite 2 set (char_4067_lolxh#1): its table lists
 * the 27 home-screen lines, and its folders hold all 38 clips, the in-battle and tap lines
 * recorded again but never played in the game. Only a file that names a voice line becomes a
 * row (cn_020.mp3 is CN_020): Red Countess's folders also hold her skills' sounds (fx_023.mp3
 * and the like), which are no line. `titleOf` names a row by its voice id (CN_020), or
 * returns nothing for the "Unused recording CN_020" fallback.
 */
export function unlistedRecordings(lines, packs, listings, titleOf = () => null) {
  const found = new Map();
  for (const pack of packs) {
    if (!listings.has(pack.id)) continue;
    const offered = new Set(lines.map(line => clipFile(pack, line.id)));
    for (const file of listings.get(pack.id)) {
      const match = /^cn_(\d+.*)\.mp3$/i.exec(file);
      if (!match || offered.has(file)) continue;
      const id = `CN_${match[1]}`;
      found.set(id, [...(found.get(id) ?? []), pack.id]);
    }
  }
  return [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, available], index) => {
    return {
      id,
      title: titleOf(id) || `Unused recording ${id}`,
      text: null,
      category: 'unused',
      status: 'unused',
      unlock: null,
      order: 2000 + index,
      availablePacks: [...new Set(available)].sort(),
    };
  });
}

/**
 * The file names in each legacy pack's folder, at the voice repository revision the release
 * adopts (data/assets/revisions.json), by the GitHub contents API. `localIndex` stands in
 * for the API ({ "<repository>/<folder>": [names] }), for tests and offline runs.
 */
export function listLegacyClips(packs, options) {
  return listClips(packs, legacyFolder, options);
}

/** The same for every pack, current ones too: an outfit's voice set (see the top). */
export function listFolderClips(packs, options) {
  return listClips(packs, packFolder, options);
}

/** The contents API's address for a voice folder at a revision, each segment encoded once. */
export function folderListingUrl(repository, folder, revision) {
  return `https://api.github.com/repos/arkpedia/${repository}/contents/${folder.split('/').map(encodeURIComponent).join('/')}?ref=${revision}`;
}

async function listClips(packs, folderOf, { revisions, fetcher = fetch, token = process.env.GH_TOKEN, localIndex = null }) {
  const listings = new Map();
  for (const pack of packs) {
    const found = folderOf(pack);
    if (!found) continue;
    const key = `${found.repository}/${found.folder}`;
    if (localIndex) {
      if (localIndex[key]) listings.set(pack.id, new Set(localIndex[key]));
      continue;
    }
    const revision = revisions[found.repository];
    if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error(`Missing adopted voice revision: ${found.repository}`);
    const response = await fetcher(folderListingUrl(found.repository, found.folder, revision), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Voice folder ${key}: ${response.status} ${response.statusText}`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error(`Voice folder ${key} is not a folder`);
    listings.set(pack.id, new Set(entries.filter(entry => entry.type === 'file').map(entry => entry.name)));
  }
  return listings;
}
