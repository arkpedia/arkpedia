// Monster Siren song ids are digits (six, so far). Checked before the id goes into the
// upstream address, so nothing but a song id can ever reach it.
export const SONG_ID = /^\d{1,12}$/;

/**
 * Monster Siren's signed address for a song's audio (the song guesser's route and the player's,
 * pages/api/music-guesser and pages/api/music-audio). An answer is taken only when Monster Siren
 * says it is that song (code 0, the same cid) and its audio is https on Monster Siren's own CDN
 * (*.hycdn.cn), which is exactly what its public API gives anyone. Throws otherwise.
 */
export async function monsterSirenAudioUrl(id: string): Promise<URL> {
  if (!SONG_ID.test(id)) throw new Error('Unknown song');
  const response = await fetch(`https://monster-siren.hypergryph.com/api/song/${id}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Song source unavailable');
  const data = await response.json();
  const url = new URL(data.data?.sourceUrl);
  if (data.code !== 0 || String(data.data?.cid) !== id || url.protocol !== 'https:' || !url.hostname.endsWith('.hycdn.cn')) throw new Error('Invalid audio source');
  return url;
}

/** A signed address names when it stops working: `https://res01.hycdn.cn/<token>/<expiry>/siren/
 *  audio/...`, the expiry a Unix time in eight hex digits, three hours after the address was given
 *  (2026-10-22: 6ADA815C, 21:34:20 UTC, for an address given at 18:34:20). */
const SIGNED_PATH = /^\/[0-9a-f]{32}\/([0-9a-f]{8})\//i;
const LONGEST_LIFE_MS = 24 * 60 * 60 * 1000;

/** When a signed address (monsterSirenAudioUrl) expires, in milliseconds, or null for anything
 *  else: not https on Monster Siren's CDN, no expiry in its path, or an expiry already past or more
 *  than a day away (so a changed format is never trusted, and kept, for longer than it should). */
export function audioLinkExpiry(href: string, now: number): number | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const match = SIGNED_PATH.exec(url.pathname);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.hycdn.cn') || !match) return null;
  const expires = parseInt(match[1], 16) * 1000;
  return expires > now && expires - now <= LONGEST_LIFE_MS ? expires : null;
}
