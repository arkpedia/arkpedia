import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllSongModalLookup, writeLyricsFilesToPublic, SongModalLookupEntry } from '@/lib/music/albumsDataServer';
import { withContentPage } from '@/lib/content/server';
import { useContentUrl } from '@/lib/content/context';
import type { LyricLine } from '@/lib/music/albumsDataServer';
import { useMusicPlayer, QueueTrack } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { useQueryState } from '@/lib/hooks/useQueryState';
import MusicWaveVisualizer from '@/components/music/MusicWaveVisualizer';
import MusicPlaylists from '@/components/music/MusicPlaylists';
import SongPlaylistPicker from '@/components/music/SongPlaylistPicker';
import TransportIcon from '@/components/music/TransportIcons';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import XButton from '@/components/ui/XButton';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { hiddenUnless } from '@/lib/ui/inert';

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
// session, from lyrics/{videoId}.json, not embedded in this page's own
// static props.
//
// The address is passed in rather than built here: this is module scope, so it
// cannot read the release from context, and a lyric file belongs to a release the
// same way a stage detail does. A required parameter rather than an optional one
// so a caller cannot quietly fall back to the deploy-time copy. The cache is keyed
// by the resolved URL for the same reason -- a new release must not be answered
// from the previous release's lyrics.
const lyricsCache = new Map<string, LyricLine[]>();
const lyricsPromises = new Map<string, Promise<LyricLine[]>>();
function fetchLyricsFor(url: string): Promise<LyricLine[]> {
  const cached = lyricsCache.get(url);
  if (cached) return Promise.resolve(cached);
  let promise = lyricsPromises.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => res.json())
      .then((lines: LyricLine[]) => {
        lyricsCache.set(url, lines);
        return lines;
      })
      .catch(() => {
        lyricsPromises.delete(url);
        return [];
      });
    lyricsPromises.set(url, promise);
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
  /** Where the dragged song would land if dropped now: the line above or below this row. */
  dropSide: 'before' | 'after' | null;
  onTap: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOverRow: () => void;
  onDragEnd: () => void;
  onPlayNow: () => void;
  onPushToTop: () => void;
  onRemove: () => void;
  isFavorite: boolean;
  onFavorite: () => void;
}

function QueueRow({
  song,
  displayPos,
  isActive,
  isDragging,
  isSelected,
  dropSide,
  onTap,
  onDragStart,
  onDragOverRow,
  onDragEnd,
  onPlayNow,
  onPushToTop,
  onRemove,
  isFavorite,
  onFavorite,
}: QueueRowProps) {
  const { displayName, fading } = useCrossFadeTitle(song.title, song.altTitle);
  return (
    <div
      className={`music-queue-row${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}${isSelected ? ' selected' : ''}${dropSide ? ` drop-${dropSide}` : ''}`}
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
      onDragOver={onDragOverRow}
      onDragEnd={onDragEnd}
    >
      <span className="music-queue-drag-handle" aria-hidden="true">
        ⠿
      </span>
      <span className="music-queue-row-index">{isActive ? '▶' : displayPos + 1}</span>
      <button
        type="button"
        className={fading ? 'btn-bare music-queue-row-title music-crossfade-text fading' : 'btn-bare music-queue-row-title music-crossfade-text'}
        title={song.title}
        onClick={onTap}
        aria-pressed={isSelected}
      >
        {displayName}
      </button>
      <div className="music-queue-row-actions">
        <button type="button" className="ghost music-song-favorite" onClick={onFavorite} aria-pressed={isFavorite}
          aria-label={`${isFavorite ? 'Remove' : 'Add'} ${song.title} ${isFavorite ? 'from' : 'to'} favorites`} title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
          <TransportIcon name="heart" size={18} />
        </button>
        <SongPlaylistPicker song={song} />
        <button type="button" className="ghost" onClick={onPlayNow} aria-label="Play now" title="Play now">
          <TransportIcon name="play" size={14} />
        </button>
        <button type="button" className="ghost" onClick={onPushToTop} disabled={isActive} aria-label="Push to top" title="Push to top">
          ⤒
        </button>
        <XButton
          onClick={onRemove}
          disabled={isActive}
          label="Remove"
          title={isActive ? "Can't remove the currently-playing track" : 'Remove'}
        />
      </div>
    </div>
  );
}

export default function MusicPage({ songLookup }: Props) {
  const contentUrl = useContentUrl();
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
  //
  // With no ?view, the page opens where there is something to do: the player when a
  // track has played this session, the song list when none has -- the player view
  // with nothing loaded was an empty 280px cover beside an empty lyrics column, with
  // the 884 songs one ☰ away. Decided once, on mount (the player context outlives the
  // page, so a track started elsewhere is known here), so the view never swaps under
  // the reader; server and client both start from "nothing played".
  const [viewParam, setViewParam] = useQueryState('view', '');
  const [initialView] = useState<'player' | 'queue'>(() => (videoId ? 'player' : 'queue'));
  const view: 'player' | 'queue' = viewParam === 'queue' || viewParam === 'player' ? viewParam : initialView;
  const setView = (next: 'player' | 'queue') => setViewParam(next);
  const [mobileShowLyrics, setMobileShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);


  const detailByVideoId = useMemo(() => new Map(songLookup.map((s) => [s.videoId, s])), [songLookup]);
  const currentDetail = detailByVideoId.get(videoId);
  const currentTrack = queue.find((t) => t.id === videoId);
  // From this page's release props, like the credits: a lyric file is published for exactly
  // the songs whose lyrics parse, which is what this flag says, so the Lyrics button never
  // offers a file the release does not have.
  const hasLyrics = Boolean(currentDetail?.hasLyrics);

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
    fetchLyricsFor(contentUrl(`/lyrics/${videoId}.json`)).then((lines) => {
      if (!cancelled) {
        setLyrics(lines);
        setLyricsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [videoId, hasLyrics, contentUrl]);

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
    // Not while the song list is shown: the player behind it is hidden, and centring its line
    // would scroll the page instead.
    if (suppressAutoScrollRef.current || view !== 'player') return;
    // Honors the reduced-motion preference: the active line still gets
    // centered (that's function, not decoration), just without
    // animating the travel there.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }, [activeLineIndex, view]);

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
  // The row the dragged song is over, which places the drop line (dropSide).
  const [overPos, setOverPos] = useState<number | null>(null);
  function handleDrop(targetDisplayPos: number) {
    const target = displayList[targetDisplayPos];
    if (dragPos !== null && target && dragPos !== targetDisplayPos) {
      if (shuffle) {
        // Once something's shuffled, rearranging a row rearranges the
        // shuffled PLAY SEQUENCE itself (which song plays 3rd vs 7th),
        // not the underlying catalog order those songs came from.
        reorderShuffleOrder(dragPos, targetDisplayPos);
      } else {
        reorderQueue(dragPos, target.queueIdx);
      }
    }
    setDragPos(null);
    setOverPos(null);
  }
  /* Both reorders take the song out and put it back at the target's index, so one dragged down
     lands after the row it is dropped on and one dragged up before it: the line says which. */
  const dropSide = (displayPos: number): 'before' | 'after' | null =>
    dragPos === null || overPos !== displayPos || dragPos === displayPos ? null : dragPos < displayPos ? 'after' : 'before';
  /* Each list takes the drop, not each row, so the 4px between rows is part of the row the line
     is at: the line does not flicker off between them, and a drop there lands where it shows. */
  const dropZone = {
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => { if (dragPos !== null) e.preventDefault(); },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (overPos !== null) handleDrop(overPos);
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverPos(null);
    },
  };

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

      <PageHeader slim eyebrow="Rhodes Island // Sound Archive" title="Music"
        actions={<><MusicPlaylists songs={songLookup} /><Link prefetch={false} href="/music/discover" className="ghost btn-sm music-discover-btn">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M13 7 L11 11 L7 13 L9 9 Z" strokeLinejoin="round" />
          </svg>
          Discover
        </Link></>} />

      <main className="music-player-page">
        <div className="visually-hidden" aria-live="polite">
          {nowPlayingAnnouncement}
        </div>
        {queueLoading && <p className="hint" role="status">Loading music catalogue…</p>}
        {/* Both views in one place (the Anti-Page Jump rule's swap in place): the player always
            lays out, and so sets the place's height, hidden and inert while the song list lies
            over it. The list is the player's height on the first visit too, before anything has
            played, and the transport bar below never moves. */}
        <div className="music-view">
          <div className={`music-now-playing${view === 'player' ? '' : ' music-now-playing-behind'}`} aria-hidden={view === 'player' ? undefined : true} {...hiddenUnless(view === 'player')}>

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
                <button type="button" className="ghost btn-sm music-mobile-lyrics-btn" onClick={() => setMobileShowLyrics((v) => !v)}>
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

            {/* "Add to Playlist" lived here and only ever answered "Playlists are
                coming soon!": a placeholder, hidden until the feature exists. */}
            <div className="music-now-playing-buttons">
              {youtubeUrl && (
                <a href={youtubeUrl} target="_blank" rel="noreferrer" className="ghost btn-sm music-watch-youtube-btn">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                    <path d="M6 4 L16 10 L6 16 Z" />
                  </svg>
                  Watch on YouTube
                </a>
              )}
            </div>
          </div>
          {view === 'queue' && (
          <div className="music-queue-panel">
            <h2 className="section-title">Songs ({displayList.length})</h2>
            <SearchInput label="Search songs" name="queue-search" placeholder="Search songs…" value={queueSearch} onChange={setQueueSearch} />
            {isSearching ? (
              <>
                <div className="music-queue-list" {...dropZone}>
                  {searchResultRows.map(({ song, queueIdx, displayPos }) => (
                    <QueueRow
                      key={song.id + queueIdx}
                      song={song}
                      isFavorite={favorites.has(song.id)}
                      onFavorite={() => toggleFavorite(song.id)}
                      displayPos={displayPos}
                      isActive={queueIdx === queueIndex && videoId === song.id}
                      isDragging={dragPos === displayPos}
                      isSelected={selected?.pos === displayPos}
                      dropSide={dropSide(displayPos)}
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
                      onDragOverRow={() => setOverPos(displayPos)}
                      onDragEnd={() => { setDragPos(null); setOverPos(null); }}
                      onPlayNow={() => playTrackByVideoId(song.id)}
                      onPushToTop={() => moveQueueItemToTop(queueIdx)}
                      onRemove={() => removeFromQueue(queueIdx)}
                    />
                  ))}
                  {Array.from({ length: searchEmptyCount }, (_, i) => (
                    <div key={`search-empty-${i}`} className="music-queue-row music-queue-row-placeholder" aria-hidden="true" />
                  ))}
                </div>
                <div className="music-queue-list" {...dropZone}>
                  {comingUpRows.map(({ song, queueIdx, displayPos }) => (
                    <QueueRow
                      key={song.id + queueIdx}
                      song={song}
                      isFavorite={favorites.has(song.id)}
                      onFavorite={() => toggleFavorite(song.id)}
                      displayPos={displayPos}
                      isActive={queueIdx === queueIndex && videoId === song.id}
                      isDragging={dragPos === displayPos}
                      isSelected={selected?.pos === displayPos}
                      dropSide={dropSide(displayPos)}
                      onTap={() => handleRowTap(displayPos, queueIdx, song.title)}
                      onDragStart={(e) => {
                        setDragPos(displayPos);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(displayPos));
                      }}
                      onDragOverRow={() => setOverPos(displayPos)}
                      onDragEnd={() => { setDragPos(null); setOverPos(null); }}
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
              <div className="music-queue-list" {...dropZone}>
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
                    isFavorite={favorites.has(song.id)}
                    onFavorite={() => toggleFavorite(song.id)}
                    displayPos={displayPos}
                    isActive={queueIdx === queueIndex && videoId === song.id}
                    isDragging={dragPos === displayPos}
                    isSelected={selected?.pos === displayPos}
                    dropSide={dropSide(displayPos)}
                    onTap={() => handleRowTap(displayPos, queueIdx, song.title)}
                    onDragStart={(e) => {
                      setDragPos(displayPos);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(displayPos));
                    }}
                    onDragOverRow={() => setOverPos(displayPos)}
                    onDragEnd={() => { setDragPos(null); setOverPos(null); }}
                    onPlayNow={() => playTrackByVideoId(song.id)}
                    onPushToTop={() => moveQueueItemToTop(queueIdx)}
                    onRemove={() => removeFromQueue(queueIdx)}
                  />
                ))}
                <LoadOnScroll shown={queueVisibleCount} total={displayListWithPos.length} onMore={() => setQueueVisibleCount((c) => c + QUEUE_PAGE_SIZE)} />
              </div>
            )}
          </div>
          )}
        </div>

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
              className="filter-chip music-fav-btn"
              onClick={() => videoId && toggleFavorite(videoId)}
              disabled={!videoId}
              aria-pressed={isFav}
              aria-label="Favorite"
              title="Favorite"
            >
              <TransportIcon name="heart" />
            </button>
            <button
              type="button"
              className="filter-chip music-stream-safe-btn"
              onClick={() => setExcludeCopyrighted(!excludeCopyrighted)}
              aria-pressed={excludeCopyrighted}
              aria-label="Stream-safe: hide copyrighted songs"
              title="Stream-safe (hide copyrighted songs)"
            >
              <TransportIcon name="streamSafe" />
            </button>
            <button
              type="button"
              className="filter-chip music-shuffle-btn"
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              aria-label="Shuffle"
              title="Shuffle"
            >
              <TransportIcon name="shuffle" />
            </button>
            <button type="button" onClick={prevTrack} aria-label="Previous track">
              <TransportIcon name="prev" />
            </button>
            <button
              type="button"
              className={starting ? 'primary music-play-btn loading' : 'primary music-play-btn'}
              onClick={togglePlay}
              disabled={starting}
              aria-label={starting ? 'Starting…' : isPlaying ? 'Pause' : 'Play'}
            >
              <TransportIcon name={starting ? 'loading' : isPlaying ? 'pause' : 'play'} />
            </button>
            <button type="button" onClick={nextTrack} aria-label="Next track">
              <TransportIcon name="next" />
            </button>
            <button
              type="button"
              className="filter-chip music-repeat-btn"
              onClick={cycleRepeat}
              aria-pressed={repeatMode !== 'off'}
              aria-label={repeatMode === 'off' ? 'Repeat: off' : repeatMode === 'one' ? 'Repeat: one' : 'Repeat: all'}
              title={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'one' ? 'Repeat one' : 'Repeat all'}
            >
              <TransportIcon name="repeat" />{repeatMode === 'one' && <span className="music-repeat-one-badge">1</span>}
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
              className="filter-chip music-list-btn"
              onClick={() => setView(view === 'queue' ? 'player' : 'queue')}
              aria-pressed={view === 'queue'}
              aria-label="Song list"
              title="Song list"
            >
              <TransportIcon name="list" />
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/music", async () => {
  // Written exactly once, here -- see writeLyricsFilesToPublic's own
  // comment in albumsDataServer.ts for why this page specifically, and
  // why writing to public/ from within getStaticProps is safe for a
  // static export build.
  //
  // This body only ever runs while prerendering or in local development:
  // withContentPage serves the published release at runtime, and listing the route
  // in scripts/content/pages.json excludes data/ and public/ from the function's
  // file trace. So the ISR function neither traces the local data tree nor tries to
  // rewrite public/ on Vercel's read-only filesystem -- the two things the previous
  // plain-static version of this page existed to avoid.
  writeLyricsFilesToPublic();
  const songLookup = getAllSongModalLookup();
  return { props: { songLookup } };
});
