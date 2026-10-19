import { useEffect, useMemo, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { loadMusicCatalogue, MUSIC_CATALOGUE_PATH, type MusicCatalogueSong } from '@/lib/music/musicCatalogue';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { createSongIndex } from '@/lib/music/songSearch';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SongRow from './SongRow';

/**
 * A Library row (components/music/SongRow.tsx). Pressing it plays the song now (the queue plays on
 * after it); Play next and Add to queue put it in "Next in queue" without stopping the song
 * playing. The song playing has no queue actions (nothing to line up after itself).
 */
function LibraryRow({ song }: { song: MusicCatalogueSong }) {
  const { favorites, toggleFavorite, noAutoplay, toggleNoAutoplay, videoId, queued, playNow, queueSong } = useMusicPlayer();
  const playing = videoId === song.id;
  return <SongRow marker="music-library-row" song={{ id: song.id, title: song.title, altTitle: song.altTitle, artist: song.artist, album: song.album, cover: song.cover }}
    active={playing} queued={queued.has(song.id)} onPlay={() => playNow(song.id)}
    actions={{
      playNow: () => playNow(song.id),
      playNext: playing ? undefined : () => void queueSong(song.id, 'next'),
      addToQueue: playing ? undefined : () => void queueSong(song.id, 'last'),
      favorite: { on: favorites.has(song.id), toggle: () => toggleFavorite(song.id) },
      noAutoplay: { on: noAutoplay.has(song.id), toggle: () => toggleNoAutoplay(song.id) },
      playlist: true,
    }} />;
}

/**
 * Every song in the release's catalogue, searchable, apart from the queue: browsing and searching
 * here never change what plays. Loaded the first time the Library is opened, then kept (the view
 * stays mounted, hidden, so its search and scroll survive a trip to the queue and back).
 */
export default function MusicLibrary({ shown }: { shown: boolean }) {
  const contentUrl = useContentUrl();
  const { excludeCopyrighted, favorites } = useMusicPlayer();
  const [songs, setSongs] = useState<MusicCatalogueSong[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(50);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'favorites'>('all');
  const url = contentUrl(MUSIC_CATALOGUE_PATH);
  const [requested, setRequested] = useState(false);
  useEffect(() => { if (shown) setRequested(true); }, [shown]);
  useEffect(() => {
    if (!requested || songs) return;
    const controller = new AbortController();
    setError(false);
    loadMusicCatalogue(url, controller.signal).then(setSongs).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [requested, songs, url, attempt]);
  // Title, album (English and its own name) and artist, typo-tolerant, best match first
  // (lib/music/songSearch.ts); built once per catalogue, not per keystroke.
  const index = useMemo(() => createSongIndex(songs ?? [], song => song), [songs]);
  const matches = useMemo(() => index.search(search).filter(song => !(excludeCopyrighted && song.copyright)
    && (scope === 'all' || favorites.has(song.id))), [index, search, excludeCopyrighted, scope, favorites]);
  useEffect(() => { setVisible(50); }, [search, excludeCopyrighted, scope]);
  const total = songs ? songs.filter(song => !(excludeCopyrighted && song.copyright)).length : null;
  return <section className="music-queue-panel music-library" aria-labelledby="music-library-heading">
    <div className="music-song-list-heading">
      <h2 className="section-title" id="music-library-heading">Library{total !== null && <span className="music-heading-count"> · {total} songs</span>}</h2>
      <SegmentedControl label="Library songs" value={scope} onChange={setScope}
        options={[{ value: 'all', label: 'All songs' }, { value: 'favorites', label: 'Favourites' }]} />
    </div>
    <SearchInput label="Search all songs" name="library-search" placeholder="Search songs, albums or artists…" value={search} onChange={setSearch} />
    <div className="music-song-list music-all-songs-list" aria-label={scope === 'all' ? 'All songs' : 'Favourite songs'} data-library-list>
      {error ? <p className="hint" role="status">Could not load songs. <button type="button" className="ghost btn-sm" onClick={() => setAttempt(n => n + 1)}>Try again</button></p>
        : !songs ? <p className="hint" role="status">Loading all songs…</p>
          : !matches.length ? <p className="hint">{scope === 'favorites' && !search.trim() ? 'No favourites yet: press ♥ on a song to keep it here.' : 'No songs match your search.'}</p> : null}
      {matches.slice(0, visible).map(song => <LibraryRow key={song.id} song={song} />)}
      {shown && <LoadOnScroll shown={visible} total={matches.length} onMore={() => setVisible(n => n + 50)} />}
    </div>
  </section>;
}
