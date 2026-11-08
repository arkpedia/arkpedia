import { useRouter } from 'next/router';
import { queuePanelHref } from '@/lib/music/queuePanelHref';
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
import { MSR_LABEL } from '@/lib/music/songArt';


/** How long a queue action's notice stays up; Clear queue's, with its Undo, a little longer. */
const NOTICE_MS = 5000;
const UNDO_NOTICE_MS = 9000;

/**
 * The music section's player bar, held at the bottom of the window (sticky) on /music and on
 * Discover, so the song playing and the way back to it are always in reach -- the mini player's
 * job on a music app's every screen. Its song names the track and opens Now playing; its Queue
 * button opens the queue. Every form seeks: the head drags on Discover as in the other tabs (it
 * was a progress line there until 2026-10-22). The full bar (/music) also sets the volume. Every
 * form, at every width, has
 * Favourite, Previous, Play, Next, Shuffle and Repeat as buttons: on a phone the row under the
 * song is More, Previous, Play, Next, Shuffle, Repeat, and the heart sits beside the song, before
 * Queue. A queue action's result (Play next, Add to queue, Clear) shows above the controls for a
 * moment, Clear's with Undo.
 */
export default function MusicTransportBar({ view, compact = false, coverPath, onFullPlayer, hasLyrics }: {
  view: MusicView;
  compact?: boolean;
  /** The playing song's album cover, where the page has the release's song details. */
  coverPath?: string | null;
  /** On /music: the transport is part of the player page, and its song name still opens Now playing. */
  onFullPlayer?: boolean;
  hasLyrics?: boolean;
}) {
  const {
    ready, starting, buffering, isPlaying, title, videoId, volume, shuffle, repeatMode, favorites,
    currentTrack, nowPlayingCover, nowPlayingArtist, excludeCopyrighted, notice, togglePlay, nextTrack, prevTrack, toggleShuffle, cycleRepeat, setVolumeLevel,
    noAutoplay, toggleNoAutoplay, toggleFavorite, setExcludeCopyrighted, dismissNotice, undoClearQueue,
  } = useMusicPlayer();
  const wide = useMediaQuery('(min-width: 1000px)');
  const router = useRouter();
  const panelOpen = router.query.panel === 'queue';
  const queueHref = view === 'queue' ? MUSIC_VIEW_HREF.player : queuePanelHref(router, !panelOpen);
  const queueLabel = view === 'queue' ? 'Now playing' : panelOpen ? 'Close queue' : 'Queue';
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    const main = bar?.closest('main');
    if (!bar || !main) return;
    const measure = () => {
      main.style.setProperty('--music-bar-height', `${bar.getBoundingClientRect().height}px`);
      const view = main.querySelector('.music-view');
      if (view) main.style.setProperty('--music-view-top', `${view.getBoundingClientRect().top + window.scrollY}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
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
    return () => { observer.disconnect(); rootStyle.disconnect(); window.removeEventListener('resize', measure); main.style.removeProperty('--music-bar-height'); main.style.removeProperty('--music-view-top'); };
  }, []);
  const catalogTitle = currentTrack?.title || title || '';
  const { displayName, fading } = useCrossFadeTitle(catalogTitle, currentTrack?.altTitle);
  const isFav = Boolean(videoId) && favorites.has(videoId);
  // The page's cover for the song where it has one, else the player's fallback (lib/music/songArt.ts).
  const cover = videoId ? coverPath || nowPlayingCover || null : coverPath;
  const artist = nowPlayingArtist ?? currentTrack?.artist ?? null;

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
    <button type="button" className="filter-chip music-fav-btn music-song-favorite music-transport-fav-phone" disabled={!videoId} aria-pressed={isFav}
      aria-label="Favourite" title={isFav ? 'Unfavourite' : 'Favourite'} onClick={() => videoId && toggleFavorite(videoId)}><TransportIcon name="heart" /></button>
  );
  const queueLink = (
    <Link id="music-transport-queue" aria-haspopup={view === 'queue' ? undefined : 'dialog'}
      aria-expanded={view === 'queue' ? undefined : panelOpen} aria-controls={panelOpen ? 'music-queue-popup' : undefined}
      href={queueHref} shallow scroll={false} prefetch={false}
      className={`ghost filter-chip music-list-btn${view === 'queue' || panelOpen ? ' active' : ''}`} aria-current={view === 'queue' ? 'page' : undefined}
      aria-label={queueLabel} title={queueLabel}>
      <TransportIcon name={view === 'queue' ? 'note' : 'queue'} />
    </Link>
  );

  const shuffleButton = <button type="button" className="filter-chip music-shuffle-btn" onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle" title="Shuffle"><TransportIcon name="shuffle" /></button>;
  const repeatButton = <button type="button" className="filter-chip music-repeat-btn" onClick={cycleRepeat} aria-pressed={repeatMode !== 'off'}
            aria-label={`Repeat: ${repeatMode}`} title={`Repeat: ${repeatMode}`}><TransportIcon name="repeat" />{repeatMode === 'one' && <span className="music-repeat-one-badge">1</span>}</button>;

  return (
    // On a phone, outside Now playing, the full bar folds to the mini player's one row (CSS,
    // .music-player-bottombar-phone-mini): Library and Queue keep the room for their songs.
    <div ref={barRef} className={`music-player-bottombar${compact ? ' music-player-bottombar-compact' + (panelOpen ? ' music-player-bottombar-phone-mini' : '') : view !== 'player' ? ' music-player-bottombar-phone-mini' : ''}`} role="region" aria-label="Player" data-empty={!videoId || undefined}>
      <div className="music-transport-notice" role="status">
        {notice && <>
          <span>{notice.text}</span>
          {notice.playback ? null : notice.undo
            ? <button type="button" className="ghost btn-sm" onClick={() => { undoClearQueue(); }}>Undo</button>
            : view !== 'queue' && !panelOpen && <Link href={queuePanelHref(router)} shallow scroll={false} prefetch={false} className="ghost btn-sm" onClick={dismissNotice}>View queue</Link>}
        </>}
      </div>
      <div className="music-transport-song-row">{song}
        {(!wide || videoId) && favorite}
        {wide && videoId && <button type="button" className="ghost filter-chip music-dislike-btn" aria-pressed={noAutoplay.has(videoId)}
          aria-label="Dislike: keep this song out of autoplay" title={noAutoplay.has(videoId) ? 'Undo dislike · Allow autoplay' : 'Dislike · Keep out of autoplay'}
          onClick={() => toggleNoAutoplay(videoId)}><TransportIcon name="dislike" /></button>}
        {hasLyrics && <Link href="/music?view=player#music-lyrics" shallow={onFullPlayer}
          onClick={event => {
            if (view !== 'player' || panelOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const lyrics = document.getElementById('music-lyrics');
            if (lyrics) { event.preventDefault(); lyrics.focus(); lyrics.scrollIntoView({ block: 'center' }); }
          }} prefetch={false}
          className="ghost filter-chip music-list-btn music-lyrics-link" aria-label="Lyrics" title="Lyrics"><TransportIcon name="lyrics" /></Link>}
        {!wide && queueLink}</div>
      <SeekBar className="music-player-bottombar-seek" />
      <div className="music-player-bottombar-controls">
        <div className="music-transport-left music-transport-buttons">
          {!wide && <PlayerMoreMenu onFullPlayer={onFullPlayer} view={view} />}
        </div>
        <div className="music-transport-playback music-transport-buttons" aria-label="Playback controls">
          {wide && shuffleButton}
          <button type="button" className="music-prev-btn" onClick={prevTrack} aria-label="Previous track"><TransportIcon name="prev" /></button>
          {play}
          <button type="button" className="music-next-btn" onClick={nextTrack} aria-label="Next track"><TransportIcon name="next" /></button>
          {wide && repeatButton}
        </div>
        <div className="music-transport-right music-transport-buttons">
          {!wide && <>{shuffleButton}{repeatButton}</>}
          {wide && queueLink}
          {wide && <TransportIcon name="volume" size={16} />}
          <input type="range" min={0} max={100} step={1} value={volume} onChange={event => setVolumeLevel(Number(event.target.value))} className="music-volume" aria-label="Volume" />
          {wide && <>
            <button type="button" className="filter-chip music-stream-safe-btn" onClick={() => setExcludeCopyrighted(!excludeCopyrighted)}
            aria-pressed={excludeCopyrighted} aria-label="Stream-safe: hide copyrighted songs" title="Stream-safe"><TransportIcon name="streamSafe" /></button>
            <PlayerMoreMenu onFullPlayer={onFullPlayer} view={view} />
          </>}
        </div>
      </div>
    </div>
  );
}
