/** A conservative exclusion list for Stream-safe mode, not a statement about ownership
 * or a guarantee that other recordings cannot receive claims. Keep this separate from
 * the catalogue's per-recording flags, which must continue to take precedence.
 */
const FLAGGED_ARTISTS = [
  // Added 2026-11-03 at the maintainer's request after a YouTube Studio report for
  // Perish in Frost, Light and Shadow, Lungmen and Catastrophe. The artist-wide rule
  // is precautionary; the report does not establish claims on every recording.
  ['Yuki Hayashi', 'Hayashi Yuki', '林ゆうき'],
] as const;

function normalizeName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, '').toLowerCase();
}

const flaggedNames = new Set(FLAGGED_ARTISTS.flatMap(names => names.map(normalizeName)));

export interface ClaimRiskSong {
  copyright?: boolean;
  artist?: string | null;
  composer?: string | null;
  credits?: readonly { names: readonly string[] }[];
}

export function hasMusicClaimRisk(song: ClaimRiskSong): boolean {
  if (song.copyright) return true;
  const names = [song.artist, song.composer, ...(song.credits ?? []).flatMap(credit => credit.names)];
  return names.some(name => typeof name === 'string' && name
    .split(/[,;·&/]|\s+(?:and|feat\.?|featuring|with)\s+/iu)
    .some(part => flaggedNames.has(normalizeName(part))));
}
