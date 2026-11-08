import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { LyricLine } from '@/lib/music/albumsDataServer';
import { useMusicPlayback } from '@/lib/music/musicPlayerContext';
import { formatSeconds } from '@/lib/ui/formatSeconds';

/**
 * The Now playing view's lyrics (pages/music/index.tsx): the line being sung is marked and kept
 * centred as the song goes on, and a timed line seeks to its moment. The one part of the page
 * that follows the song's clock (lib/music/playbackPosition.ts): it subscribes here, so the
 * page around it renders only when the song or the queue changes.
 */
export default function MusicLyrics({ lyrics, loading, shown, playing }: {
  lyrics: LyricLine[];
  loading: boolean;
  playing: boolean;
  /** Now playing is the view on top: only then is the line centred. */
  shown: boolean;
}) {
  const { currentTime, seeking, readPlaybackTime, handleSeekChange, handleSeekCommit } = useMusicPlayback();

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown && window.location.hash === '#music-lyrics') {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [shown]);

  const timedLyrics = lyrics.some(line => line.time > 0);
  const live = shown && playing && !seeking && timedLyrics;
  // Read the audible clock only while timed lyrics are on screen. React receives
  // a line index, so these samples do not render the lyric list on every tick.
  const subscribe = useCallback((update: () => void) => {
    if (!live) return () => {};
    const timer = window.setInterval(update, 50);
    return () => window.clearInterval(timer);
  }, [live]);
  const activeLineIndex = useSyncExternalStore(subscribe, () => {
    if (!timedLyrics) return -1;
    // A small reading lead during playback. Paused positions and line seeks are exact.
    const at = live ? readPlaybackTime() + 0.15 : currentTime;
    let lo = 0, hi = lyrics.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (lyrics[mid].time <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }, () => -1);

  // Auto-scrolls the active line to center as playback advances
  // (karaoke-style), but a manual scroll pauses that for a few seconds
  // so looking ahead/back at other lyrics isn't immediately fought by
  // the next auto-scroll tick -- same "pause after manual interaction"
  // pattern used elsewhere on this site (e.g. the nav's hover-expand).
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const suppressAutoScrollRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Not while the song list is shown: the player behind it is hidden, and centring its line
    // would scroll the page instead.
    if (suppressAutoScrollRef.current || !shown) return;
    // Honors the reduced-motion preference: the active line still gets
    // centered (that's function, not decoration), just without
    // animating the travel there.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const line = activeLineRef.current;
    const panel = line?.parentElement;
    if (line && panel) panel.scrollTo({ top: panel.scrollTop + line.getBoundingClientRect().top - panel.getBoundingClientRect().top - (panel.clientHeight - line.clientHeight) / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, [activeLineIndex, shown, lyrics]);

  useEffect(() => {
    return () => {
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    };
  }, []);

  function handleLyricsScroll() {
    suppressAutoScrollRef.current = true;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    suppressTimeoutRef.current = setTimeout(() => {
      suppressAutoScrollRef.current = false;
    }, 4000);
  }

  return (
    <div ref={panelRef} id="music-lyrics" className="music-lyrics-scroll" tabIndex={0} role="region" aria-label="Lyrics" onWheel={handleLyricsScroll} onTouchStart={handleLyricsScroll} onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) handleLyricsScroll(); }}>
      {loading ? (
        <p className="hint">Loading lyrics…</p>
      ) : lyrics.length > 0 ? (
        lyrics.map((line, i) => (
          <p
            key={i}
            ref={i === activeLineIndex ? activeLineRef : undefined}
            className={i === activeLineIndex ? 'music-lyric-line active' : 'music-lyric-line'}
          >
            {timedLyrics ? <button type="button" className="btn-bare music-lyric-seek"
              aria-label={`Seek to ${formatSeconds(line.time)}: ${line.text}`}
              aria-current={i === activeLineIndex ? 'true' : undefined}
              onClick={() => { handleSeekChange(line.time); handleSeekCommit(line.time); }}>
              {line.text}
            </button> : line.text}
          </p>
        ))
      ) : (
        <p className="hint">Lyrics couldn&apos;t be loaded.</p>
      )}
    </div>
  );
}
