import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllSongModalLookup, writeLyricsFilesToPublic, SongModalLookupEntry } from '@/lib/music/albumsDataServer';
import type { LyricLine } from '@/lib/music/albumsDataServer';
import { useMusicPlayer, QueueTrack } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { useQueryState } from '@/lib/hooks/useQueryState';
import MusicWaveVisualizer from '@/components/music/MusicWaveVisualizer';

interface Props {
  songLookup: SongModalLookupEntry[];
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Displays the role exactly as it appears in the source JSON (artist,
// performer, composer, arranger, producer, lyrics), just capitalized
// -- not translated into different wording (e.g. "Singer" for
// "artist"), which was the actual bug: it made the label look
// disconnected from what's really in the data.
function formatRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// Module-level per-song cache -- same pattern as SongDetailModal.tsx
// used before it: each song's lyrics are fetched at most once per
// session, from public/lyrics/{videoId}.json (written at build time),
// not embedded in this page's own static props.
const lyricsCache = new Map<string, LyricLine[]>();
const lyricsPromises = new Map<string, Promise<LyricLine[]>>();
function fetchLyricsFor(videoId: string): Promise<LyricLine[]> {
  const cached = lyricsCache.get(videoId);
  if (cached) return Promise.resolve(cached);
  let promise = lyricsPromises.get(videoId);
  if (!promise) {
    promise = fetch(`/lyrics/${videoId}.json`)
      .then((res) => res.json())
      .then((lines: LyricLine[]) => {
        lyricsCache.set(videoId, lines);
        return lines;
      })
      .catch(() => {
        lyricsPromises.delete(videoId);
        return [];
      });
    lyricsPromises.set(videoId, promise);
  }
  return promise;
}

// Extracted from the queue list's .map() specifically so each row can
// call useCrossFadeTitle independently -- React hooks can't be called
// inside a loop/callback, only at a component's own top level, so each
// row needs to genuinely BE its own component instance.
interface QueueRowProps {
  song: QueueTrack;
  displayPos: number;
  isActive: boolean;
  isDragging: boolean;
  isSelected: boolean;
  onTap: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onPlayNow: () => void;
  onPushToTop: () => void;
  onRemove: () => void;
}

function QueueRow({
  song,
  displayPos,
  isActive,
  isDragging,
  isSelected,
  onTap,
  onDragStart,
  onDrop,
  onDragEnd,
  onPlayNow,
  onPushToTop,
  onRemove,
}: QueueRowProps) {
  const { displayName, fading } = useCrossFadeTitle(song.title, song.altTitle);
  return (
    <div
      className={`music-queue-row${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}${isSelected ? ' selected' : ''}`}
      draggable
      // Both drag AND tap-select are always wired up, on every device
      // -- feature-detecting "is this a touch device" turned out
      // unreliable across specific browser/device combinations, so
      // rather than debug detection blind, there's simply no gate to
      // fail: native drag only ever actually fires from a mouse
      // anyway (touch browsers largely don't generate drag events at
      // all, so draggable is harmless-but-inert there), and the
      // two-step select-then-swap gesture is safe to leave on
      // everywhere since it's deliberate (needs a second tap to
      // actually move anything), not an instant single-tap reorder.
      // The tap itself lives on the TITLE (a real <button> below), not
      // on this div: the row also contains the play/top/remove
      // buttons, so making the div itself a click target (let alone
      // role="button") would nest interactive controls inside an
      // interactive control -- unreachable for keyboards, ambiguous
      // for screen readers. The div only handles drag, which has no
      // keyboard equivalent anyway; keyboard reordering goes through
      // the title button's two-tap gesture instead.
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="music-queue-drag-handle" aria-hidden="true">
        ⠿
      </span>
      <span className="music-queue-row-index">{isActive ? '▶' : displayPos + 1}</span>
      <button
        type="button"
        className={fading ? 'music-queue-row-title music-crossfade-text fading' : 'music-queue-row-title music-crossfade-text'}
        title={song.title}
        onClick={onTap}
        aria-pressed={isSelected}
      >
        {displayName}
      </button>
      <div className="music-queue-row-actions">
        <button type="button" className="ghost" onClick={onPlayNow} aria-label="Play now" title="Play now">
          ▶
        </button>
        <button type="button" className="ghost" onClick={onPushToTop} disabled={isActive} aria-label="Push to top" title="Push to top">
          ⤒
        </button>
        <button
          type="button"
          className="ghost"
          onClick={onRemove}
          disabled={isActive}
          aria-label="Remove"
          title={isActive ? "Can't remove the currently-playing track" : 'Remove'}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function MusicPage({ songLookup }: Props) {
  const {
    ready,
    starting,
    isPlaying,
    title,
    videoId,
    volume,
    shuffle,
    repeatMode,
    currentTime,
    duration,
    queue,
    queueLoading,
    queueIndex,
    shuffleOrder,
    shufflePosition,
    favorites,
    excludeCopyrighted,
    initializePlayer,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleShuffle,
    cycleRepeat,
    setVolumeLevel,
    handleSeekChange,
    handleSeekCommit,
    setSeeking,
    playTrackByVideoId,
    reorderQueue,
    reorderShuffleOrder,
    moveQueueItemToTop,
    removeFromQueue,
    toggleFavorite,
    setExcludeCopyrighted,
  } = useMusicPlayer();

  // The YouTube player otherwise only starts initializing on an
  // explicit action elsewhere (pressing play, expanding the mini-
  // player) -- visiting this dedicated page is a clear enough signal
  // of intent to start it proactively instead of leaving "Now Playing"
  // stuck on "Loading..." until something else triggers it.
  useEffect(() => {
    initializePlayer();
  }, [initializePlayer]);

  // Mirrored into the URL (?view=queue) so the queue view survives a
  // reload and can be linked to directly -- the hook applies the URL's
  // value only after hydration, so first paint is always the default
  // player view (hydration-safe). Anything other than the exact string
  // 'queue' falls back to the player, so a mangled URL can't render a
  // broken in-between state.
  const [viewParam, setViewParam] = useQueryState('view', 'player');
  const view: 'player' | 'queue' = viewParam === 'queue' ? 'queue' : 'player';
  const setView = (next: 'player' | 'queue') => setViewParam(next);
  const [mobileShowLyrics, setMobileShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  // "Add to Playlist" is a placeholder for now -- clicking it just
  // shows a brief "coming soon" notice rather than doing anything
  // real yet. Deliberately separate from the existing favorite heart
  // (which already works, persisted to localStorage) -- playlists are
  // a genuinely different, not-yet-built feature.
  const [showPlaylistToast, setShowPlaylistToast] = useState(false);
  const playlistToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleAddToPlaylist() {
    setShowPlaylistToast(true);
    if (playlistToastTimeoutRef.current) clearTimeout(playlistToastTimeoutRef.current);
    playlistToastTimeoutRef.current = setTimeout(() => setShowPlaylistToast(false), 3000);
  }
  useEffect(() => {
    return () => {
      if (playlistToastTimeoutRef.current) clearTimeout(playlistToastTimeoutRef.current);
    };
  }, []);

  const detailByVideoId = useMemo(() => new Map(songLookup.map((s) => [s.videoId, s])), [songLookup]);
  const currentDetail = detailByVideoId.get(videoId);
  const currentTrack = queue.find((t) => t.id === videoId);
  const hasLyrics = Boolean(currentTrack?.hasLyrics);

  // If the currently-playing song has no lyrics, force back to the
  // album art view. Without this, a listener viewing lyrics for one
  // song who then advances (or auto-advances) into a song with none
  // gets stuck: mobileShowLyrics stays true, the lyrics panel keeps
  // showing (now just "No lyrics available"), and the only button that
  // could toggle it back only renders when hasLyrics is true -- so it
  // vanishes right when it's needed most, with the panel showing
  // itself but nothing on it and no way out.
  useEffect(() => {
    if (!hasLyrics) setMobileShowLyrics(false);
  }, [hasLyrics]);

  // Fetch (or reuse the cached) lyrics whenever the playing song
  // changes -- not on every render, and not preloaded for the whole
  // catalog.
  useEffect(() => {
    if (!videoId || !hasLyrics) {
      setLyrics([]);
      return;
    }
    let cancelled = false;
    setLyricsLoading(true);
    fetchLyricsFor(videoId).then((lines) => {
      if (!cancelled) {
        setLyrics(lines);
        setLyricsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [videoId, hasLyrics]);

  // The currently-singing line -- the last line whose own timestamp
  // has already passed, per the actual playback position.
  const activeLineIndex = useMemo(() => {
    if (lyrics.length === 0) return -1;
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
    if (suppressAutoScrollRef.current) return;
    // Honors the reduced-motion preference: the active line still gets
    // centered (that's function, not decoration), just without
    // animating the travel there.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }, [activeLineIndex]);

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

  const isFav = Boolean(videoId) && favorites.has(videoId);
  const youtubeUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
  const catalogTitle = currentTrack?.title || title || 'Monster Siren Records';
  const { displayName: nowPlayingName, fading: titleFading } = useCrossFadeTitle(catalogTitle, currentTrack?.altTitle);

  // Screen-reader announcement when the track changes -- the visible
  // title swap is purely visual, so when playback auto-advances (or
  // the user hits next) nothing is otherwise announced at all. The
  // first track a session sees is deliberately seeded WITHOUT
  // announcing: page load / hydration picking up an already-loaded
  // queue shouldn't speak a song title nobody just asked for. (The
  // global mini player runs the same announcer everywhere else, but
  // stays quiet on this page specifically so track changes here are
  // spoken exactly once -- see components/MusicPlayer.tsx.)
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
      setNowPlayingAnnouncement(`Now playing: ${catalogTitle}`);
    }
  }, [videoId, catalogTitle]);

  // Queue display + drag-and-drop reordering (disabled while shuffle
  // is on, same as the old up/down buttons were -- queue POSITION
  // doesn't mean the same thing while shuffled).
  const displayList =
    shuffle && shuffleOrder ? shuffleOrder.map((queueIdx) => ({ song: queue[queueIdx], queueIdx })) : queue.map((song, queueIdx) => ({ song, queueIdx }));

  // Tracked by DISPLAY position (position within displayList), not
  // queue index -- when shuffled, that's what dragging one visual row
  // onto another actually corresponds to (see handleDrop below). When
  // not shuffled, display position and queue index are the same thing
  // anyway, so this still works correctly either way.
  const [dragPos, setDragPos] = useState<number | null>(null);
  function handleDrop(targetDisplayPos: number, targetQueueIdx: number) {
    if (dragPos !== null && dragPos !== targetDisplayPos) {
      if (shuffle) {
        // Once something's shuffled, rearranging a row rearranges the
        // shuffled PLAY SEQUENCE itself (which song plays 3rd vs 7th),
        // not the underlying catalog order those songs came from.
        reorderShuffleOrder(dragPos, targetDisplayPos);
      } else {
        reorderQueue(dragPos, targetQueueIdx);
      }
    }
    setDragPos(null);
  }

  // Tap-to-select, tap-again-to-swap -- reordering via a plain click,
  // available on every device (see QueueRow's own comment on why this
  // doesn't need to be gated to touch specifically). Regardless of
  // which of the two songs gets tapped first,
  // whichever one sits LATER in the list always ends up moving to
  // occupy the EARLIER one's position (shifting everything between
  // down by one) -- never the reverse. That keeps the gesture's result
  // predictable regardless of tap order, rather than needing the user
  // to remember "select the one that should move first."
  const [selected, setSelected] = useState<{ pos: number; queueIdx: number; title: string } | null>(null);
  function handleRowTap(displayPos: number, queueIdx: number, title: string) {
    if (!selected) {
      setSelected({ pos: displayPos, queueIdx, title });
      return;
    }
    if (selected.pos === displayPos) {
      setSelected(null); // tapped the same song again -- cancel
      return;
    }
    const tapped = { pos: displayPos, queueIdx, title };
    const [laterEntry, earlierEntry] = selected.pos > tapped.pos ? [selected, tapped] : [tapped, selected];
    if (shuffle) {
      reorderShuffleOrder(laterEntry.pos, earlierEntry.pos);
    } else {
      reorderQueue(laterEntry.queueIdx, earlierEntry.queueIdx);
    }
    setSelected(null);
  }

  const MAX_ROWS = 5;

  // displayPos attached explicitly here, BEFORE any slicing happens
  // below -- once search results and Coming Up become subsets of this
  // list, each row still needs to carry its TRUE position in the full
  // queue, not whatever local index it happens to land at within a
  // slice (which would silently point every button/drag action at the
  // wrong song).
  const displayListWithPos = displayList.map((entry, displayPos) => ({ ...entry, displayPos }));

  // Paginates the default (non-search) full queue view -- with shuffle
  // covering close to the whole ~900-song catalog, rendering every row
  // at once meant mounting ~900 QueueRow instances simultaneously,
  // each running its own independent useCrossFadeTitle timer. That's
  // not a network/bandwidth cost, but it is real ongoing client-side
  // work on every visitor's device for rows nobody's even scrolled to
  // yet. "Show more" only mounts what's actually been asked for.
  const QUEUE_PAGE_SIZE = 50;
  const [queueVisibleCount, setQueueVisibleCount] = useState(QUEUE_PAGE_SIZE);
  const visibleFullQueue = displayListWithPos.slice(0, queueVisibleCount);

  // Search: purely a DISPLAY concern, doesn't touch queueIdx/displayPos
  // at all, so every row action (play/push-to-top/push-to-bottom/
  // remove) keeps operating on the real underlying queue positions
  // regardless of what's currently filtered. Always reserves 5 rows'
  // worth of space (real results, or empty placeholders) -- including
  // before you've typed anything at all, so starting to type doesn't
  // itself cause a layout jump.
  const [queueSearch, setQueueSearch] = useState('');
  const isSearching = queueSearch.trim().length > 0;
  const searchResultRows = useMemo(() => {
    if (!isSearching) return [];
    const q = queueSearch.trim().toLowerCase();
    return displayListWithPos
      .filter(({ song }) => song.title.toLowerCase().includes(q) || (song.altTitle && song.altTitle.toLowerCase().includes(q)))
      .slice(0, MAX_ROWS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, shuffleOrder, shuffle, queueSearch, isSearching]);
  const searchEmptyCount = MAX_ROWS - searchResultRows.length;

  // Coming Up: the currently-playing song plus the next four, in
  // whatever order actually plays next (shuffled or not) -- always
  // visible, independent of search. Dragging a row FROM the search
  // results ABOVE into one of these slots works with zero extra
  // logic: both sections are just different slices of the exact same
  // displayListWithPos, addressed by the same real queueIdx/displayPos
  // pairs, so the existing handleDrop already handles moving a song
  // from anywhere in the catalog into a specific near-term position
  // (e.g. making a search result the 2nd or 3rd thing that plays next).
  const currentDisplayPos = shuffle && shuffleOrder ? shufflePosition : queueIndex;
  const comingUpRows = displayListWithPos.slice(currentDisplayPos, currentDisplayPos + MAX_ROWS);
  const comingUpEmptyCount = MAX_ROWS - comingUpRows.length;

  return (
    <>
      <Head><title>Music — Arkpedia</title></Head>

      <main className="music-player-page">
        {/* This page renders no visible page title (the layout IS the
            title, visually), but assistive tech still needs an h1 to
            anchor the heading outline -- the h2s below ("Songs (…)",
            the now-playing song name) otherwise dangle off nothing. */}
        <h1 className="visually-hidden">Music</h1>
        <div className="visually-hidden" aria-live="polite">
          {nowPlayingAnnouncement}
        </div>
        {queueLoading && <p className="hint" role="status">Loading music catalogue…</p>}
        {view === 'queue' && (
          <div className="music-player-topbar">
            <button type="button" className="ghost music-back-btn" onClick={() => setView('player')}>
              ‹ Back
            </button>
          </div>
        )}

        {view === 'player' ? (
          <div className="music-now-playing">
            <Link prefetch={false} href="/music/discover" className="ghost music-discover-btn">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="10" cy="10" r="7.5" />
                <path d="M13 7 L11 11 L7 13 L9 9 Z" strokeLinejoin="round" />
              </svg>
              Discover
            </Link>

            <div className={`music-now-playing-cover-col${mobileShowLyrics ? ' mobile-hidden' : ''}`}>
              <div className="music-now-playing-cover">
                {currentDetail?.coverPath ? (
                  <Image src={currentDetail.coverPath} alt={currentDetail.albumName || title} fill sizes="280px" style={{ objectFit: 'cover' }} />
                ) : (
                  <span className="music-now-playing-cover-fallback">♪</span>
                )}
              </div>
            </div>

            <div className={`music-now-playing-song-info${mobileShowLyrics ? ' mobile-hidden' : ''}`}>
              <h2>
                <span className={titleFading ? 'music-crossfade-text fading' : 'music-crossfade-text'}>
                  {ready ? nowPlayingName : 'Loading…'}
                </span>
              </h2>
              <div className="music-now-playing-credits">
                {currentDetail?.credits && currentDetail.credits.length > 0 ? (
                  currentDetail.credits.map((c) => (
                    <span key={c.role}>
                      <b>{formatRoleLabel(c.role)}:</b> {c.names.join(', ')}
                    </span>
                  ))
                ) : (
                  /* Before anything is playing there is no song to be missing
                     credits FOR, and "not available" read as a failed load on a
                     page that had simply not been asked for anything yet. */
                  <span className="hint">
                    {videoId ? 'No credit information available.' : 'Pick a track to see its credits.'}
                  </span>
                )}
              </div>
            </div>

            {/* Fixed row -- always visible regardless of the mobile
                lyrics toggle below, since it sits between the two
                things that toggle (cover+info vs. lyrics) in DOM/grid
                order, not inside either of them. Add to Playlist and
                Watch on YouTube deliberately AREN'T here -- they stay
                paired together below the lyrics instead, see the
                "buttons" row further down. */}
            <div className="music-now-playing-actions">
              {hasLyrics && (
                <button type="button" className="ghost music-mobile-lyrics-btn" onClick={() => setMobileShowLyrics((v) => !v)}>
                  {mobileShowLyrics ? '‹ Back' : 'Lyrics'}
                </button>
              )}
            </div>

            <div className={`music-lyrics-scroll${mobileShowLyrics ? ' mobile-active' : ''}`} onScroll={handleLyricsScroll}>
              {hasLyrics ? (
                lyricsLoading ? (
                  <p className="hint">Loading lyrics…</p>
                ) : lyrics.length > 0 ? (
                  lyrics.map((line, i) => (
                    <p
                      key={i}
                      ref={i === activeLineIndex ? activeLineRef : undefined}
                      className={i === activeLineIndex ? 'music-lyric-line active' : 'music-lyric-line'}
                    >
                      {line.text}
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

            {isPlaying && <MusicWaveVisualizer volume={volume} className={mobileShowLyrics ? 'mobile-active' : ''} />}

            <div className="music-now-playing-buttons">
              <div className="music-add-playlist-wrap">
                <button type="button" className="ghost music-action-btn music-add-playlist-btn" onClick={handleAddToPlaylist}>
                  + Add to Playlist
                </button>
                {/* role="status" makes the toast an implicit polite live
                    region -- it appears far from the button in the
                    accessibility tree, so without it a screen-reader
                    user who clicks gets no feedback at all. */}
                {showPlaylistToast && (
                  <div className="music-toast" role="status">
                    Playlists are coming soon!
                  </div>
                )}
              </div>
              {youtubeUrl && (
                <a href={youtubeUrl} target="_blank" rel="noreferrer" className="ghost music-action-btn music-watch-youtube-btn">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                    <path d="M6 4 L16 10 L6 16 Z" />
                  </svg>
                  Watch on YouTube
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="music-queue-panel">
            <h2>Songs ({displayList.length})</h2>
            <input
              type="search"
              name="queue-search"
              className="music-queue-search"
              placeholder="Search songs…"
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
              aria-label="Search songs"
              autoComplete="off"
              spellCheck={false}
            />
            {isSearching ? (
              <>
                <div className="music-queue-list">
                  {searchResultRows.map(({ song, queueIdx, displayPos }) => (
                    <QueueRow
                      key={song.id + queueIdx}
                      song={song}
                      displayPos={displayPos}
                      isActive={queueIdx === queueIndex && videoId === song.id}
                      isDragging={dragPos === displayPos}
                      isSelected={selected?.pos === displayPos}
                      onTap={() => handleRowTap(displayPos, queueIdx, song.title)}
                      onDragStart={(e) => {
                        setDragPos(displayPos);
                        // Firefox (and to a lesser extent some other
                        // browsers) require at least one setData call
                        // during dragstart, or the drag never actually
                        // initiates at all.
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(displayPos));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(displayPos, queueIdx);
                      }}
                      onDragEnd={() => setDragPos(null)}
                      onPlayNow={() => playTrackByVideoId(song.id)}
                      onPushToTop={() => moveQueueItemToTop(queueIdx)}
                      onRemove={() => removeFromQueue(queueIdx)}
                    />
                  ))}
                  {Array.from({ length: searchEmptyCount }, (_, i) => (
                    <div key={`search-empty-${i}`} className="music-queue-row music-queue-row-placeholder" aria-hidden="true" />
                  ))}
                </div>
                <div className="music-queue-list">
                  {comingUpRows.map(({ song, queueIdx, displayPos }) => (
                    <QueueRow
                      key={song.id + queueIdx}
                      song={song}
                      displayPos={displayPos}
                      isActive={queueIdx === queueIndex && videoId === song.id}
                      isDragging={dragPos === displayPos}
                      isSelected={selected?.pos === displayPos}
                      onTap={() => handleRowTap(displayPos, queueIdx, song.title)}
                      onDragStart={(e) => {
                        setDragPos(displayPos);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(displayPos));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(displayPos, queueIdx);
                      }}
                      onDragEnd={() => setDragPos(null)}
                      onPlayNow={() => playTrackByVideoId(song.id)}
                      onPushToTop={() => moveQueueItemToTop(queueIdx)}
                      onRemove={() => removeFromQueue(queueIdx)}
                    />
                  ))}
                  {Array.from({ length: comingUpEmptyCount }, (_, i) => (
                    <div key={`comingup-empty-${i}`} className="music-queue-row music-queue-row-placeholder" aria-hidden="true" />
                  ))}
                </div>
              </>
            ) : (
              <div className="music-queue-list">
                {/* Same quiet .hint treatment as the discover page's
                    no-results message -- without it, "Songs (0)" sits
                    above a silent void and reads like the list simply
                    failed to load rather than being genuinely empty. */}
                {displayListWithPos.length === 0 && (
                  <p className="hint">Nothing in the queue right now. Head over to Discover to find something to play.</p>
                )}
                {visibleFullQueue.map(({ song, queueIdx, displayPos }) => (
                  <QueueRow
                    key={song.id + queueIdx}
                    song={song}
                    displayPos={displayPos}
                    isActive={queueIdx === queueIndex && videoId === song.id}
                    isDragging={dragPos === displayPos}
                    isSelected={selected?.pos === displayPos}
                    onTap={() => handleRowTap(displayPos, queueIdx, song.title)}
                    onDragStart={(e) => {
                      setDragPos(displayPos);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(displayPos));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(displayPos, queueIdx);
                    }}
                    onDragEnd={() => setDragPos(null)}
                    onPlayNow={() => playTrackByVideoId(song.id)}
                    onPushToTop={() => moveQueueItemToTop(queueIdx)}
                    onRemove={() => removeFromQueue(queueIdx)}
                  />
                ))}
                {queueVisibleCount < displayListWithPos.length && (
                  <button
                    type="button"
                    className="ghost music-queue-show-more"
                    onClick={() => setQueueVisibleCount((c) => c + QUEUE_PAGE_SIZE)}
                  >
                    Show more ({displayListWithPos.length - queueVisibleCount} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="music-player-bottombar">
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
            <span className="music-time music-time-end">{formatTime(duration)}</span>
          </div>

          <div className="music-player-bottombar-controls">
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
            <button
              type="button"
              className={shuffle ? 'music-shuffle-btn active' : 'music-shuffle-btn'}
              onClick={toggleShuffle}
              aria-label="Toggle shuffle"
              title="Shuffle"
            >
              ⤨
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
            <button
              type="button"
              className={repeatMode !== 'off' ? 'music-repeat-btn active' : 'music-repeat-btn'}
              onClick={cycleRepeat}
              aria-label="Cycle repeat mode"
              title={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'one' ? 'Repeat one' : 'Repeat all'}
            >
              ↻{repeatMode === 'one' && <sup className="music-repeat-one-badge">1</sup>}
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
            <button
              type="button"
              className={view === 'queue' ? 'music-list-btn active' : 'music-list-btn'}
              onClick={() => setView(view === 'queue' ? 'player' : 'queue')}
              aria-label="Song list"
              title="Song list"
            >
              ☰
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  // Written exactly once, here -- see writeLyricsFilesToPublic's own
  // comment in albumsDataServer.ts for why this page specifically, and
  // why writing to public/ from within getStaticProps is safe for a
  // static export build.
  writeLyricsFilesToPublic();
  const songLookup = getAllSongModalLookup();
  return { props: { songLookup }, revalidate: 1500 };
};
