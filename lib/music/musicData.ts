import { formatPlaylistFile, parsePlaylistFile, type MusicPlaylist } from './musicPlaylists';

/** The playlist format stays compatible with existing playlist imports. */
export function formatMusicData(playlists: MusicPlaylist[], favorites: string[]): string {
  return JSON.stringify({ ...JSON.parse(formatPlaylistFile(playlists)), favorites }, null, 2);
}
export function parseMusicData(text: string): { playlists: MusicPlaylist[]; favorites: string[] | null } {
  const playlists = parsePlaylistFile(text);
  const value = JSON.parse(text);
  if (value.favorites === undefined) return { playlists, favorites: null };
  if (!Array.isArray(value.favorites) || value.favorites.length > 50000 || !value.favorites.every((id: unknown) => typeof id === 'string' && id.length <= 200)) throw new Error('This file contains invalid music favorites.');
  return { playlists, favorites: [...new Set<string>(value.favorites)] };
}
