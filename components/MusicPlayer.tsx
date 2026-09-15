import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GAME_PATHS } from '@/lib/minigames/catalogue';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';

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
    isPlaying,
    title,
    videoId,
    volume,
    shuffle,
    repeatMode,
    favorites,
    currentTime,
    duration,
    queue,
    queueIndex,
    shuffleOrder,
    shufflePosition,
    initializePlayer,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleFavorite,
    excludeCopyrighted,
    setExcludeCopyrighted,
    setVolumeLevel,
    handleSeekChange,
    handleSeekCommit,
    setSeeking,
    containerRef,
  } = useMusicPlayer();

  const titleRef = useRef<HTMLAnchorElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const shellRef = useRef<HTMLDivElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  // The queue's own catalog title/altTitle (not YouTube's raw video
  // metadata) is what actually has a meaningful translation pairing --
  // that's what the cross-fade needs. Falls back to YouTube's raw
  // title only if this track somehow isn't in the queue yet (a brief
  // window right as playback starts, before the queue's own lookup
  // catches up).
  const currentQueueTrack = queue.find((t) => t.id === videoId);
  const catalogTitle = currentQueueTrack?.title || title || 'Monster Siren Records';
  const { displayName: crossfadeName, fading } = useCrossFadeTitle(catalogTitle, currentQueueTrack?.altTitle);
  const artist = currentQueueTrack?.artist;
  const displayTitle = ready ? formatTrackLabel(crossfadeName, artist) : 'Loading…';
  const isFav = Boolean(videoId) && favorites.has(videoId);

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
  const onFullPlayerPage = router.pathname === '/music';
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
      if (shellRef.current?.contains(target)) return;
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

  // Only animate the title if it's actually too wide to fit -- measured
  // against the real rendered element, not guessed from character count.
  // Re-measures whenever displayTitle changes, which includes every
  // cross-fade swap (a translated title is often a different length).
  useEffect(() => {
    const el = titleRef.current;
    if (!el) {
      setScrollDistance(0);
      return;
    }
    const diff = el.scrollWidth - el.clientWidth;
    setScrollDistance(diff > 2 ? diff : 0);
  }, [displayTitle, ready, collapsed]);

  // Shuffle/repeat themselves are no longer toggleable from here (that
  // now lives on the full /music player page), but this preview still
  // needs to reflect whichever mode is actually active, since that's
  // controlled globally, not reset just because this widget doesn't
  // expose the buttons anymore.
  const nextQueueTrack =
    repeatMode === 'one'
      ? queue[queueIndex]
      : shuffle && shuffleOrder
      ? queue[shuffleOrder[(shufflePosition + 1) % shuffleOrder.length]]
      : queue[queueIndex + 1] || queue[0];
  const nextTitle = nextQueueTrack ? formatTrackLabel(nextQueueTrack.title, nextQueueTrack.artist) : '';

  return (
    <div className={`music-player${collapsed ? ' collapsed' : ''}`} ref={shellRef} style={router.pathname === GAME_PATHS.music ? { display: 'none' } : undefined}>
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

      <button
        type="button"
        className="music-collapse-toggle"
        onClick={() =>
          setCollapsed((c) => {
            const expanding = c;
            if (expanding) initializePlayer();
            return !c;
          })
        }
        aria-label={collapsed ? 'Expand player' : 'Collapse player'}
      >
        {collapsed ? '♪' : '×'}
      </button>

      {!collapsed && (
        <div className="music-body">
          <div className="music-title-row">
            <div className="music-title-scroll">
              {/* Clicking the title navigates to the full player page
                  (album art + karaoke lyrics + queue), which is also
                  where the song list now lives -- covers what the
                  burger/list button used to do, so that's gone. Only
                  the name portion cross-fades (see .fading below) --
                  the artist suffix stays put, it's not part of the
                  title/altTitle pairing. */}
              <Link prefetch={false}
                ref={titleRef}
                href="/music"
                className={scrollDistance > 0 ? 'music-track-title marquee' : 'music-track-title'}
                style={{ '--scroll-distance': `${scrollDistance}px` } as React.CSSProperties}
                title={displayTitle}
              >
                <span className={fading ? 'music-crossfade-text fading' : 'music-crossfade-text'}>
                  {ready ? crossfadeName : 'Loading…'}
                </span>
                {ready && artist && <span> — {artist}</span>}
              </Link>
            </div>
          </div>

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
              // commit the slider moved while the player itself never
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
            />
            <span className="music-time">{formatTime(duration)}</span>
          </div>

          <div className="music-controls">
            <button
              type="button"
              className={isFav ? 'music-fav-btn active' : 'music-fav-btn'}
              onClick={() => videoId && toggleFavorite(videoId)}
              disabled={!videoId}
              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
              title="Favorite"
            >
              ♥
            </button>
            <button
              type="button"
              className={excludeCopyrighted ? 'music-stream-safe-btn active' : 'music-stream-safe-btn'}
              onClick={() => setExcludeCopyrighted(!excludeCopyrighted)}
              aria-label={excludeCopyrighted ? 'Stream-safe mode on — copyrighted songs hidden' : 'Stream-safe mode off'}
              title="Stream-safe (hide copyrighted songs)"
            >
              ©
            </button>
            <button type="button" onClick={prevTrack} aria-label="Previous track">
              ⏮
            </button>
            <button
              type="button"
              className={starting ? 'music-play-btn loading' : 'music-play-btn'}
              onClick={togglePlay}
              disabled={starting}
              aria-label={starting ? 'Starting…' : isPlaying ? 'Pause' : 'Play'}
            >
              {starting ? '⋯' : isPlaying ? '⏸' : '▶'}
            </button>
            <button type="button" onClick={nextTrack} aria-label="Next track">
              ⏭
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => setVolumeLevel(parseInt(e.target.value, 10))}
              className="music-volume"
              aria-label="Volume"
            />
          </div>

          {nextTitle && <div className="music-next-up">Up next: {nextTitle}</div>}
        </div>
      )}
    </div>
  );
}