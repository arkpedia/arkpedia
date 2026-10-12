import { useEffect, useMemo, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { loadMusicCatalogue, MUSIC_CATALOGUE_PATH, type MusicCatalogueSong } from '@/lib/music/musicCatalogue';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import SongActionsMenu from './SongActionsMenu';
import SongPlaylistPicker from './SongPlaylistPicker';
import TransportIcon from './TransportIcons';

function SongRow({ song, position }: { song: MusicCatalogueSong; position: number }) {
  const { favorites, toggleFavorite, videoId, playTrackByVideoId } = useMusicPlayer();
  const { displayName, fading } = useCrossFadeTitle(song.title, song.altTitle);
  const track = { id: song.videoId, title: song.title };
  const favorite = favorites.has(song.videoId);
  return <div className={`music-queue-row${videoId === song.videoId ? ' active' : ''}`} data-song-id={song.videoId}>
    <span className="music-queue-row-index">{videoId === song.videoId ? '▶' : position + 1}</span>
    <button type="button" className={`btn-bare music-queue-row-title music-crossfade-text${fading ? ' fading' : ''}`}
      title={song.title} onClick={() => playTrackByVideoId(song.videoId)}>{displayName}</button>
    <div className="music-queue-row-actions music-song-desktop-actions">
      <button type="button" className="ghost music-song-favorite" aria-pressed={favorite} onClick={() => toggleFavorite(song.videoId)}
        aria-label={`${favorite ? 'Remove' : 'Add'} ${song.title} ${favorite ? 'from' : 'to'} favorites`} title={favorite ? 'Remove from favorites' : 'Add to favorites'}>
        <TransportIcon name="heart" size={18} />
      </button>
      <SongPlaylistPicker song={track} />
    </div>
    <div className="music-queue-row-actions music-song-mobile-actions">
      <SongActionsMenu song={track} isFavorite={favorite} onFavorite={() => toggleFavorite(song.videoId)} />
    </div>
  </div>;
}

/** Browse the release catalogue without loading it into the playback queue. */
export default function AllSongsList({ search, shown }: { search: string; shown: boolean }) {
  const contentUrl = useContentUrl();
  const { excludeCopyrighted } = useMusicPlayer();
  const [songs, setSongs] = useState<MusicCatalogueSong[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(50);
  const url = contentUrl(MUSIC_CATALOGUE_PATH);
  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    setError(false);
    loadMusicCatalogue(url, controller.signal).then(setSongs).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [shown, url, attempt]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (songs ?? []).filter(song => !(excludeCopyrighted && song.copyright)
      && (!q || song.title.toLowerCase().includes(q) || song.altTitle?.toLowerCase().includes(q) || song.artist?.toLowerCase().includes(q)));
  }, [songs, search, excludeCopyrighted]);
  useEffect(() => { setVisible(50); }, [search, excludeCopyrighted]);
  return <div className="music-queue-list music-all-songs-list" hidden={!shown} aria-label="All songs">
    {error ? <p className="hint" role="status">Could not load songs. <button type="button" className="ghost btn-sm" onClick={() => setAttempt(n => n + 1)}>Try again</button></p>
      : !songs ? <p className="hint" role="status">Loading all songs…</p>
        : !matches.length ? <p className="hint">No songs match your search.</p> : null}
    {matches.slice(0, visible).map((song, position) => <SongRow key={song.videoId} song={song} position={position} />)}
    {shown && <LoadOnScroll shown={visible} total={matches.length} onMore={() => setVisible(n => n + 50)} />}
  </div>;
}
