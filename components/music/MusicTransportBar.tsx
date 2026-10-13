import Link from 'next/link';
import { useEffect } from 'react';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import AlbumCover from './AlbumCover';
import SongPlaylistPicker from './SongPlaylistPicker';
import TransportIcon from './TransportIcons';
import { MUSIC_VIEW_HREF, type MusicView } from './MusicNav';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** How long a queue action's notice stays up; Clear queue's, with its Undo, a little longer. */
const NOTICE_MS = 5000;
const UNDO_NOTICE_MS = 9000;

/**
 * The music section's player bar, held at the bottom of the window (sticky) on /music and on
 * Discover, so the song playing and the way back to it are always in reach -- the mini player's
 * job on a music app's every screen. Its song names the track and opens Now playing; its Queue
 * button opens the queue. The full bar (/music) also seeks, repeats, shuffles and sets the
 * volume; the compact one (Discover) is the song, Previous, Play and Next, as in a phone app's
 * mini player. A queue action's result (Play next, Add to queue, Clear) shows above the
 * controls for a moment, Clear's with Undo.
 */
export default function MusicTransportBar({ view, compact = false, coverPath, onFullPlayer }: {
  view: MusicView;
  compact?: boolean;
  /** The playing song's album cover, where the page has the release's song details. */
  coverPath?: string | null;
  /** On /music: the transport is part of the player page, and its song name still opens Now playing. */
  onFullPlayer?: boolean;
}) {
  const {
    ready, starting, isPlaying, title, videoId, volume, shuffle, repeatMode, currentTime, duration, queue, favorites,
    excludeCopyrighted, notice, togglePlay, nextTrack, prevTrack, toggleShuffle, cycleRepeat, setVolumeLevel,
    handleSeekChange, handleSeekCommit, setSeeking, toggleFavorite, setExcludeCopyrighted, dismissNotice, undoClearQueue,
  } = useMusicPlayer();
  const currentTrack = queue.find((t) => t.id === videoId);
  const catalogTitle = currentTrack?.title || title || '';
  const { displayName, fading } = useCrossFadeTitle(catalogTitle, currentTrack?.altTitle);
  const isFav = Boolean(videoId) && favorites.has(videoId);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismissNotice, notice.undo ? UNDO_NOTICE_MS : NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, dismissNotice]);

  const song = (
    <div className="music-transport-song">
      <Link href={MUSIC_VIEW_HREF.player} shallow={onFullPlayer} scroll={false} prefetch={false}
        className="btn-bare music-transport-song-link" aria-current={view === 'player' ? 'page' : undefined}
        aria-label={videoId ? `Now playing: ${catalogTitle}${currentTrack?.artist ? `, ${currentTrack.artist}` : ''}. Open Now playing` : 'Open Now playing'}>
        <span className="music-transport-cover" aria-hidden="true">
          {coverPath !== undefined ? <AlbumCover coverPath={coverPath} size={40} className="music-transport-cover-art" /> : <TransportIcon name="note" size={20} />}
        </span>
        <span className="music-transport-song-text">
          <span className={`music-transport-song-title music-crossfade-text${fading ? ' fading' : ''}`}>
            {videoId ? displayName : ready || !starting ? 'Nothing playing yet' : 'Loading…'}
          </span>
          <span className="music-transport-song-sub">
            {videoId ? (currentTrack?.artist ?? 'Monster Siren Records') : 'Pick a song in Library or Discover'}
          </span>
        </span>
      </Link>
    </div>
  );

  const play = (
    <button type="button" className={starting ? 'primary music-play-btn loading' : 'primary music-play-btn'} onClick={togglePlay}
      disabled={starting} aria-label={starting ? 'Starting…' : isPlaying ? 'Pause' : 'Play'}>
      <TransportIcon name={starting ? 'loading' : isPlaying ? 'pause' : 'play'} />
    </button>
  );
  const queueLink = (
    <Link href={MUSIC_VIEW_HREF.queue} shallow={onFullPlayer} scroll={false} prefetch={false}
      className={`ghost filter-chip music-list-btn${view === 'queue' ? ' active' : ''}`} aria-current={view === 'queue' ? 'page' : undefined}
      aria-label="Queue" title="Queue">
      <TransportIcon name="queue" />
    </Link>
  );

  return (
    // On a phone, outside Now playing, the full bar folds to the mini player's one row (CSS,
    // .music-player-bottombar-phone-mini): Library and Queue keep the room for their songs.
    <div className={`music-player-bottombar${compact ? ' music-player-bottombar-compact' : view !== 'player' ? ' music-player-bottombar-phone-mini' : ''}`} role="region" aria-label="Player">
      <div className="music-transport-notice" role="status">
        {notice && <>
          <span>{notice.text}</span>
          {notice.undo
            ? <button type="button" className="ghost btn-sm" onClick={() => { undoClearQueue(); }}>Undo</button>
            : view !== 'queue' && <Link href={MUSIC_VIEW_HREF.queue} shallow={onFullPlayer} scroll={false} prefetch={false} className="ghost btn-sm" onClick={dismissNotice}>View queue</Link>}
        </>}
      </div>
      {compact ? (
        <>
          {/* A line, not a control: seeking is on the full bar. */}
          <div className="music-transport-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          <div className="music-player-bottombar-controls">
            {song}
            <button type="button" className="music-prev-btn" onClick={prevTrack} aria-label="Previous track"><TransportIcon name="prev" /></button>
            {play}
            <button type="button" className="music-next-btn" onClick={nextTrack} aria-label="Next track"><TransportIcon name="next" /></button>
            {queueLink}
          </div>
        </>
      ) : (
        <>
          <div className="music-transport-progress music-transport-progress-phone" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          <div className="music-player-bottombar-seek">
            <span className="music-time music-time-start">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={1}
              value={currentTime}
              onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
              onMouseDown={() => setSeeking(true)}
              onTouchStart={() => setSeeking(true)}
              onMouseUp={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
              // Keyboard seeking: arrow keys fire onChange (which only updates the DISPLAYED time,
              // see handleSeekChange) but never a mouse or touch event, so the keyup commits.
              // Guarded to the keys that move a range input, so tabbing through does not re-seek.
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                  handleSeekCommit(parseFloat((e.target as HTMLInputElement).value));
                }
              }}
              className="music-seek"
              aria-label="Seek"
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            />
            <span className="music-time music-time-end">{formatTime(duration)}</span>
          </div>
          <div className="music-player-bottombar-controls">
            {song}
            <div className="music-transport-buttons">
              <button type="button" className="filter-chip music-fav-btn" onClick={() => videoId && toggleFavorite(videoId)} disabled={!videoId}
                aria-pressed={isFav} aria-label="Favorite" title="Favorite">
                <TransportIcon name="heart" />
              </button>
              <SongPlaylistPicker player song={{ id: videoId || '', title: catalogTitle || 'Monster Siren Records' }} />
              <button type="button" className="filter-chip music-stream-safe-btn" onClick={() => setExcludeCopyrighted(!excludeCopyrighted)}
                aria-pressed={excludeCopyrighted} aria-label="Stream-safe: hide copyrighted songs" title="Stream-safe (hide copyrighted songs)">
                <TransportIcon name="streamSafe" />
              </button>
              <button type="button" className="filter-chip music-shuffle-btn" onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle" title="Shuffle">
                <TransportIcon name="shuffle" />
              </button>
              <button type="button" className="music-prev-btn" onClick={prevTrack} aria-label="Previous track"><TransportIcon name="prev" /></button>
              {play}
              <button type="button" className="music-next-btn" onClick={nextTrack} aria-label="Next track"><TransportIcon name="next" /></button>
              <button type="button" className="filter-chip music-repeat-btn" onClick={cycleRepeat} aria-pressed={repeatMode !== 'off'}
                aria-label={repeatMode === 'off' ? 'Repeat: off' : repeatMode === 'one' ? 'Repeat: one' : 'Repeat: all'}
                title={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'one' ? 'Repeat one' : 'Repeat all'}>
                <TransportIcon name="repeat" />{repeatMode === 'one' && <span className="music-repeat-one-badge">1</span>}
              </button>
              <input type="range" min={0} max={100} step={1} value={volume} onChange={(e) => setVolumeLevel(parseInt(e.target.value, 10))}
                className="music-volume" aria-label="Volume" />
              {queueLink}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
