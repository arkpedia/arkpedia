import { useRouter } from 'next/router';
import { isQueuePanelOpen, queuePanelHref } from '@/lib/music/queuePanelHref';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import AlbumCover from './AlbumCover';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import TransportIcon from './TransportIcons';
import { MUSIC_VIEW_HREF, type MusicView } from './MusicNav';
import PlayerMoreMenu from './PlayerMoreMenu';
import SeekBar from './SeekBar';
import VolumeControl from './VolumeControl';
import { MSR_LABEL } from '@/lib/music/songArt';
import { minimizeMusicPlayer, playerIsVisible, usePlayerVisibility } from '@/lib/music/playerVisibility';
import BackgroundMusicNowPlaying from './BackgroundMusicNowPlaying';
import { songTitle } from '@/lib/music/musicPolish';


/** How long a queue action's notice stays up; Clear queue's, with its Undo, a little longer. */
const NOTICE_MS = 5000;
const UNDO_NOTICE_MS = 9000;
// Music pages know the release's lyric files. Carry that public availability to
// the shared transport when navigating elsewhere in the same document.
const knownLyrics = new Map<string, boolean>();

/** One transport across Music views and ordinary pages. Only the viewport changes
 * its arrangement; navigation and minimizing never reload the persistent audio host. */
export default function MusicTransportBar({ view, coverPath, onFullPlayer, hasLyrics, lyricsExpanded, onToggleLyrics }: {
  view: MusicView;
  /** The playing song's album cover, where the page has the release's song details. */
  coverPath?: string | null;
  /** On /music: the transport is part of the player page, and its song name still opens Now playing. */
  onFullPlayer?: boolean;
  hasLyrics?: boolean;
  lyricsExpanded?: boolean;
  onToggleLyrics?: () => void;
}) {
  const {
    ready, starting, buffering, isPlaying, title, videoId, volume, shuffle, repeatMode, favorites,
    currentTrack, upcomingTrack, nowPlayingCover, nowPlayingArtist, excludeCopyrighted, notice, togglePlay, nextTrack, prevTrack, toggleShuffle, cycleRepeat, setVolumeLevel, toggleMute,
    noAutoplay, toggleNoAutoplay, toggleFavorite, setExcludeCopyrighted, dismissNotice, undoClearQueue,
  } = useMusicPlayer();
  const wide = useMediaQuery('(min-width: 1000px)');
  const router = useRouter();
  const onMusicPage = router.pathname === '/music' || router.pathname === '/music/discover';
  const visible = playerIsVisible(usePlayerVisibility(), onMusicPage, Boolean(videoId) && (isPlaying || starting || buffering));
  const panelOpen = isQueuePanelOpen(router);
  const queueHref = queuePanelHref(router, !panelOpen);
  const queueLabel = panelOpen ? 'Close queue' : 'Queue';
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    const main = bar?.closest('main') ?? document.querySelector('main');
    if (!main) return;
    const measure = () => {
      const height = `${visible && bar ? bar.getBoundingClientRect().height : 0}px`;
      main.style.setProperty('--music-bar-height', height);
      if (root.style.getPropertyValue('--music-bar-height') !== height) root.style.setProperty('--music-bar-height', height);
      const view = main.querySelector('.music-view');
      if (view) main.style.setProperty('--music-view-top', `${view.getBoundingClientRect().top + window.scrollY}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (bar) observer.observe(bar);
    const header = main.previousElementSibling;
    if (header) observer.observe(header);
    const nav = main.querySelector('.music-nav');
    if (nav) observer.observe(nav);
    // Desktop commits its spacer height after publishing --nav-h. Its flow change
    // moves the view without resizing the page header or music tabs.
    document.querySelectorAll('.site-nav-spacer, .mobile-nav-spacer').forEach(spacer => observer.observe(spacer));
    const rootStyle = new MutationObserver(measure);
    rootStyle.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    if (main.parentElement) rootStyle.observe(main.parentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); rootStyle.disconnect(); window.removeEventListener('resize', measure); main.style.removeProperty('--music-bar-height'); main.style.removeProperty('--music-view-top'); root.style.removeProperty('--music-bar-height'); };
  }, [visible, router.pathname]);
  const catalogTitle = currentTrack?.title || title || '';
  const { displayName, fading } = useCrossFadeTitle(catalogTitle, currentTrack?.altTitle);
  const isFav = Boolean(videoId) && favorites.has(videoId);
  // The page's cover for the song where it has one, else the player's fallback (lib/music/songArt.ts).
  const cover = videoId ? coverPath || nowPlayingCover || null : coverPath;
  const artist = nowPlayingArtist ?? currentTrack?.artist ?? null;
  const showLyrics = hasLyrics ?? knownLyrics.get(videoId) ?? false;
  useEffect(() => { if (videoId && hasLyrics !== undefined) knownLyrics.set(videoId, hasLyrics); }, [videoId, hasLyrics]);

  useEffect(() => {
    // A song that would not start says so until the next Play (musicPlayerContext's STUCK_NOTICE).
    if (!notice || notice.playback) return;
    const timer = window.setTimeout(dismissNotice, notice.undo ? UNDO_NOTICE_MS : NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, dismissNotice]);

  const song = (
    <div className="music-transport-song">
      <Link href={wide && !videoId ? MUSIC_VIEW_HREF.library : MUSIC_VIEW_HREF.player} shallow={onFullPlayer} scroll={false} prefetch={false}
        className="btn-bare music-transport-song-link" aria-current={view === 'player' ? 'page' : undefined}
        aria-label={videoId ? `Now playing: ${catalogTitle}${artist ? `, ${artist}` : ''}. Open Now playing` : wide ? 'Choose a song in Library' : 'Open Now playing'}>
        <span className="music-transport-cover" aria-hidden="true">
          {cover !== undefined ? <AlbumCover coverPath={cover} size={40} className="music-transport-cover-art" /> : <TransportIcon name="note" size={20} />}
        </span>
        <span className="music-transport-song-text">
          <span className={`music-transport-song-title music-crossfade-text${fading ? ' fading' : ''}`}>
            {videoId ? displayName : ready || !starting ? 'Nothing playing yet' : 'Loading…'}
          </span>
          <span className="music-transport-song-sub">
            {videoId ? (artist ?? MSR_LABEL) : wide ? 'Choose a song in Library' : 'Pick a song in Library or Discover'}
          </span>
        </span>
      </Link>
    </div>
  );

  // Loading (the player starting, or a song not yet heard) shows the loading look and never
  // Pause; the player's own start-up cannot be pressed, a loading song can, to stop it.
  const busy = starting || buffering;
  const play = (
    <button type="button" className={busy ? 'primary music-play-btn loading' : 'primary music-play-btn'} onClick={togglePlay}
      disabled={starting} aria-label={busy ? 'Starting…' : isPlaying ? 'Pause' : 'Play'} title={buffering && !starting ? 'Starting… Press to stop' : undefined}>
      <TransportIcon name={busy ? 'loading' : isPlaying ? 'pause' : 'play'} />
    </button>
  );
  const favorite = (
    <button type="button" className="filter-chip btn-icon music-fav-btn music-song-favorite music-transport-fav-phone" disabled={!videoId} aria-pressed={isFav}
      aria-label="Favourite" title={isFav ? 'Unfavourite' : 'Favourite'} onClick={() => videoId && toggleFavorite(videoId)}><TransportIcon name="heart" /></button>
  );
  const queueLink = (
    <Link id="music-transport-queue" aria-haspopup="dialog"
      aria-expanded={panelOpen} aria-controls={panelOpen ? 'music-queue-popup' : undefined}
      href={queueHref} shallow scroll={false} prefetch={false} onClick={event => event.currentTarget.focus({ preventScroll: true })}
      className={`ghost filter-chip music-list-btn${panelOpen ? ' active' : ''}`}
      aria-label={queueLabel} title={queueLabel}>
      <TransportIcon name="queue" />
    </Link>
  );

  const shuffleButton = <button type="button" className="filter-chip music-shuffle-btn" onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle" title="Shuffle"><TransportIcon name="shuffle" /></button>;
  const repeatButton = <button type="button" className="filter-chip music-repeat-btn" onClick={cycleRepeat} aria-pressed={repeatMode !== 'off'}
            aria-label={`Repeat: ${repeatMode}`} title={`Repeat: ${repeatMode}`}><TransportIcon name="repeat" />{repeatMode === 'one' && <span className="music-repeat-one-badge">1</span>}</button>;
  const blockButton = <button type="button" className="ghost filter-chip btn-icon music-dislike-btn" disabled={!videoId} aria-pressed={Boolean(videoId) && noAutoplay.has(videoId)}
    aria-label="Don't autoplay this song" title={videoId && noAutoplay.has(videoId) ? 'Let autoplay play it' : "Don't autoplay"}
    onClick={() => videoId && toggleNoAutoplay(videoId)}><TransportIcon name="noAutoplay" /></button>;
  const safeButton = <button type="button" className="filter-chip btn-icon music-stream-safe-btn" onClick={() => setExcludeCopyrighted(!excludeCopyrighted)}
    aria-pressed={excludeCopyrighted} aria-label="Stream-safe: hide copyrighted songs" title="Stream-safe"><TransportIcon name="streamSafe" /></button>;
  if (!visible) return null;
  return (
    <div ref={barRef} className="music-player-bottombar" role="region" aria-label="Player" data-minimizable={!onMusicPage || undefined} data-empty={!videoId || undefined}
      onKeyDown={event => {
        if (onMusicPage || event.key !== 'Escape' || event.defaultPrevented || panelOpen || (event.target as Element).closest('[role="dialog"]')) return;
        event.stopPropagation(); minimizeMusicPlayer();
      }}>
      <div className="music-transport-notice" role="status">
        {notice && <>
          <span>{notice.text}</span>
          {notice.playback ? null : notice.undo
            ? <button type="button" className="ghost btn-sm" onClick={() => { undoClearQueue(); }}>Undo</button>
            : !panelOpen && <Link href={queuePanelHref(router)} shallow scroll={false} prefetch={false} className="ghost btn-sm" onClick={dismissNotice}>View queue</Link>}
        </>}
      </div>
      <BackgroundMusicNowPlaying />
      <div className="music-transport-song-row">{song}
        {wide && favorite}
        {wide && blockButton}
        {showLyrics && (!wide && view === 'player' && onToggleLyrics ? <button type="button"
          className="ghost filter-chip music-list-btn music-lyrics-link" aria-label="Lyrics"
          title={lyricsExpanded ? 'Collapse lyrics' : 'Expand lyrics'} aria-pressed={Boolean(lyricsExpanded)}
          aria-expanded={Boolean(lyricsExpanded)} aria-controls="music-lyrics" onClick={onToggleLyrics}><TransportIcon name="lyrics" /></button>
          : <Link href="/music?view=player#music-lyrics" shallow={onFullPlayer}
          onClick={event => {
            if (view !== 'player' || panelOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const lyrics = document.getElementById('music-lyrics');
            if (lyrics) { event.preventDefault(); lyrics.focus(); lyrics.scrollIntoView({ block: 'center' }); }
          }} prefetch={false}
          className="ghost filter-chip music-list-btn music-lyrics-link" aria-label="Lyrics" title="Lyrics"><TransportIcon name="lyrics" /></Link>)}
        {!wide && queueLink}</div>
      <SeekBar className="music-player-bottombar-seek" />
      <div className="music-player-bottombar-controls">
        <div className="music-transport-left music-transport-buttons">
          {!wide && <PlayerMoreMenu />}
        </div>
        <div className="music-transport-playback music-transport-buttons" aria-label="Playback controls">
          {wide && shuffleButton}
          <button type="button" className="music-prev-btn" onClick={prevTrack} aria-label="Previous track"><TransportIcon name="prev" /></button>
          {play}
          <button type="button" className="music-next-btn" onClick={nextTrack} aria-label="Next track" title={upcomingTrack ? `Next: ${songTitle(upcomingTrack.title, upcomingTrack.altTitle)}` : 'Next'} data-tip={upcomingTrack ? `Next: ${songTitle(upcomingTrack.title, upcomingTrack.altTitle)}` : 'Next'}><TransportIcon name="next" /></button>
          {wide && repeatButton}
        </div>
        <div className="music-transport-right music-transport-buttons">
          {!wide && <>{shuffleButton}{repeatButton}</>}
          {wide && queueLink}
          {wide && <VolumeControl volume={volume} onChange={setVolumeLevel} onToggleMute={toggleMute} />}
          {wide && <>
            {safeButton}
            <PlayerMoreMenu />
          </>}
        </div>
      </div>
      {!wide && <div className="music-transport-volume-row">{favorite}{blockButton}<VolumeControl volume={volume} onChange={setVolumeLevel} onToggleMute={toggleMute} />{safeButton}</div>}
    </div>
  );
}
