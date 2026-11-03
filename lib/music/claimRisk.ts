/** A conservative exclusion list for Stream-safe mode, not a statement about ownership
 * or a guarantee that other recordings cannot receive claims. Keep this separate from
 * the catalogue's per-recording flags, which must continue to take precedence.
 */
const FLAGGED_ARTISTS = [
  // Added 2026-11-03 at the maintainer's request after a YouTube Studio report for
  // Perish in Frost, Light and Shadow, Lungmen and Catastrophe. The artist-wide rule
  // is precautionary; the report does not establish claims on every recording.
  ['Yuki Hayashi', 'Hayashi Yuki', '林ゆうき'],
  // Lead artists/performers of existing catalogue exclusions. Broader rules are
  // maintainer-requested precautions, not claims about every collaborator.
  ['DJ Okawari'], ['Ai Ninomiya'], ['Kaori Sawada'], ['Low Roar'], ['Stephanie'],
  ['AIYUE'], ['Rina'], ['Mili'],
  // Maintainer-reported So Long, Adele lobby claims (Misty Memory).
  ['ZOEE'],
] as const;

// Older compact catalogues omit performer credits. Keep the reported recording
// family excluded there too, without flagging every song by its other composers.
const FLAGGED_CIDS = new Set(['048708', '306816', '880333']);
const FLAGGED_VIDEOS = new Set(['585ac0amIH4', 'd5q1_S6lI-0', 'plsjnAiPzl8']);

function normalizeName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, '').toLowerCase();
}

const flaggedNames = new Set(FLAGGED_ARTISTS.flatMap(names => names.map(normalizeName)));

export interface ClaimRiskSong {
  songId?: string;
  cid?: string;
  videoId?: string | null;
  copyright?: boolean;
  artist?: string | null;
  composer?: string | null;
  credits?: readonly { names: readonly string[] }[];
}

export function hasMusicClaimRisk(song: ClaimRiskSong): boolean {
  if (song.copyright) return true;
  if (FLAGGED_CIDS.has(song.cid ?? song.songId ?? '') || FLAGGED_VIDEOS.has(song.videoId ?? '')) return true;
  const names = [song.artist, song.composer, ...(song.credits ?? []).flatMap(credit => credit.names)];
  return names.some(name => typeof name === 'string' && name
    .split(/[,;·&/]|\s+(?:and|feat\.?|featuring|with)\s+/iu)
    .some(part => flaggedNames.has(normalizeName(part))));
}
