import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GAME_PATHS } from '@/lib/minigames/catalogue';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { songTitle, upcomingIndices } from '@/lib/music/musicPolish';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { MSR_LABEL } from '@/lib/music/songArt';
import TransportIcon from './TransportIcons';
import AlbumCover from './AlbumCover';
import { XGlyph } from '@/components/ui/XButton';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// "Title" alone, or "Title — Artist" when an artist credit exists.
function formatTrackLabel(title: string, artist?: string | null): string {
  return artist ? `${title} — ${artist}` : title;
}

export default function MusicPlayer() {
  const {
    ready,
    starting,
    buffering,
    isPlaying,
    notice,
    title,
    videoId,
    shuffle,
    repeatMode,
    favorites,
    currentTime,
    duration,
    queue,
    currentTrack: currentQueueTrack,
    nowPlayingCover,
    nowPlayingArtist,
    queueIndex,
    shuffleOrder,
    shufflePosition,
    initializePlayer,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleFavorite,
    handleSeekChange,
    handleSeekCommit,
    setSeeking,
    containerRef,
  } = useMusicPlayer();

  const [collapsed, setCollapsed] = useState(true);
  const shellRef = useRef<HTMLDivElement>(null);

  // The queue's own catalog title/altTitle (not YouTube's raw video
  // metadata) is what actually has a meaningful translation pairing --
  // that's what the cross-fade needs. Falls back to YouTube's raw
  // title only if this track somehow isn't in the queue yet (a brief
  // window right as playback starts, before the queue's own lookup
  // catches up).

  const catalogTitle = currentQueueTrack?.title || title || 'Monster Siren Records';
  const { displayName: crossfadeName, fading } = useCrossFadeTitle(catalogTitle, currentQueueTrack?.altTitle);
  // The catalogue's artist, else Monster Siren's credit (lib/music/songArt.ts).
  const artist = nowPlayingArtist ?? currentQueueTrack?.artist ?? null;
  const displayTitle = ready ? formatTrackLabel(crossfadeName, artist) : 'Loading…';
  const isFav = Boolean(videoId) && favorites.has(videoId);
  const busy = starting || buffering;

  // Screen-reader announcement when the track changes -- the visible
  // title swap is purely visual, so when the player auto-advances (or
  // the user hits next) nothing is otherwise announced at all. The
  // first track a session ever sees is deliberately seeded WITHOUT
  // announcing: page load / hydration restoring an existing queue
  // shouldn't speak a song title nobody just asked for. This widget is
  // mounted globally (see _app.tsx), including on /music, where the
  // full player page runs its own identical announcer -- so this one
  // stays quiet there to avoid every track change being spoken twice.
  const router = useRouter();
  // The music section (/music and Discover) has its own player bar, which says the song and
  // links back to it; the widget keeps only its hidden audio frame there.
  const onFullPlayerPage = router.pathname === '/music' || router.pathname === '/music/discover';
  /**
   * Collapse when the click lands anywhere else.
   *
   * The player is a fixed panel over the corner of whatever page you are on, so
   * expanded it covers content -- and the only way to shut it was to find the
   * toggle again. Pointerdown rather than click, matching StagePicker and the
   * other popovers, so it closes on the press rather than waiting for the release
   * and eating the first click on whatever is underneath.
   */
  useEffect(() => {
    if (collapsed) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (shellRef.current?.contains(target) || (target instanceof Element && target.closest('[data-music-player-popover]'))) return;
      setCollapsed(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [collapsed]);

  const [nowPlayingAnnouncement, setNowPlayingAnnouncement] = useState('');
  const announcedVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!videoId) return;
    if (announcedVideoIdRef.current === null) {
      announcedVideoIdRef.current = videoId;
      return;
    }
    if (announcedVideoIdRef.current !== videoId) {
      announcedVideoIdRef.current = videoId;
      if (!onFullPlayerPage) setNowPlayingAnnouncement(`Now playing: ${catalogTitle}`);
    }
  }, [videoId, catalogTitle, onFullPlayerPage]);

  // Shuffle/repeat themselves are no longer toggleable from here (that
  // now lives on the full /music player page), but this preview still
  // needs to reflect whichever mode is actually active, since that's
  // controlled globally, not reset just because this widget doesn't
  // expose the buttons anymore.
  const order = shuffle && shuffleOrder ? shuffleOrder : queue.map((_, index) => index);
  const nextQueueTrack = queue[upcomingIndices(order, shuffle && shuffleOrder ? shufflePosition : queueIndex, repeatMode, 1)[0]];
  const nextTitle = nextQueueTrack ? formatTrackLabel(songTitle(nextQueueTrack.title, nextQueueTrack.altTitle), nextQueueTrack.artist) : '';

  return (
    /* On /music the page is the player: the widget keeps only its hidden audio frame
       there, and its ♪ button no longer floats over the page's own transport. It is
       hidden outright on the music guesser, which pauses playback anyway. */
    <div className={`music-player${collapsed ? ' collapsed' : ''}${onFullPlayerPage ? ' music-player-offstage' : ''}`} ref={shellRef}
      data-music-widget={onFullPlayerPage || router.pathname === GAME_PATHS.music ? undefined : ''}
      style={router.pathname === GAME_PATHS.music ? { display: 'none' } : undefined}>
      {/* Audio only -- the actual iframe is sized to 1x1 and pushed
          off-screen, since we just need YouTube's playback engine, not
          its visible player chrome. */}
      <div ref={containerRef} className="music-hidden-frame" />

      {/* Lives OUTSIDE the collapsed-conditional body below on purpose:
          music keeps playing (and advancing) while the widget is
          collapsed, and a live region only announces changes while it's
          actually in the DOM. */}
      <div className="visually-hidden" aria-live="polite">
        {nowPlayingAnnouncement}
      </div>

      {/* Open, the player's collapse is its × (ui-primitives rule 21); collapsed, the
          whole 44px shell is the note that opens it again. One button, so focus stays. */}
      {!onFullPlayerPage && <button
        type="button"
        className={collapsed ? 'btn-bare music-collapse-toggle' : 'btn-x music-collapse-toggle'}
        onClick={() =>
          setCollapsed((c) => {
            const expanding = c;
            if (expanding) initializePlayer();
            return !c;
          })
        }
        aria-label={collapsed ? 'Expand player' : 'Collapse player'}
      >
        {collapsed ? <TransportIcon name="note" size={20} /> : <XGlyph />}
      </button>}

      {!collapsed && !onFullPlayerPage && (
        /* The corner player, open (the maintainer, 2026-10-14: "the small player in the corner
           when on another page needs also some rework"): the /music bar's look in a card. The
           album art and the song, title over artist on one line each, open Now playing; one row
           of icon buttons -- Favourite, Previous, Play, Next, Queue -- each named and with its
           tooltip on hover and focus; the seek bar and its times between the two, as on the
           /music bar. Fixed in the corner, so opening it moves nothing on the page. Add to
           playlist, Stream-safe and the volume are the /music bar's. */
        <div className="music-body">
          <Link prefetch={false} href="/music?view=player" className="music-widget-song" title={displayTitle}
            aria-label={videoId ? `${displayTitle}. Open Now playing` : 'Open Now playing'}>
            <span className="music-widget-cover" aria-hidden="true">
              <AlbumCover coverPath={videoId ? nowPlayingCover : null} size={44} className="music-widget-cover-art" />
            </span>
            <span className="music-widget-text">
              <span className={`music-widget-title music-crossfade-text${fading ? ' fading' : ''}`}>
                {!videoId ? 'Nothing playing yet' : ready ? crossfadeName : 'Loading…'}
              </span>
              <span className="music-widget-artist">{videoId ? artist ?? MSR_LABEL : 'Pick a song in Library or Discover'}</span>
            </span>
          </Link>

          <div className="music-seek-row">
            <span className="music-time">{formatTime(currentTime)}</span>
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
              // Keyboard seeking: arrow keys fire onChange (which only
              // updates the DISPLAYED time, see handleSeekChange) but
              // never any mouse/touch event, so without this keyup
              // the slider moved while the player itself never
              // seeked at all. Guarded to the keys that actually move a
              // range input, so merely tabbing through the slider
              // doesn't trigger a pointless re-seek to the current
              // position (an audible stutter).
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                  handleSeekCommit(parseFloat((e.target as HTMLInputElement).value));
                }
              }}
              className="music-seek"
              aria-label="Seek"
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            />
            <span className="music-time">{formatTime(duration)}</span>
          </div>

          {/* A song that would not start says so here too, until the next Play. */}
          {notice?.playback && <p className="music-widget-notice" role="status">{notice.text}</p>}

          <div className="music-controls">
            <button type="button" className="filter-chip music-fav-btn music-song-favorite" onClick={() => videoId && toggleFavorite(videoId)}
              disabled={!videoId} aria-pressed={isFav} aria-label="Favourite" data-tip={isFav ? 'Unfavourite' : 'Favourite'}>
              <TransportIcon name="heart" />
            </button>
            <div className="music-widget-transport">
              <button type="button" className="music-prev-btn" onClick={prevTrack} aria-label="Previous track" data-tip="Previous">
                <TransportIcon name="prev" />
              </button>
              {/* Loading never shows Pause: the player starting cannot be pressed, a song not yet
                  heard can, to stop it (lib/music/musicPlayerContext.tsx's buffering). */}
              <button type="button" className={busy ? 'primary music-play-btn loading' : 'primary music-play-btn'} onClick={togglePlay}
                disabled={starting} aria-label={busy ? 'Starting…' : isPlaying ? 'Pause' : 'Play'}
                data-tip={starting ? 'Starting…' : buffering ? 'Starting… Press to stop' : isPlaying ? 'Pause' : 'Play'}>
                <TransportIcon name={busy ? 'loading' : isPlaying ? 'pause' : 'play'} />
              </button>
              {/* Its tooltip says what plays next (the queue, shuffle and repeat as they stand). */}
              <button type="button" className="music-next-btn" onClick={nextTrack} aria-label="Next track" data-tip={nextTitle ? `Next: ${nextTitle}` : 'Next'}>
                <TransportIcon name="next" />
              </button>
            </div>
            <Link prefetch={false} href="/music?view=queue" className="ghost filter-chip music-list-btn" aria-label="Queue" data-tip="Queue">
              <TransportIcon name="queue" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}