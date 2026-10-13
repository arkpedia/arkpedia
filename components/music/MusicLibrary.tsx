import { useEffect, useMemo, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { loadMusicCatalogue, MUSIC_CATALOGUE_PATH, type MusicCatalogueSong } from '@/lib/music/musicCatalogue';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SongActionsMenu from './SongActionsMenu';
import SongPlaylistPicker from './SongPlaylistPicker';
import TransportIcon from './TransportIcons';

/**
 * A Library row. Its title plays the song now (the queue plays on after it); Play next and Add to
 * queue put it in "Next in queue" without stopping the song playing. A phone gets the same
 * actions in one menu (SongActionsMenu).
 */
function LibraryRow({ song, position }: { song: MusicCatalogueSong; position: number }) {
  const { favorites, toggleFavorite, videoId, queued, playNow, queueSong } = useMusicPlayer();
  const { displayName, fading } = useCrossFadeTitle(song.title, song.altTitle);
  const track = { id: song.videoId, title: song.title };
  const favorite = favorites.has(song.videoId);
  const playing = videoId === song.videoId;
  const isQueued = queued.has(song.videoId);
  return <div className={`music-queue-row music-library-row${playing ? ' active' : ''}`} data-song-id={song.videoId}>
    <span className="music-queue-row-index">{playing ? <TransportIcon name="play" size={12} /> : position + 1}</span>
    <button type="button" className={`btn-bare music-queue-row-title music-crossfade-text${fading ? ' fading' : ''}`}
      aria-label={playing ? `${song.title}, playing now` : `Play ${song.title} now`} title={playing ? 'Playing now' : 'Play now'}
      onClick={() => playNow(song.videoId)}>
      {displayName}
      {song.artist && <span className="music-library-row-artist"> · {song.artist}</span>}
    </button>
    {isQueued && <span className="music-library-queued">Queued</span>}
    <div className="music-queue-row-actions music-song-desktop-actions">
      {/* Written, so Play next, Add to queue and Add to playlist cannot be taken for each other;
          the song playing has no queue actions (nothing to line up after itself). */}
      {!playing && <>
        <button type="button" className="ghost music-row-text-btn" onClick={() => void queueSong(song.videoId, 'next')} aria-label={`Play next: ${song.title}`}>
          <TransportIcon name="playNext" size={16} />Play next
        </button>
        <button type="button" className="ghost music-row-text-btn" onClick={() => void queueSong(song.videoId, 'last')} aria-label={`Add to queue: ${song.title}`}>
          <TransportIcon name="addToQueue" size={16} />Add to queue
        </button>
      </>}
      <button type="button" className="ghost music-song-favorite" aria-pressed={favorite} onClick={() => toggleFavorite(song.videoId)}
        aria-label={`Favourite: ${song.title}`} title={favorite ? 'Unfavourite' : 'Favourite'}>
        <TransportIcon name="heart" size={18} />
      </button>
      <SongPlaylistPicker song={track} text />
    </div>
    <div className="music-queue-row-actions music-song-mobile-actions">
      <SongActionsMenu song={track} isFavorite={favorite} isActive={playing} onFavorite={() => toggleFavorite(song.videoId)}
        onPlayNow={() => playNow(song.videoId)} onQueueNext={() => void queueSong(song.videoId, 'next')}
        onQueueLast={() => void queueSong(song.videoId, 'last')} />
    </div>
  </div>;
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
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (songs ?? []).filter(song => !(excludeCopyrighted && song.copyright)
      && (scope === 'all' || favorites.has(song.videoId))
      && (!q || song.title.toLowerCase().includes(q) || song.altTitle?.toLowerCase().includes(q) || song.artist?.toLowerCase().includes(q)));
  }, [songs, search, excludeCopyrighted, scope, favorites]);
  useEffect(() => { setVisible(50); }, [search, excludeCopyrighted, scope]);
  const total = songs ? songs.filter(song => !(excludeCopyrighted && song.copyright)).length : null;
  return <section className="music-queue-panel music-library" aria-labelledby="music-library-heading">
    <div className="music-song-list-heading">
      <h2 className="section-title" id="music-library-heading">Library{total !== null && <span className="music-heading-count"> · {total} songs</span>}</h2>
      <SegmentedControl label="Library songs" value={scope} onChange={setScope}
        options={[{ value: 'all', label: 'All songs' }, { value: 'favorites', label: 'Favourites' }]} />
    </div>
    <SearchInput label="Search all songs" name="library-search" placeholder="Search songs or artists…" value={search} onChange={setSearch} />
    <div className="music-song-list music-all-songs-list" aria-label={scope === 'all' ? 'All songs' : 'Favourite songs'} data-library-list>
      {error ? <p className="hint" role="status">Could not load songs. <button type="button" className="ghost btn-sm" onClick={() => setAttempt(n => n + 1)}>Try again</button></p>
        : !songs ? <p className="hint" role="status">Loading all songs…</p>
          : !matches.length ? <p className="hint">{scope === 'favorites' && !search.trim() ? 'No favourites yet: press ♥ on a song to keep it here.' : 'No songs match your search.'}</p> : null}
      {matches.slice(0, visible).map((song, position) => <LibraryRow key={song.videoId} song={song} position={position} />)}
      {shown && <LoadOnScroll shown={visible} total={matches.length} onMore={() => setVisible(n => n + 50)} />}
    </div>
  </section>;
}
