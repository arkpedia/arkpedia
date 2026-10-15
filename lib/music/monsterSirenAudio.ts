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
