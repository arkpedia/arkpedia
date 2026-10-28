/** Seconds as m:ss for a player's clock ("3:07"); anything that is not a finite, non-negative
 *  number reads 0:00. One copy for the music player, the transport bar and the voice lines. */
export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
