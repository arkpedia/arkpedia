import { normalizeSearch } from './songSearch';

interface VersionedSong { id: string; title: string; altTitle?: string | null; album?: string | null }
const instrumentalSuffix = /\s*[（(]\s*instrumental(?:\s+version)?\s*[)）]\s*$/i;
const isInstrumental = (song: VersionedSong) => instrumentalSuffix.test(song.title) || instrumentalSuffix.test(song.altTitle ?? '');
const titles = (song: VersionedSong) => [song.title, song.altTitle].filter((title): title is string => !!title)
  .map(title => normalizeSearch(title.replace(instrumentalSuffix, '')));

/** Only pair opposite versions with an exact title and album match; never guess across releases. */
export function findSongVersion<T extends VersionedSong>(current: VersionedSong, songs: readonly T[]): { song: T; label: string } | null {
  const instrumental = isInstrumental(current);
  const names = titles(current);
  const matches = songs.filter(song => song.id !== current.id && isInstrumental(song) !== instrumental
    && !!current.album && normalizeSearch(song.album ?? '') === normalizeSearch(current.album)
    && titles(song).some(title => names.includes(title)));
  return matches.length === 1 ? { song: matches[0], label: instrumental ? 'Play vocal version' : 'Play instrumental version' } : null;
}
