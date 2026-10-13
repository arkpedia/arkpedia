import { MUSIC_FAVORITES_KEY, readMusicFavorites } from './musicFavorites';
import { isStoredTrackId } from './trackId';

/** Portable Arkpedia playlists: stable track ids (YouTube video ids, or msr:<cid> for a song that
 *  plays from Monster Siren, lib/music/trackId.ts) in the reader's chosen order. */
export const MUSIC_PLAYLISTS_KEY = 'arkpedia.music-playlists.v1';
export const MUSIC_PLAYLISTS_EVENT = 'arkpediaMusicPlaylistsChanged';
export const FAVORITES_PLAYLIST_ID = 'arkpedia-favourites';
export const FAVORITES_PLAYLIST_NAME = 'Favourites';
export const isFavoritesPlaylistName = (name: string) => /^(favourites|favorites)$/i.test(name.trim());
export const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
export interface MusicPlaylist { id: string; name: string; tracks: string[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validatePlaylists(value: unknown): MusicPlaylist[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('A playlist file can hold up to 200 playlists.');
  const ids = new Set<string>();
  let total = 0;
  return value.map(item => {
    if (!object(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100
      || !Array.isArray(item.tracks) || item.tracks.length > 5000
      || !item.tracks.every(isStoredTrackId)) {
      throw new Error('This file contains an invalid playlist.');
    }
    total += item.tracks.length;
    if (total > 50000) throw new Error('Save up to 50,000 songs across your playlists.');
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), tracks: [...new Set(item.tracks as string[])] };
  });
}
export function parsePlaylistFile(text: string): MusicPlaylist[] {
  if (text.length > MAX_PLAYLIST_BYTES) throw new Error('Choose a playlist file smaller than 2 MB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Choose an Arkpedia playlist JSON file.'); }
  if (!object(value) || value.kind !== 'arkpedia-music-playlists' || value.version !== 1) {
    throw new Error('This is not a supported Arkpedia playlist file.');
  }
  return validatePlaylists(value.playlists);
}
export function formatPlaylistFile(playlists: MusicPlaylist[]): string {
  return JSON.stringify({ kind: 'arkpedia-music-playlists', version: 1, playlists: validatePlaylists(playlists) }, null, 2);
}
function readStoredPlaylists(storage: Pick<Storage, 'getItem'>): MusicPlaylist[] {
  try { return validatePlaylists(JSON.parse(storage.getItem(MUSIC_PLAYLISTS_KEY) ?? '[]')); } catch { return []; }
}
/** Favourites is always present and derives its songs from the same storage as the hearts. */
export function readPlaylists(storage: Pick<Storage, 'getItem'>): MusicPlaylist[] {
  return [{ id: FAVORITES_PLAYLIST_ID, name: FAVORITES_PLAYLIST_NAME,
    tracks: [...readMusicFavorites(storage)].filter(isStoredTrackId) },
    ...readStoredPlaylists(storage).filter(p => p.id !== FAVORITES_PLAYLIST_ID)];
}
/** Promote old manually saved favourites once, without losing their songs. */
export function initializeFavoritesPlaylist(storage: Pick<Storage, 'getItem' | 'setItem'>): MusicPlaylist[] {
  let stored: MusicPlaylist[];
  try { stored = validatePlaylists(JSON.parse(storage.getItem(MUSIC_PLAYLISTS_KEY) ?? '[]')); }
  catch { return readPlaylists(storage); } // Never overwrite an unreadable existing store during setup.
  if (stored.some(p => p.id === FAVORITES_PLAYLIST_ID)) return readPlaylists(storage);
  const legacy = stored.filter(p => isFavoritesPlaylistName(p.name));
  const [favorites] = readPlaylists(storage);
  return writePlaylists(storage, [{ ...favorites, tracks: [...new Set([...favorites.tracks, ...legacy.flatMap(p => p.tracks)])] },
    ...stored.filter(p => !isFavoritesPlaylistName(p.name))]);
}
/** Keep the permanent favourites list and hearts together when editing or importing playlists. */
export function writePlaylists(storage: Pick<Storage, 'getItem' | 'setItem'>, next: MusicPlaylist[]): MusicPlaylist[] {
  const lists = validatePlaylists(next);
  const favorites = lists.find(p => p.id === FAVORITES_PLAYLIST_ID) ?? readPlaylists(storage)[0];
  const normalized = validatePlaylists([{ ...favorites, name: FAVORITES_PLAYLIST_NAME }, ...lists.filter(p => p.id !== FAVORITES_PLAYLIST_ID)]);
  storage.setItem(MUSIC_PLAYLISTS_KEY, JSON.stringify(normalized));
  storage.setItem(MUSIC_FAVORITES_KEY, JSON.stringify(favorites.tracks));
  return normalized;
}
/** Append to selected playlists without reordering tracks or adding duplicates. */
export function addSongToPlaylists(existing: MusicPlaylist[], selected: string[], videoId: string): MusicPlaylist[] {
  if (!isStoredTrackId(videoId)) throw new Error('This song could not be saved.');
  if (selected.some(id => !existing.some(p => p.id === id))) throw new Error('A selected playlist no longer exists. Choose another playlist.');
  const ids = new Set(selected);
  return validatePlaylists(existing.map(p => ids.has(p.id) && !p.tracks.includes(videoId) ? { ...p, tracks: [...p.tracks, videoId] } : p));
}
/** Imports are additive. Reimporting the same content is harmless; changed copies get new IDs. */
export function mergePlaylists(existing: MusicPlaylist[], incoming: MusicPlaylist[], newId: () => string): { playlists: MusicPlaylist[]; added: number } {
  const playlists = [...existing];
  let favoritesUpdated = 0;
  for (const item of incoming) {
    if (item.id === FAVORITES_PLAYLIST_ID) {
      const index = playlists.findIndex(p => p.id === FAVORITES_PLAYLIST_ID);
      if (index >= 0) {
        const current = playlists[index];
        const tracks = [...new Set([...current.tracks, ...item.tracks])];
        if (tracks.length !== current.tracks.length) {
          playlists[index] = { ...current, tracks };
          favoritesUpdated = 1;
        }
        continue;
      }
    }
    if (playlists.some(p => (p.name === item.name || (p.name.startsWith(`${item.name.slice(0, 90)} (`) && / \(\d+\)$/.test(p.name))) && JSON.stringify(p.tracks) === JSON.stringify(item.tracks))) continue;
    let id = item.id;
    while (playlists.some(p => p.id === id)) id = newId();
    let name = item.name;
    let suffix = 2;
    while (playlists.some(p => p.name === name)) name = `${item.name.slice(0, 90)} (${suffix++})`;
    playlists.push({ ...item, id, name });
  }
  validatePlaylists(playlists);
  return { playlists, added: playlists.length - existing.length + favoritesUpdated };
}
