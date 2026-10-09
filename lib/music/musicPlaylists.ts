/** Portable Arkpedia playlists: stable video IDs in the reader's chosen order. */
export const MUSIC_PLAYLISTS_KEY = 'arkpedia.music-playlists.v1';
export const MUSIC_PLAYLISTS_EVENT = 'arkpediaMusicPlaylistsChanged';
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
      || !item.tracks.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id))) {
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
export function readPlaylists(storage: Pick<Storage, 'getItem'>): MusicPlaylist[] {
  try { return validatePlaylists(JSON.parse(storage.getItem(MUSIC_PLAYLISTS_KEY) ?? '[]')); } catch { return []; }
}
/** Imports are additive. Reimporting the same content is harmless; changed copies get new IDs. */
export function mergePlaylists(existing: MusicPlaylist[], incoming: MusicPlaylist[], newId: () => string): { playlists: MusicPlaylist[]; added: number } {
  const playlists = [...existing];
  for (const item of incoming) {
    if (playlists.some(p => (p.name === item.name || (p.name.startsWith(`${item.name.slice(0, 90)} (`) && / \(\d+\)$/.test(p.name))) && JSON.stringify(p.tracks) === JSON.stringify(item.tracks))) continue;
    let id = item.id;
    while (playlists.some(p => p.id === id)) id = newId();
    let name = item.name;
    let suffix = 2;
    while (playlists.some(p => p.name === name)) name = `${item.name.slice(0, 90)} (${suffix++})`;
    playlists.push({ ...item, id, name });
  }
  validatePlaylists(playlists);
  return { playlists, added: playlists.length - existing.length };
}
