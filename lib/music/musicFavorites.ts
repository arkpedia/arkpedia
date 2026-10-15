/**
 * The music favourites (the ♥ on the player): track ids (YouTube video ids, or msr:<cid> for a
 * song that plays from Monster Siren, lib/music/trackId.ts), a JSON list in this browser's
 * localStorage. The player (lib/music/musicPlayerContext.tsx) holds them for as long as the
 * site is open, and the Import / export dialog can restore them under it from a backup
 * (lib/account/backup.ts) without reloading the page, so the restore says so with
 * MUSIC_FAVORITES_EVENT and the player reads them again. Before, it kept the set it had read
 * when the page loaded, and its next ♥ wrote that set back over the restored one. Its own
 * module, so the backup does not import the player.
 */
export const MUSIC_FAVORITES_KEY = 'musicFavorites';
export const MUSIC_FAVORITES_EVENT = 'arkpediaMusicFavoritesChanged';

/** The stored favourites; none for anything that is not a list of ids. */
export function readMusicFavorites(storage: Pick<Storage, 'getItem'>): Set<string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(MUSIC_FAVORITES_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}
