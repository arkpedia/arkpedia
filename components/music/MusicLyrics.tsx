import { useEffect, useMemo, useRef } from 'react';
import type { LyricLine } from '@/lib/music/albumsDataServer';
import { useMusicPlayback } from '@/lib/music/musicPlayerContext';
import { lyricPreview } from '@/lib/music/musicPolish';
import { formatSeconds } from '@/lib/ui/formatSeconds';

/**
 * The Now playing view's lyrics (pages/music/index.tsx): the line being sung is marked and kept
 * centred as the song goes on, and a timed line seeks to its moment. The one part of the page
 * that follows the song's clock (lib/music/playbackPosition.ts): it subscribes here, so the
 * page around it renders only when the song or the queue changes.
 */
export default function MusicLyrics({ lyrics, loading, hasLyrics, videoId, expanded, shown }: {
  lyrics: LyricLine[];
  loading: boolean;
  hasLyrics: boolean;
  videoId: string;
  /** The phone's lyrics panel is open (the compact preview otherwise). */
  expanded: boolean;
  /** Now playing is the view on top: only then is the line centred. */
  shown: boolean;
}) {
  const { currentTime, handleSeekChange, handleSeekCommit } = useMusicPlayback();

  // The currently-singing line -- the last line whose own timestamp
  // has already passed, per the actual playback position.
  const activeLineIndex = useMemo(() => {
    if (!lyrics.some(line => line.time > 0)) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, currentTime]);

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
    if (suppressAutoScrollRef.current || !shown || (!expanded && !window.matchMedia('(min-width: 1000px)').matches)) return;
    // Honors the reduced-motion preference: the active line still gets
    // centered (that's function, not decoration), just without
    // animating the travel there.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const line = activeLineRef.current;
    const panel = line?.parentElement;
    if (line && panel) panel.scrollTo({ top: panel.scrollTop + line.getBoundingClientRect().top - panel.getBoundingClientRect().top - (panel.clientHeight - line.clientHeight) / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, [activeLineIndex, shown, expanded]);

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

  const preview = lyricPreview(lyrics, currentTime);
  const timedLyrics = lyrics.some(line => line.time > 0);

  return (
    <div id="music-lyrics" className={`music-lyrics-scroll${expanded ? ' mobile-active' : ' music-lyrics-preview'}`} tabIndex={0} role="region" aria-label="Lyrics" onWheel={handleLyricsScroll} onTouchStart={handleLyricsScroll} onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) handleLyricsScroll(); }}>
      {hasLyrics ? (
        loading ? (
          <p className="hint">Loading lyrics…</p>
        ) : lyrics.length > 0 ? (
          lyrics.map((line, i) => (
            <p
              key={i}
              ref={i === activeLineIndex ? activeLineRef : undefined}
              data-preview={preview.some(entry => entry.line === line) ? 'true' : undefined}
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
        )
      ) : (
        <p className="hint">
          {videoId ? 'No lyrics available for this song.' : 'Pick a track to see its lyrics.'}
        </p>
      )}
    </div>
  );
}
