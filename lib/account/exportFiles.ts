import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { BACKUP_STORES, formatBackup, parseBackup, type ParsedBackup } from './backup';
import { MAX_IMPORT_BYTES } from '@/lib/planner/untrusted';
import { MUSIC_PLAYLISTS_EVENT, MUSIC_PLAYLISTS_KEY, readPlaylists } from '@/lib/music/musicPlaylists';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY, readMusicFavorites } from '@/lib/music/musicFavorites';
import { formatMusicData, parseMusicData } from '@/lib/music/musicData';
import { formatStoryFile, parseStoryFile, readStoryProgress, STORY_PROGRESS_EVENT, STORY_PROGRESS_KEY } from '@/lib/story/storyProgress';

export const EXPORT_NAMES = ['arkpedia-player-data.json', 'arkpedia-music-playlists.json', 'arkpedia-story-progress.json'] as const;
export const MAX_ARCHIVE_BYTES = 3 * MAX_IMPORT_BYTES;
export function exportDataFiles(storage: Pick<Storage, 'getItem'>, now = new Date()): Record<string, string> {
  const separate = new Set([MUSIC_PLAYLISTS_KEY, MUSIC_FAVORITES_KEY, STORY_PROGRESS_KEY]);
  return {
    [EXPORT_NAMES[0]]: formatBackup(storage, now, BACKUP_STORES.filter(store => !separate.has(store.key)).map(store => store.key)),
    [EXPORT_NAMES[1]]: formatMusicData(readPlaylists(storage), [...readMusicFavorites(storage)]),
    [EXPORT_NAMES[2]]: formatStoryFile(readStoryProgress(storage), now),
  };
}
export function exportDataArchive(storage: Pick<Storage, 'getItem'>, now = new Date()): Uint8Array {
  const files = exportDataFiles(storage, now);
  // Ensure what we offer can be imported with the same size/format limits.
  for (const text of Object.values(files)) if (strToU8(text).length > MAX_IMPORT_BYTES) throw new Error('One of your data files is too large to export.');
  parseBackup(files[EXPORT_NAMES[0]]);
  parseMusicData(files[EXPORT_NAMES[1]]);
  parseStoryFile(files[EXPORT_NAMES[2]]);
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
}
/** All three files validate before any storage write. No arbitrary archive entries are inflated. */
export function parseDataArchive(bytes: Uint8Array): ParsedBackup {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('This archive is too large.');
  const seen = new Set<string>();
  let total = 0;
  const files = unzipSync(bytes, { filter: file => {
    total += file.originalSize;
    if (!(EXPORT_NAMES as readonly string[]).includes(file.name) || seen.has(file.name) || file.originalSize > MAX_IMPORT_BYTES || total > MAX_ARCHIVE_BYTES) throw new Error('Choose an Arkpedia export containing the three JSON data files.');
    seen.add(file.name);
    return true;
  } });
  if (seen.size !== 3) throw new Error('The archive must contain player, music and story data.');
  const text = (name: string) => strFromU8(files[name]);
  const player = parseBackup(text(EXPORT_NAMES[0]));
  if (!player || player === 'invalid') throw new Error('The player data file is damaged or unsupported.');
  const music = parseMusicData(text(EXPORT_NAMES[1]));
  const progress = parseStoryFile(text(EXPORT_NAMES[2]));
  if (player.stores.some(store => [MUSIC_PLAYLISTS_KEY, MUSIC_FAVORITES_KEY, STORY_PROGRESS_KEY].includes(store.key))) throw new Error('The player file contains data belonging to another file.');
  return { ...player, stores: [...player.stores,
    { key: MUSIC_PLAYLISTS_KEY, label: 'music playlists', raw: JSON.stringify(music.playlists), event: MUSIC_PLAYLISTS_EVENT },
    ...(music.favorites ? [{ key: MUSIC_FAVORITES_KEY, label: 'music favourites', raw: JSON.stringify(music.favorites), event: MUSIC_FAVORITES_EVENT }] : []),
    { key: STORY_PROGRESS_KEY, label: 'story progress', raw: JSON.stringify(progress), event: STORY_PROGRESS_EVENT },
  ] };
}
