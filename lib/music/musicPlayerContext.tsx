import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, ReactNode } from 'react';
import { MAIN_AUDIO_START } from './pageMusic';
import { readPrivacy, requestExternalMedia, usePrivacyChoice } from '@/lib/privacy/preferences';
import { getSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { useRouter } from 'next/router';
import { useContentUrl } from '@/lib/content/context';
import { GAME_PATHS } from '@/lib/minigames/catalogue';
import { MUSIC_CATALOGUE_PATH, loadMusicCatalogue, type MusicCatalogueSong } from './musicCatalogue';
import { createCatalogueStore, type CatalogueStore } from './catalogueStore';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY, readMusicFavorites } from './musicFavorites';
import { CLOUD_RESTORED_EVENT } from '@/lib/cloud-account/events';
import { migrateChosenQueue, restoreQueue, sessionStore, takeMusicResume, writeMusicResume, type MusicResumeState, type MusicSource, type ListeningHistory } from './musicResume';
import { songTitle } from './musicPolish';
import { clearUpcoming, placeSong, restoreAround, type Placement, type QueueState } from './queueOps';
import { PLAYER_STATE, createMsrAudioEngine, createTrackEngine, type EngineKind, type MsrAudioEngine, type PlaybackEngine, type TrackEngine } from './playbackEngine';
import { trackSource, type TrackSource } from './trackId';
import { useMsrMediaSession } from './useMsrMediaSession';
import { createNativeAudioEngine, isNativeEngine, nativeAudioPlugin, nativeQueue } from './nativeAudio';
import { SITE_ICON_PATH, artistLine, imageType, msrCoverPath, sessionArtwork, useSongArt, youtubeThumbnail } from './songArt';
import { versionTiming } from './versionTiming';
import { findSongVersion } from './songVersions';
import { musicAudioPreloader } from './audioPreload';
import { primeSpectrumContext } from './spectrumInput';
import { musicAudioElement, primeMusicAudio, msrAudioAddress } from './audioElement';
import AudioDebugPanel from '@/components/music/AudioDebugPanel';
import EndfieldNoticeDialog from '@/components/music/EndfieldNoticeDialog';
import { shouldShowEndfieldNotice } from './endfieldNotice';
import { noAutoplaySongs, toggleNoAutoplay, useNoAutoplay } from './noAutoplay';
import { readSongFilter, refilterQueue, songAllowed, writeSongFilter, type FilterableSong, type MusicGame, type SongFilter } from './songFilter';
import { createPlaybackPositionStore, type PlaybackPosition, type PlaybackPositionStore } from './playbackPosition';
import { useLatestActions } from '@/lib/ui/useLatestActions';

/** YouTube's iframe player, which is a PlaybackEngine as it stands (lib/music/playbackEngine.ts). */
export interface YTPlayer extends PlaybackEngine {
  mute(): void;
  unMute(): void;
  getPlaylist(): string[] | undefined;
}

declare global {
  interface Window {
    YT: {
      Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
      PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

/** How long a resumed song may take to start before the player takes it that the browser
 *  refused to start sound by itself (autoplay), when YouTube does not say so (onAutoplayBlocked):
 *  from the cue to its "cued", from Play to "playing", and while it is still buffering. */
const RESUME_CUE_MS = 8000;
const RESUME_PLAY_MS = 3000;
const RESUME_BUFFER_MS = 20000;

/** Data saver (localStorage, 'true' or 'false'; off when absent): songs play from YouTube, a few
 *  MB each, instead of Monster Siren's own files (35-65 MB), which keep playing while the page is
 *  hidden. A song with no YouTube upload plays from Monster Siren either way. */
export const MUSIC_DATA_SAVER_KEY = 'arkpediaMusicDataSaver';

let apiLoadPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return apiLoadPromise;
}

export type RepeatMode = 'off' | 'one' | 'all';

// What a queue row shows. Credits, characters and whether a song has lyrics belong to the
// /music page's release props (its songLookup), which carry them for every song.
export interface QueueTrack {
  id: string;
  cid?: string;
  title: string;
  altTitle?: string | null;
  artist?: string | null;
  /** Album (English where it has one), its own name when different, and cover: the song row's
   *  art and second line. Absent from a catalogue published before they were added. */
  album?: string | null;
  albumOriginal?: string | null;
  cover?: string | null;
  /** 'endfield' for an Arknights: Endfield song; absent for Arknights' own (lib/music/songFilter.ts). */
  game?: MusicGame;
  copyright?: boolean;
}

/** Where the queue came from, for the Queue view's "Playing from": every song (the default),
 *  a saved playlist, or the reader's own (a queue they cleared and built up again). */
export type QueueSource = MusicSource | null;

/** What a queue action did, shown under the transport for a moment (pages/music). */
export interface MusicNotice {
  id: number;
  text: string;
  /** Clear queue can be undone from the notice. */
  undo?: boolean;
  /** About playback itself (a song that would not start), not a queue action: it stays until the
   *  next Play, links to no queue, and the corner player shows it too. */
  playback?: boolean;
}

/** What the player says when a Monster Siren song made no sound, even from a fresh address. */
export const STUCK_NOTICE = 'Couldn’t start this song. Tap Play to try again.';

export type QueueSongResult = 'queued' | 'current' | 'unavailable';

function toQueueTrack(song: MusicCatalogueSong): QueueTrack {
  return { id: song.id, ...(song.cid ? { cid: song.cid } : {}), title: song.title, altTitle: song.altTitle ?? null, artist: song.artist ?? null,
    album: song.album ?? null, albumOriginal: song.albumOriginal ?? null, cover: song.cover ?? null, copyright: song.copyright,
    ...(song.game === 'endfield' ? { game: song.game } : {}) };
}

/** What autoplay plays once the queue is done, in its order from the song playing: every song the
 *  reader's settings let in, less the queue's own songs, the ones kept out, and the song playing. */
function computeAutoplayTracks({ catalog, filter, queue, autoplayOrder, autoplayVideoId, videoId, keptOut }: {
  catalog: MusicCatalogueSong[] | null; filter: SongFilter; queue: QueueTrack[]; autoplayOrder: string[];
  autoplayVideoId: string; videoId: string; keptOut: ReadonlySet<string>;
}): QueueTrack[] {
  const byId = new Map((catalog ?? []).filter(song => songAllowed(filter, song)).map(song => [song.id, toQueueTrack(song)]));
  const chosen = new Set(queue.map(track => track.id));
  const ids = [...new Set([...autoplayOrder, ...byId.keys()])];
  const at = ids.indexOf(autoplayVideoId || videoId);
  return [...ids.slice(at + 1), ...ids.slice(0, at + 1)].flatMap(id => {
    const track = byId.get(id);
    return track && !chosen.has(id) && !keptOut.has(id) && id !== videoId ? [track] : [];
  });
}

/**
 * What every reader of the player gets (useMusicPlayer). The value is memoised and its actions
 * keep their identity, so a consumer renders again only when a field it could read has changed.
 * The song's clock is not here: it moves every 500 ms, and lives in useMusicPlayback.
 */
interface MusicPlayerContextValue {
  ready: boolean;
  starting: boolean;
  /** Sound is coming out. A Monster Siren song is playing only once its clock moves. */
  isPlaying: boolean;
  /** A play was asked for and no sound comes yet (Monster Siren's audio loading, or waiting for
   *  data): the Play button shows loading, still pressable to stop. */
  buffering: boolean;
  title: string;
  videoId: string;
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  favorites: Set<string>;
  queue: QueueTrack[];
  queueIndex: number;
  shuffleOrder: number[] | null; // full pre-computed shuffle permutation of queue indices -- null when shuffle is off
  shufflePosition: number; // where the currently-playing track sits within shuffleOrder
  queueLoading: boolean;
  playingPlaylistId: string | null;
  /** Songs the reader queued (Play next, Add to queue) that have not played yet. */
  queued: ReadonlySet<string>;
  queueSource: QueueSource;
  queueView: React.RefObject<{ search: string; scrollTop: number; visible: number }>;
  history: ListeningHistory;
  upcomingTrack: QueueTrack | null;
  playHistory: (position: number) => void;
  libraryTracks: QueueTrack[];
  currentTrack: QueueTrack | undefined;
  /** The playing song's picture: the catalogue's cover (a /album-covers/ path), else Monster
   *  Siren's album cover or the YouTube thumbnail (absolute addresses), else null (lib/music/songArt.ts). */
  nowPlayingCover: string | null;
  /** The playing song's artist: the catalogue's, else Monster Siren's credit, else null. */
  nowPlayingArtist: string | null;
  autoplay: boolean;
  autoplayVideoId: string;
  autoplayTracks: QueueTrack[];
  setAutoplay: (enabled: boolean) => void;
  notice: MusicNotice | null;
  dismissNotice: () => void;
  excludeCopyrighted: boolean; // "stream-safe mode" -- filters copyrighted songs out of the queue entirely, not just a display filter on one page
  /** Arknights: Endfield's songs are in the queue, shuffle, autoplay, Library and Discover
   *  (lib/music/songFilter.ts). Off until the reader turns it on. */
  includeEndfield: boolean;
  setIncludeEndfield: (on: boolean) => void;
  /** Data saver (MUSIC_DATA_SAVER_KEY): play songs from YouTube rather than Monster Siren's files. */
  dataSaver: boolean;
  setDataSaver: (on: boolean) => void;
  /** The engine playing the song loaded now: Monster Siren's audio or YouTube's player. */
  engineKind: EngineKind;
  initializePlayer: (prompt?: boolean) => void;
  togglePlay: () => void;
  pausePlayback: () => void;
  /** Reserve event audio without changing the personal queue or playback position. */
  pauseForEvent: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleFavorite: (videoId: string) => void;
  /** Keeps a song out of autoplay, or lets it back (lib/music/noAutoplay.ts); keeping out the
   *  song autoplay is playing moves on to the next one. */
  toggleNoAutoplay: (videoId: string) => void;
  /** The songs kept out of autoplay. */
  noAutoplay: ReadonlySet<string>;
  setVolumeLevel: (v: number) => void;
  toggleMute: () => void;
  playQueueIndex: (index: number) => void;
  playTrackByVideoId: (videoId: string) => void;
  playFirst: (videoId: string) => void;
  playPlaylist: (videoIds: string[] | null, source?: MusicSource, selectedId?: string) => Promise<number>;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  reorderShuffleOrder: (fromPos: number, toPos: number) => void;
  moveQueueItemToTop: (index: number) => void;
  removeFromQueue: (index: number) => void;
  /** Plays a song right away; the rest of the queue plays on after it. */
  playNow: (videoId: string) => void;
  alternateVersion: { song: QueueTrack; label: string } | null;
  switchVersion: () => void;
  /** Play next (right after the current song) or Add to queue (after the songs already queued). */
  queueSong: (videoId: string, where: Placement) => Promise<QueueSongResult>;
  /** Takes out every song but the one playing; undoClearQueue puts them back. */
  clearQueue: () => void;
  undoClearQueue: () => void;
  canUndoClear: boolean;
  setExcludeCopyrighted: (v: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  return ctx;
}

/** The seek bars' side of the player: where the song is, and seeking (lib/music/playbackPosition.ts). */
interface MusicPlaybackContextValue {
  position: PlaybackPositionStore;
  readPlaybackTime: () => number;
  /** Moves the displayed time only, while the reader drags; handleSeekCommit seeks the engine. */
  handleSeekChange: (v: number) => void;
  handleSeekCommit: (v: number) => void;
  setSeeking: (v: boolean) => void;
}

const MusicPlaybackContext = createContext<MusicPlaybackContextValue | null>(null);

/**
 * The song's clock, its length and the seek bars' handlers. Subscribes the component to the
 * clock, which moves every 500 ms while a song plays: for a seek bar and the lyrics only
 * (components/music/SeekBar.tsx, MusicLyrics.tsx). Everything else reads useMusicPlayer, which
 * the clock never touches.
 */
export function useMusicPlayback(): PlaybackPosition & Omit<MusicPlaybackContextValue, 'position'> {
  const ctx = useContext(MusicPlaybackContext);
  if (!ctx) throw new Error('useMusicPlayback must be used within MusicPlayerProvider');
  const { position, ...handlers } = ctx;
  const snapshot = useSyncExternalStore(position.subscribe, position.get, position.get);
  return { ...snapshot, ...handlers };
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  // The player's engine (lib/music/playbackEngine.ts): YouTube's iframe for a song on YouTube,
  // Monster Siren's audio for one that is not, behind one surface. Set once YouTube is ready.
  const manualAudio = useRef(false);
  const playerRef = useRef<TrackEngine | null>(null);
  const audioRef = useRef<MsrAudioEngine | null>(null);
  const playerCreatedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const catalogRef = useRef<MusicCatalogueSong[] | null>(null);
  // The catalogue of the release the reader's page is on, reloaded when it moves on
  // (lib/music/catalogueStore.ts); catalogRef mirrors the one loaded last, for the code below
  // that reads it as it stands.
  const catalogueStoreRef = useRef<CatalogueStore<MusicCatalogueSong> | null>(null);
  catalogueStoreRef.current ??= createCatalogueStore((url: string) => loadMusicCatalogue(url));
  // The queue catalogue belongs to the content release, like every other game record: the
  // release of the page being read, or of the last page that had one (the community pages
  // have none). Mirrored into a ref like the settings below, because the queue loader is
  // created once. Only with no release seen at all does it fall to the deployment's copy.
  const contentUrl = useContentUrl();
  const catalogueUrlRef = useRef(contentUrl(MUSIC_CATALOGUE_PATH));
  useEffect(() => {
    const url = contentUrl(MUSIC_CATALOGUE_PATH);
    if (url !== MUSIC_CATALOGUE_PATH) catalogueUrlRef.current = url;
  }, [contentUrl]);

  // Load the catalogue and YouTube only when music is opened or used.
  // This provider remains mounted across routes, preserving playback
  // and the user's queue after the initial load.
  const [initialized, setInitialized] = useState(false);
  const pendingPlayRef = useRef(false); // true if play was requested before the player was ready
  const pendingFirstRef = useRef<string | null>(null);
  const pendingVideoIdRef = useRef<string | null>(null); // set when the pending play request is for a SPECIFIC track (via playTrackByVideoId), not just "resume/play whatever's cued"
  // Carrying the music over from the last document (lib/music/musicResume.ts). The record waits
  // here for the catalogue (its queue) and for YouTube (its song and moment); then the resumed
  // song waits for "playing", or for the browser's refusal to start it by itself.
  const resumeRef = useRef<MusicResumeState | null>(null);
  const resumeWatchRef = useRef<{ videoId: string; seconds: number; phase: 'cue' | 'play'; since: number } | null>(null);
  const resumeTimerRef = useRef<number | undefined>(undefined);
  // A song cued at a moment and not yet played: YouTube's own clock reads 0 until it plays.
  const cuedAtRef = useRef<{ videoId: string; seconds: number } | null>(null);
  const playerStateRef = useRef(-1);
  const playerReadyRef = useRef(false);
  const router = useRouter();

  const [ready, setReady] = useState(false);
  // True specifically during the gap between "play was requested" and
  // "the player actually exists and is ready" -- the YouTube iframe
  // API load + player creation is async and can take a noticeable
  // moment, and without this, a play click during that window (the
  // pendingPlayRef fallback below) silently did nothing visible at
  // all, which read as broken rather than just loading.
  const [starting, setStarting] = useState(false);
  const eventMusicEnabled = useSiteSetting('eventMusic'), mediaAllowed = usePrivacyChoice('externalMedia');
  const eventAudioActive = useRef(false);
  const eventAudioResume = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBufferingState] = useState(false);
  const bufferingRef = useRef(false);
  const setBuffering = (on: boolean) => { bufferingRef.current = on; setBufferingState(on); };
  const [title, setTitle] = useState('');
  const [videoId, setVideoId] = useState('');
  const [volume, setVolume] = useState(50);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // The song's clock, its length and the seek bars' drag, outside React state
  // (lib/music/playbackPosition.ts): a tick renders the seek bars and the lyrics, nothing else.
  const positionRef = useRef<PlaybackPositionStore | null>(null);
  positionRef.current ??= createPlaybackPositionStore();
  const position = positionRef.current;
  const setCurrentTime = (seconds: number) => position.set({ currentTime: seconds });
  const setDuration = (seconds: number) => position.set({ duration: seconds });
  const [excludeCopyrighted, setExcludeCopyrightedState] = useState(false);
  const excludeCopyrightedRef = useRef(false);
  const [includeEndfield, setIncludeEndfieldState] = useState(false);
  const includeEndfieldRef = useRef(false);
  // The touch screen's pop-up about background play (components/music/EndfieldNoticeDialog.tsx),
  // and what had the focus when it opened, which it gets back.
  const [endfieldNotice, setEndfieldNotice] = useState(false);
  const endfieldNoticeFromRef = useRef<HTMLElement | null>(null);
  /** The settings as they are this moment, for code that runs after an await or in a callback. */
  const songFilter = (): SongFilter => ({ excludeCopyrighted: excludeCopyrightedRef.current, includeEndfield: includeEndfieldRef.current });
  const allowed = (song: FilterableSong) => songAllowed(songFilter(), song);
  const [dataSaver, setDataSaverState] = useState(false);
  const dataSaverRef = useRef(false);
  const [engineKind, setEngineKind] = useState<EngineKind>('youtube');
  // A song an automatic advance (an end, a skip) loaded into YouTube while the page was hidden,
  // until it plays: a phone may never start it there (see the visibility effect below).
  const hiddenLoadRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      dataSaverRef.current = window.localStorage.getItem(MUSIC_DATA_SAVER_KEY) === 'true';
      setDataSaverState(dataSaverRef.current);
    } catch { /* refused: off */ }
  }, []);

  const [libraryTracks, setLibraryTracks] = useState<QueueTrack[]>([]);
  // Read here so the memoised autoplay list below follows it.
  const noAutoplay = useNoAutoplay();
  // On unless the reader turned it off (owner, 2026-10-20): only a click writes the stored choice.
  const [autoplay, setAutoplayState] = useState(true);
  const autoplayRef = useRef(true);
  const [autoplayVideoId, setAutoplayVideoId] = useState('');
  const autoplayVideoIdRef = useRef('');
  const autoplayOrderRef = useRef<string[]>([]);
  // Its state twin, for the memoised autoplay list below: written wherever the ref is.
  const [autoplayOrder, setAutoplayOrderState] = useState<string[]>([]);
  function setAutoplay(enabled: boolean) {
    autoplayRef.current = enabled; setAutoplayState(enabled);
    try { window.localStorage.setItem('arkpediaMusicAutoplay', String(enabled)); } catch { /* refused */ }
  }
  useEffect(() => {
    try { const saved = window.localStorage.getItem('arkpediaMusicAutoplay');
      if (saved !== null) { autoplayRef.current = saved === 'true'; setAutoplayState(autoplayRef.current); }
    } catch { /* refused */ }
  }, []);
  const queueView = useRef({ search: '', scrollTop: 0, visible: 0 });
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueLoading, setQueueLoading] = useState(false);
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);
  const playingPlaylistIdRef = useRef<string | null>(null);
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const queuedRef = useRef<ReadonlySet<string>>(new Set());
  const [queueSource, setQueueSourceState] = useState<QueueSource>(null);
  const queueSourceRef = useRef<QueueSource>(null);
  const setQueueSource = (source: QueueSource) => { queueSourceRef.current = source; setQueueSourceState(source); };
  const [notice, setNotice] = useState<MusicNotice | null>(null);
  const noticeIdRef = useRef(0);
  const announce = (text: string, undo = false, playback = false) => { noticeIdRef.current += 1; setNotice({ id: noticeIdRef.current, text, undo, playback }); };
  const dismissNotice = useCallback(() => setNotice(null), []);
  /** A play asked for: a notice about the last one that would not start is done with. */
  const clearPlaybackNotice = () => setNotice((current) => (current?.playback ? null : current));
  /** Called first in every press that asks for music, with the song it asks for when it knows
   *  it. An iPhone starts sound only inside a press: where the engine cannot play that song in
   *  this same press -- YouTube's player API, which the player waits for, has not loaded, or the
   *  <audio> has never had a file -- the song's own file is set and played here
   *  (lib/music/audioElement.ts primeMusicAudio), and the engine takes it over. */
  const primeAudio = (id?: string | null, seconds = 0) => {
    if (!readPrivacy().externalMedia) return;
    window.dispatchEvent(new Event(MAIN_AUDIO_START));
    clearPlaybackNotice();
    const source = id ? routeTrack(id) : null;
    if (source?.kind !== 'msr') return;
    if (nativeAudioPlugin()) return;
    primeSpectrumContext();
    if (playerReadyRef.current && playerRef.current && musicAudioElement().getAttribute('src')) return;
    primeMusicAudio(source.cid, seconds);
  };
  const collectionRequest = useRef(0);
  const [history, renderHistory] = useState<ListeningHistory>({ tracks: [], position: 0 });
  const historyRef = useRef(history);
  function setHistory(next: ListeningHistory) {
    historyRef.current = next;
    renderHistory(next);
  }
  function recordHeard(id: string) {
    const current = historyRef.current;
    if (!id || current.tracks[current.position] === id) return;
    const tracks = [...current.tracks.slice(0, current.position + 1), id].slice(-500);
    setHistory({ tracks, position: tracks.length - 1 });
  }

  // The queue as Clear queue found it, for Undo.
  const clearedRef = useRef<{ state: QueueState<QueueTrack>; playlistIds: string[] | null; playingPlaylistId: string | null; source: QueueSource } | null>(null);
  const [canUndoClear, setCanUndoClear] = useState(false);
  // Shuffle is a full pre-computed permutation of queue indices, not a
  // fresh random roll on every advance -- that's what lets "Up next",
  // the queue display, the next/previous buttons, and auto-advance on
  // track-end all agree on the same order instead of each independently
  // rolling something different. shufflePosition is where the
  // currently-playing track sits within shuffleOrder --
  // shuffleOrder[shufflePosition] === queueIndex always holds while
  // shuffle is on.
  const [shuffleOrder, setShuffleOrder] = useState<number[] | null>(null);
  const shuffleOrderRef = useRef<number[] | null>(null);
  const [shufflePosition, setShufflePosition] = useState(0);
  const shufflePositionRef = useRef(0);
  // Refs mirroring the latest queue/index/settings, so the player's
  // onStateChange callback (registered once at setup) always reads
  // current values instead of stale ones from its original closure.
  const queueRef = useRef<QueueTrack[]>([]);
  const playlistIdsRef = useRef<string[] | null>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<RepeatMode>('off');
  const favoritesRef = useRef<Set<string>>(new Set());
  const shuffleRef = useRef(false);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    queueIndexRef.current = queueIndex;
  }, [queueIndex]);
  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);
  useEffect(() => {
    shuffleOrderRef.current = shuffleOrder;
  }, [shuffleOrder]);
  useEffect(() => {
    shufflePositionRef.current = shufflePosition;
  }, [shufflePosition]);
  useEffect(() => {
    excludeCopyrightedRef.current = excludeCopyrighted;
  }, [excludeCopyrighted]);
  useEffect(() => {
    includeEndfieldRef.current = includeEndfield;
  }, [includeEndfield]);
  // And what a record of the moment needs (saveResume, below).
  const isPlayingRef = useRef(false);
  const videoIdRef = useRef('');
  const titleRef = useRef('');
  const volumeRef = useRef(50);
  const lastAudibleVolumeRef = useRef(50);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    volumeRef.current = volume;
    if (volume > 0) lastAudibleVolumeRef.current = volume;
  }, [volume]);

  // Loaded once on mount, same pattern as musicVolume (lib/music/songFilter.ts reads them).
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* refused: the defaults */ }
    const saved = readSongFilter(storage);
    excludeCopyrightedRef.current = saved.excludeCopyrighted;
    setExcludeCopyrightedState(saved.excludeCopyrighted);
    includeEndfieldRef.current = saved.includeEndfield;
    setIncludeEndfieldState(saved.includeEndfield);
  }, []);

  // Apply restored preferences without replacing the engine or interrupting playback.
  useEffect(() => {
    const read = () => {
      const storage = window.localStorage;
      const nextVolume = Number(storage.getItem('musicVolume') ?? 50);
      if (Number.isFinite(nextVolume) && nextVolume >= 0 && nextVolume <= 100) {
        const effective = nextVolume;
        volumeRef.current = effective; setVolume(effective); playerRef.current?.setVolume(effective);
      }
      dataSaverRef.current = storage.getItem(MUSIC_DATA_SAVER_KEY) === 'true';
      setDataSaverState(dataSaverRef.current);
      autoplayRef.current = storage.getItem('arkpediaMusicAutoplay') !== 'false';
      setAutoplayState(autoplayRef.current);
      const filter = readSongFilter(storage);
      excludeCopyrightedRef.current = filter.excludeCopyrighted; setExcludeCopyrightedState(filter.excludeCopyrighted);
      includeEndfieldRef.current = filter.includeEndfield; setIncludeEndfieldState(filter.includeEndfield);
    };
    window.addEventListener(CLOUD_RESTORED_EVENT, read);
    return () => window.removeEventListener(CLOUD_RESTORED_EVENT, read);
  }, []);

  // Loaded on mount from a plain JSON array of videoIds, kept as a Set at
  // runtime for O(1) membership checks -- and read again whenever they are
  // written under the player: a backup restored in this tab
  // (MUSIC_FAVORITES_EVENT, lib/music/musicFavorites.ts) or a ♥ in another
  // tab (the storage event). Otherwise the next ♥ here would write the set
  // this tab read back over theirs.
  useEffect(() => {
    const read = () => {
      try {
        const set = readMusicFavorites(window.localStorage);
        setFavorites(set);
        favoritesRef.current = set;
      } catch {
        /* ignore */
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MUSIC_FAVORITES_KEY || event.key === null) read();
    };
    read();
    window.addEventListener(MUSIC_FAVORITES_EVENT, read);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(MUSIC_FAVORITES_EVENT, read);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function toggleFavorite(videoId: string) {
    const next = new Set(favoritesRef.current);
    if (next.has(videoId)) next.delete(videoId);
    else next.add(videoId);
    favoritesRef.current = next;
    setFavorites(next);
    try {
      window.localStorage.setItem(MUSIC_FAVORITES_KEY, JSON.stringify(Array.from(next)));
      window.dispatchEvent(new Event(MUSIC_FAVORITES_EVENT));
    } catch {
      /* ignore */
    }
  }

  /** The queue the catalogue of the page's release gives (the one loaded already, or that
   *  release's now), as the reader's settings let it. */
  async function buildQueueFromCatalog(): Promise<QueueTrack[]> {
    const catalog = await catalogueStoreRef.current!.get(catalogueUrlRef.current);
    if (catalogRef.current !== catalog) {
      catalogRef.current = catalog;
      setLibraryTracks(catalog.map(toQueueTrack));
    }
    // Read the latest preference after loading: it may have changed
    // while the catalogue was downloading.
    // The refs written out, not allowed(): loadFullQueue's useCallback reads this function, and a
    // closure over render-scope helpers would make it a dependency.
    return catalog.filter((song) => songAllowed({ excludeCopyrighted: excludeCopyrightedRef.current, includeEndfield: includeEndfieldRef.current }, song)).map(toQueueTrack);
  }

  function setExcludeCopyrighted(v: boolean) {
    applySongFilter({ ...songFilter(), excludeCopyrighted: v });
  }
  // Whatever turns Endfield music on -- either checkbox, or a list's "Include Endfield music" --
  // tells a touch screen in a pop-up that background play may not work properly with them. Opened here,
  // not by the control: the hint that turned it on is gone the moment it is on.
  function setIncludeEndfield(on: boolean) {
    const turnedOn = on && !includeEndfieldRef.current;
    applySongFilter({ ...songFilter(), includeEndfield: on });
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* refused: shown */ }
    if (turnedOn && shouldShowEndfieldNotice(storage, window.matchMedia('(pointer: coarse)').matches)) {
      endfieldNoticeFromRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEndfieldNotice(true);
    }
  }
  function closeEndfieldNotice() {
    setEndfieldNotice(false);
    const from = endfieldNoticeFromRef.current;
    endfieldNoticeFromRef.current = null;
    const destination = from?.isConnected && from.getClientRects().length ? from : document.querySelector<HTMLElement>('[aria-label="Music menu"]');
    destination?.focus({ preventScroll: true });
  }

  // A setting changed: stored, and applied to the queue as it stands. Rebuilding the queue from
  // the catalogue here was the bug stream-safe once had -- it threw away the reader's own order
  // and drew a new shuffle every time. refilterQueue (lib/music/songFilter.ts) instead takes out
  // the songs now left out where they stand and puts the songs now let in on the end, so
  // everything already there keeps its place, in the queue and in the shuffle order.
  function applySongFilter(next: SongFilter) {
    const before = songFilter();
    excludeCopyrightedRef.current = next.excludeCopyrighted; setExcludeCopyrightedState(next.excludeCopyrighted);
    includeEndfieldRef.current = next.includeEndfield; setIncludeEndfieldState(next.includeEndfield);
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* refused: this visit only */ }
    writeSongFilter(storage, next);

    const fullCatalog = catalogRef.current;
    // Until loading finishes, the settings above are all we need:
    // buildQueueFromCatalog will apply them to the initial queue.
    if (!fullCatalog) return;
    const playingSong = fullCatalog.find(song => song.id === videoIdRef.current);
    if (playingSong && !songAllowed(next, playingSong)) {
      pausePlayback();
      announce('Paused this song because it is excluded by your music filters.');
    }
    const result = refilterQueue({
      queue: queueRef.current, queueIndex: queueIndexRef.current,
      shuffleOrder: shuffleRef.current ? shuffleOrderRef.current : null,
      catalogue: fullCatalog, before, after: next, toTrack: toQueueTrack, playlistIds: playlistIdsRef.current,
    });
    queueRef.current = result.queue; setQueue(result.queue);
    queueIndexRef.current = result.queueIndex; setQueueIndex(result.queueIndex);

    if (shuffleRef.current && result.queue.length > 0) {
      // No order to carry yet: the only case that still draws a fresh one.
      const finalOrder = result.shuffleOrder ?? generateShuffleOrder(result.queue.length, result.queueIndex);
      shuffleOrderRef.current = finalOrder;
      setShuffleOrder(finalOrder);
      const pos = finalOrder.indexOf(result.queueIndex);
      shufflePositionRef.current = pos !== -1 ? pos : 0;
      setShufflePosition(shufflePositionRef.current);
    }
  }

  // Each song's Monster Siren id, from the catalogue: the catalogue's rows carry it for songs on
  // YouTube too (lib/music/musicCatalogue.ts), until a release published before that, where
  // they play from YouTube as they always did.
  const cidsRef = useRef<{ catalog: MusicCatalogueSong[]; cids: Map<string, string> } | null>(null);
  function cidOf(id: string): string | undefined {
    const catalog = catalogRef.current;
    if (!catalog) return undefined;
    if (cidsRef.current?.catalog !== catalog) {
      cidsRef.current = { catalog, cids: new Map(catalog.flatMap((song) => (song.cid ? [[song.id, song.cid] as [string, string]] : []))) };
    }
    return cidsRef.current.cids.get(id);
  }
  /** Where a track's sound comes from now (lib/music/playbackEngine.ts): Monster Siren's own
   *  file for every song that has one, so it plays on while the page is hidden; YouTube for a
   *  song with none, and for every song on YouTube while Data saver is on. Chosen at each load,
   *  never stored: the track id, which favourites, playlists and the queue keep, stays the same. */
  function routeTrack(id: string): TrackSource {
    const source = trackSource(id) ?? { kind: 'youtube' as const, videoId: id };
    if (source.kind === 'msr' || dataSaverRef.current) return source;
    const cid = cidOf(id);
    return cid ? { kind: 'msr', cid } : source;
  }

  /** A track an automatic step loads while the page is hidden, into YouTube: watched once the
   *  page is back (the visibility effect below), as a phone may not start YouTube there. */
  function noteHiddenLoad(id: string) {
    hiddenLoadRef.current = document.visibilityState === 'hidden' && playerRef.current?.active() === 'youtube' ? id : null;
  }

  // A song resumed from the last document stops waiting to start: it plays, the reader
  // chose another, or the browser refused to start it.
  const endResumeWatch = useCallback(() => {
    if (!resumeWatchRef.current) return;
    resumeWatchRef.current = null;
    window.clearInterval(resumeTimerRef.current);
    setStarting(false);
  }, []);

  const loadTrackAt = useCallback((index: number, handoff?: { seconds: number; playing: boolean }) => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const clamped = ((index % q.length) + q.length) % q.length;
    queueIndexRef.current = clamped; setQueueIndex(clamped);
    autoplayVideoIdRef.current = ''; setAutoplayVideoId('');
    endResumeWatch();
    const id = q[clamped].id;
    const at = handoff ? { videoId: id, startSeconds: handoff.seconds, switchVersion: true } : id;
    if (handoff) {
      videoIdRef.current = id;
      setVideoId(id);
      setTitle(q[clamped].title);
      setCurrentTime(handoff.seconds);
    }
    if (handoff && !handoff.playing) {
      cuedAtRef.current = { videoId: id, seconds: handoff.seconds };
      playerRef.current?.cueVideoById(at);
    } else {
      cuedAtRef.current = null;
      playerRef.current?.loadVideoById(at);
      noteHiddenLoad(id);
    }
  // noteHiddenLoad reads refs only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endResumeWatch]);

  // Load metadata and restore an explicitly chosen queue; a fresh session stays empty.
  const loadFullQueue = useCallback(async (): Promise<QueueTrack[]> => {
    if (queueRef.current.length) return queueRef.current;
    setQueueLoading(true);
    try {
      const catalog = await buildQueueFromCatalog();
      if (queueRef.current.length) return queueRef.current;
      const record = resumeRef.current ? migrateChosenQueue(resumeRef.current, catalog.map(track => track.id)) : null;
      if (record) {
        resumeRef.current = record;
        playlistIdsRef.current = record.playlistIds ?? record.queue;
        autoplayOrderRef.current = record.autoplayOrder ?? []; setAutoplayOrderState(autoplayOrderRef.current);
        // The saved queue's own `autoplay` is not read: every queue saved while it defaulted to
        // off carries false, which would keep it off for readers who never chose. Only the
        // reader's own click (arkpediaMusicAutoplay, read on mount above) decides.
      }
      const restored = record ? restoreQueue(catalog, record) : null;
      if (restored) {
        queueRef.current = restored.queue; setQueue(restored.queue);
        queueIndexRef.current = restored.queueIndex; setQueueIndex(restored.queueIndex);
        queuedRef.current = new Set(restored.queued); setQueued(queuedRef.current);
        shuffleOrderRef.current = restored.shuffleOrder; setShuffleOrder(restored.shuffleOrder);
        shufflePositionRef.current = restored.shufflePosition; setShufflePosition(restored.shufflePosition);
      }
    } catch { /* Library offers retry; never fabricate a queue from YouTube uploads. */ }
    finally { setQueueLoading(false); }
    return queueRef.current;
  }, []);

  /** Autoplay's list as it stands this moment, for the code that plays from it. */
  function nextAutoplayTracks(): QueueTrack[] {
    return computeAutoplayTracks({ catalog: catalogRef.current, filter: songFilter(), queue: queueRef.current, autoplayOrder: autoplayOrderRef.current,
      autoplayVideoId: autoplayVideoIdRef.current, videoId: videoIdRef.current, keptOut: noAutoplaySongs() });
  }
  // The same list for the queue views, from the state these values render from, kept between
  // renders: the same array until one of its inputs changes, so a Queue's search index over it
  // is built once (components/music/MusicQueue.tsx).
  const autoplayTracks = useMemo(() => computeAutoplayTracks({ catalog: catalogRef.current, filter: { excludeCopyrighted, includeEndfield }, queue, autoplayOrder,
    autoplayVideoId, videoId, keptOut: noAutoplay }),
  // The catalogue is written with libraryTracks (buildQueueFromCatalog).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [libraryTracks, excludeCopyrighted, includeEndfield, queue, autoplayOrder, autoplayVideoId, videoId, noAutoplay]);

  function toggleSongNoAutoplay(id: string) {
    const out = toggleNoAutoplay(id);
    // Kept out while autoplay is playing it: autoplay moves on, as the reader meant.
    if (out && autoplayVideoIdRef.current === id && videoIdRef.current === id) playAutoplayTrack();
  }

  function playAutoplayTrack() {
    if (!autoplayRef.current) return false;
    const track = nextAutoplayTracks()[0];
    if (!track) return false;
    autoplayVideoIdRef.current = track.id; setAutoplayVideoId(track.id);
    endResumeWatch(); cuedAtRef.current = null;
    playerRef.current?.loadVideoById(track.id);
    noteHiddenLoad(track.id);
    return true;
  }

  // Fisher-Yates shuffle of every OTHER index, with currentIndex forced
  // to the front -- so shufflePosition starts at 0 and the currently-
  // playing track's position in the new order never has to jump.
  function generateShuffleOrder(length: number, currentIndex: number): number[] {
    const rest = [];
    for (let i = 0; i < length; i++) {
      if (i !== currentIndex) rest.push(i);
    }
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [currentIndex, ...rest];
  }

  // Translates a single queue index through the exact same splice-move
  // (remove at fromIndex, insert at toIndex) that reorderQueue applies
  // to the actual queue array -- used to update the SHUFFLE ORDER's
  // stored values to match, without touching the order's own
  // sequence/positions. This is what lets a manual reorder (drag, or
  // "play next") only move the one song the user actually moved,
  // instead of regenerating a brand new random order and shuffling
  // everything else along with it.
  function remapIndexAfterMove(idx: number, fromIndex: number, toIndex: number): number {
    if (idx === fromIndex) return toIndex;
    if (fromIndex < toIndex) {
      if (idx > fromIndex && idx <= toIndex) return idx - 1;
      return idx;
    } else {
      if (idx >= toIndex && idx < fromIndex) return idx + 1;
      return idx;
    }
  }

  // Same idea for a plain removal (no corresponding insert) -- drops
  // the removed index and shifts everything after it down by one, same
  // as Array.prototype.filter/splice(index, 1) would.
  function remapIndexAfterRemoval(idx: number, removedIndex: number): number | null {
    if (idx === removedIndex) return null;
    return idx > removedIndex ? idx - 1 : idx;
  }

  /** Where Next goes in the queue -- the next song in play order, or the first again under
   *  Repeat all -- with its place in that order; undefined past the end. */
  function nextQueueStep(): { index: number; position: number } | undefined {
    const q = queueRef.current;
    const order = shuffleRef.current ? shuffleOrderRef.current ?? q.map((_, i) => i) : q.map((_, i) => i);
    const current = q.findIndex(track => track.id === videoIdRef.current);
    const position = order.indexOf(current);
    // An automatic track never enters Your queue. Chosen additions take priority next.
    const nextIndex = autoplayVideoIdRef.current
      ? order.find(index => queuedRef.current.has(q[index].id))
      : order[position + 1];
    if (nextIndex !== undefined) return { index: nextIndex, position: order.indexOf(nextIndex) };
    if (repeatModeRef.current === 'all' && order.length) return { index: order[0], position: 0 };
    return undefined;
  }


  function forwardPosition() {
    const current = historyRef.current;
    return current.tracks.findIndex((id, i) => i > current.position && Boolean(playableTrack(id)));
  }
  function nextSong() {
    const forward = forwardPosition();
    if (forward >= 0) return playableTrack(historyRef.current.tracks[forward]);
    const step = nextQueueStep();
    return step ? queueRef.current[step.index] : autoplayRef.current ? nextAutoplayTracks()[0] ?? null : null;
  }
  const currentTrack = useMemo(() => libraryTracks.find(track => track.id === videoId) ?? queue.find(track => track.id === videoId), [libraryTracks, queue, videoId]);
  const alternateVersion = useMemo(() => currentTrack
    ? findSongVersion(currentTrack, libraryTracks.filter(song => songAllowed({ excludeCopyrighted, includeEndfield }, song)))
    : null, [currentTrack, libraryTracks, excludeCopyrighted, includeEndfield]);
  const versionPair = useRef<{ from: string; to: string; fromStart: boolean } | null>(null);
  versionPair.current = currentTrack && alternateVersion ? { from: currentTrack.id, to: alternateVersion.song.id, fromStart: alternateVersion.fromStart } : null;
  // Prepare the matching recording for a live handoff and the next song for normal playback. Queue edits, shuffle, repeat and automatic tracks
  // read the same decision as Next; paused players retain a completed file but stop fetching
  // (its signed address, headers only, is still asked for). Data saver prepares nothing.
  // Decided again at each change below, and at each tick of the clock while a song plays
  // (the poll effect below), as the song's own buffering comes along.
  function selectPreload() {
    if (isNativeEngine(audioRef.current)) {
      musicAudioPreloader.select(null, false);
      if (playerRef.current?.active() === 'msr') {
        audioRef.current.synchronize(nativeQueue({
          currentId: videoIdRef.current, currentAutoplay: autoplayVideoIdRef.current === videoIdRef.current,
          queue: queueRef.current, order: shuffleRef.current ? shuffleOrderRef.current : null,
          history: historyRef.current, queued: queuedRef.current,
          autoplay: autoplayRef.current ? nextAutoplayTracks() : [], repeat: repeatModeRef.current,
          lookup: id => catalogRef.current?.find(song => song.id === id) ?? queueRef.current.find(song => song.id === id),
          route: routeTrack,
        }));
      }
      return;
    }
    const saver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const next = repeatModeRef.current === 'one' ? undefined : nextSong();
    const source = next ? routeTrack(next.id) : null;
    const playing = videoIdRef.current ? routeTrack(videoIdRef.current) : null;
    const mayPrepare = playerRef.current?.loaded() === videoIdRef.current && !dataSaverRef.current && !saver && readPrivacy().externalMedia;
    const other = mayPrepare && versionPair.current?.from === videoIdRef.current && playing?.kind === 'msr'
      ? routeTrack(versionPair.current.to) : null;
    const otherCid = other?.kind === 'msr' ? other.cid : null;
    const offset = otherCid && playing?.kind === 'msr' ? versionTiming(playing.cid, otherCid).offset : 0;
    audioRef.current?.prepareVersion(otherCid, versionPair.current?.fromStart ? null : offset);
    const target = mayPrepare && source?.kind === 'msr' && source.cid !== otherCid
      && !(playing?.kind === 'msr' && playing.cid === source.cid)
      ? { cid: source.cid, address: msrAudioAddress(source.cid) } : null;
    let buffered = playing?.kind !== 'msr';
    if (!buffered && audioRef.current) {
      const el = audioRef.current.element;
      for (let index = 0; index < el.buffered.length; index++) {
        if (el.buffered.start(index) <= el.currentTime && el.buffered.end(index) - el.currentTime >= Math.min(15, el.duration - el.currentTime)) buffered = true;
      }
    }
    const { currentTime, seeking } = position.get();
    musicAudioPreloader.select(target, Boolean(isPlayingRef.current && !seeking && currentTime >= 3 && buffered));
  }
  useEffect(() => {
    selectPreload();
  // Helpers read current refs; preloading never chooses its own shuffle order.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, videoId, queue, queueIndex, queued, shuffle, shuffleOrder,
    shufflePosition, repeatMode, autoplay, autoplayVideoId, dataSaver, excludeCopyrighted, includeEndfield, libraryTracks, favorites, noAutoplay]);
  useEffect(() => () => {
    musicAudioPreloader.select(null, false);
    audioRef.current?.prepareVersion(null);
  }, []);

  const nextTrack = useCallback(async () => {
    primeAudio();
    const forward = forwardPosition();
    if (forward >= 0) { playHistory(forward); return; }
    const step = nextQueueStep();
    if (step) {
      shufflePositionRef.current = step.position; setShufflePosition(step.position);
      loadTrackAt(step.index);
    } else if (!playAutoplayTrack()) {
      playerRef.current?.pauseVideo(); setIsPlaying(false); setBuffering(false);
    }
  // These helpers read refs, so the YouTube instance can retain one callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTrackAt]);

  function manualNextTrack() {
    claimManualAudio();
    // A quick skip can beat the engine's first confirmed PLAYING event.
    // Keep the loaded song reachable with Previous even during that handoff.
    const id = videoIdRef.current;
    if (id && playerRef.current?.loaded() === id) recordHeard(id);
    return nextTrack();
  }

  function playHistory(position: number) {
    const current = historyRef.current;
    const id = current.tracks[position];
    if (!id || !playableTrack(id)) return;
    setHistory({ ...current, position });
    primeAudio(id);
    const index = queueRef.current.findIndex(song => song.id === id);
    if (index >= 0) playQueueIndex(index);
    else {
      autoplayVideoIdRef.current = id;
      setAutoplayVideoId(id);
      playerRef.current?.loadVideoById(id);
    }
  }
  const prevTrack = () => {
    const previous = historyRef.current;
    for (let i = previous.position - 1; i >= 0; i--) {
      if (playableTrack(previous.tracks[i])) { playHistory(i); return; }
    }
    playerRef.current?.seekTo(0, true);
  };

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;

    // The catalogue can arrive after the iframe API on a slow network.
    // Wait for both so the first Play click uses the intended queue.
    Promise.all([loadYouTubeApi(), loadFullQueue()]).then(() => {
      if (cancelled || !containerRef.current || playerCreatedRef.current) return;
      playerCreatedRef.current = true;

      // What either engine reports, handled once (lib/music/playbackEngine.ts). Only the engine
      // of the track loaded is heard: the other one's last events (YouTube's pause as a Monster
      // Siren song starts, the audio's as YouTube takes over) are not about this track.
      const fromEngine = (kind: 'youtube' | 'msr', run: (engine: TrackEngine) => void) => {
        const engine = playerRef.current;
        if (engine?.active() === kind) run(engine);
      };
      // The element the first press already primed (lib/music/audioElement.ts), or made now.
      const audioEvents = {
        onState: (state: number) => fromEngine('msr', (engine) => onPlayerState(state, engine)),
        onError: () => fromEngine('msr', onPlayerError),
        onAutoplayBlocked: () => fromEngine('msr', onAutoplayRefused),
        onStuck: () => fromEngine('msr', onStuck),
      };
      const native = nativeAudioPlugin();
      const audio = native ? createNativeAudioEngine(audioEvents, native, (id, cid) => {
        const song = catalogRef.current?.find(song => song.id === id);
        return { id, cid, title: song ? songTitle(song.title, song.altTitle) : 'Arkpedia',
          artist: song?.artist || 'Monster Siren Records', album: song?.album || '', autoplay: autoplayVideoIdRef.current === id };
      }, musicAudioElement()) : createMsrAudioEngine(audioEvents, { element: musicAudioElement() });
      audioRef.current = audio;

      const onPlayerError = () => {
        // Unplayable video (deleted, region-blocked, embedding
        // disabled, age-restricted, etc.), or Monster Siren audio that
        // would not load -- skip it instead of leaving playback dead
        // with no recovery.
        setIsPlaying(false);
        setBuffering(false);
        // A short saved playlist may consist entirely of unavailable videos.
        // Stop at its end instead of wrapping and retrying the same failures forever.
        const order = shuffleRef.current ? shuffleOrderRef.current : null;
        const atEnd = order ? shufflePositionRef.current >= order.length - 1
          : queueIndexRef.current >= queueRef.current.length - 1;
        if (playlistIdsRef.current && atEnd) { endResumeWatch(); return; }
        nextTrack();
      };

      // The browser would not let this document start sound by itself (autoplay): a resumed
      // song waits at its moment for the reader's Play. So does a song that came up by itself
      // (the last one ended): it is loaded and shown, paused, one press away, rather than the
      // player hanging on the song before. Monster Siren's audio meets this on iOS, where only
      // a press starts sound.
      const onAutoplayRefused = (engine: TrackEngine) => {
        setEngineKind(engine.active());
        setBuffering(false);
        if (resumeWatchRef.current) { refuseResume(); return; }
        setIsPlaying(false);
        setStarting(false);
        const id = engine.getVideoData()?.video_id || engine.loaded();
        if (!id) return;
        const seconds = engine.getCurrentTime();
        cuedAtRef.current = { videoId: id, seconds };
        videoIdRef.current = id;
        setVideoId(id);
        setTitle(catalogRef.current?.find((song) => song.id === id)?.title ?? '');
        setCurrentTime(seconds);
        setDuration(engine.getDuration());
      };

      // A Monster Siren song that made no sound, from its address and from a fresh one: it waits,
      // paused where it was, with a word under the player, for the reader's Play
      // (lib/music/playbackEngine.ts's watchdog). Never Pause over silence.
      const onStuck = (engine: TrackEngine) => {
        playerStateRef.current = PLAYER_STATE.PAUSED;
        setEngineKind(engine.active());
        endResumeWatch();
        pendingPlayRef.current = false;
        setIsPlaying(false);
        setBuffering(false);
        setStarting(false);
        const id = engine.getVideoData()?.video_id || engine.loaded();
        if (id) {
          videoIdRef.current = id;
          setVideoId(id);
          setCurrentTime(engine.getCurrentTime());
        }
        announce(STUCK_NOTICE, false, true);
      };

      const onPlayerState = (data: number, engine: TrackEngine) => {
        const state = PLAYER_STATE;
        if (engine.active() === 'msr' && isNativeEngine(audio)) {
          const track = audio.track();
          if (track && track.id !== videoIdRef.current) {
            const index = queueRef.current.findIndex(song => song.id === track.id);
            if (index >= 0) {
              queueIndexRef.current = index; setQueueIndex(index);
              const at = shuffleOrderRef.current?.indexOf(index) ?? -1;
              if (at >= 0) { shufflePositionRef.current = at; setShufflePosition(at); }
            }
            autoplayVideoIdRef.current = track.autoplay ? track.id : '';
            setAutoplayVideoId(autoplayVideoIdRef.current);
            videoIdRef.current = track.id; setVideoId(track.id); setTitle(track.title);
            setCurrentTime(engine.getCurrentTime()); setDuration(engine.getDuration());
          }
        }
        // Ignore unsolicited playback before a main-player request.
        if (!manualAudio.current && !videoIdRef.current && data === state.PLAYING) {
          engine.pauseVideo(); return;
        }
        if (data === state.PLAYING) window.dispatchEvent(new Event(MAIN_AUDIO_START));
        playerStateRef.current = data;
        setEngineKind(engine.active());
        // Monster Siren's audio reports BUFFERING from the press until its clock moves, and
        // whenever it stops for data: not playing, and shown as loading. (YouTube's own brief
        // buffering keeps the button as it was, as before.)
        if (data === state.BUFFERING && engine.active() === 'msr') {
          setIsPlaying(false);
          setBuffering(true);
          // The song loading is the one shown, not the one before it.
          const id = engine.getVideoData()?.video_id;
          if (id && id !== videoIdRef.current) {
            videoIdRef.current = id;
            setVideoId(id);
            setTitle('');
            setCurrentTime(engine.getCurrentTime());
            setDuration(engine.getDuration());
          }
        } else if (data !== state.BUFFERING) {
          setBuffering(false);
        }
        const watch = resumeWatchRef.current;
        if (data === state.CUED && watch?.phase === 'cue') {
          watch.phase = 'play';
          watch.since = Date.now();
          engine.playVideo();
        }
        if (data === state.PLAYING) {
          cuedAtRef.current = null;
          hiddenLoadRef.current = null;
          endResumeWatch();
          setIsPlaying(true);
          const video = engine.getVideoData();
          setTitle(video?.title || '');
          // The ref too, at once: the next song is worked out from it just below.
          videoIdRef.current = video?.video_id || '';
          recordHeard(videoIdRef.current);
          setVideoId(videoIdRef.current);
          setDuration(engine.getDuration());
          // Retry if the initial catalogue load failed.
          if (queueRef.current.length === 0) loadFullQueue();
        } else if (data === state.PAUSED) {
          if (!position.get().seeking) setCurrentTime(cuedAtRef.current?.seconds ?? engine.getCurrentTime());
          setIsPlaying(false);
        } else if (data === state.ENDED) {
          setIsPlaying(false);
          if (repeatModeRef.current === 'one') {
            const id = engine.getVideoData()?.video_id || videoIdRef.current;
            if (id) engine.loadVideoById(id);
          } else {
            nextTrack();
          }
        }
      };

      new window.YT.Player(containerRef.current, {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
        },
        events: {
          onReady: async (e: { target: YTPlayer }) => {
            // routeTrack reads the refs it needs at each call: Data saver, the catalogue.
            const engine = createTrackEngine(e.target, audio, (id) => routeTrack(id));
            playerRef.current = engine;
            playerReadyRef.current = true;
            // The song the last document was playing (lib/music/musicResume.ts), if any.
            const record = resumeRef.current;
            resumeRef.current = null;
            // The reader's volume is their preference (musicVolume); the record's only stands
            // in where this browser kept none.
            let savedVolume = record?.volume ?? 50;
            try {
              const v = window.localStorage.getItem('musicVolume');
              if (v) savedVolume = parseFloat(v);
            } catch {
              /* ignore */
            }
            engine.setVolume(savedVolume);
            setVolume(savedVolume);

            if (isNativeEngine(audio) && !pendingVideoIdRef.current && await audio.restore()) {
              manualAudio.current = true;
              engine.adoptNative(); audio.refresh();
              pendingPlayRef.current = false;
              setReady(true); setStarting(false);
              return;
            }

            // A specific track was requested (via playTrackByVideoId)
            // before the player finished initializing -- load THAT
            // one directly instead of the default start-of-queue cue.
            // It wins over the resumed song: the reader just chose it.
            if (pendingVideoIdRef.current) {
              const vid = pendingVideoIdRef.current;
              pendingVideoIdRef.current = null;
              pendingPlayRef.current = false;
              if (pendingFirstRef.current === vid) { putFirst(vid); pendingFirstRef.current = null; }
              const idx = queueRef.current.findIndex((track) => track.id === vid);
              if (idx !== -1) {
                queueIndexRef.current = idx;
                setQueueIndex(idx);
                const pos = shuffleOrderRef.current?.indexOf(idx) ?? -1;
                if (pos !== -1) {
                  shufflePositionRef.current = pos;
                  setShufflePosition(pos);
                }
              }
              engine.loadVideoById(vid);
              setReady(true);
              setStarting(false);
              return;
            }

            // The song carried over from the last document: cued at its moment, so a
            // refused start still leaves it there, one press of Play away; when it was
            // playing, Play follows once YouTube says it is cued (onStateChange). Not a song
            // the reader's settings leave out (a copyrighted song while stream-safe is on, an
            // Endfield song while Endfield music is off), which another tab may have changed since.
            const excluded = record && catalogRef.current?.some((song) => song.id === record.videoId && !allowed(song));
            if (record && excluded) {
              // The queue as it would start, stopped; not the record's song on show.
              pendingPlayRef.current = false;
              setVideoId('');
              setTitle('');
              setCurrentTime(0);
              setDuration(0);
            } else if (record) {
              const play = pendingPlayRef.current;
              pendingPlayRef.current = false;
              cuedAtRef.current = { videoId: record.videoId, seconds: record.seconds };
              engine.cueVideoById({ videoId: record.videoId, startSeconds: record.seconds });
              setReady(true);
              if (play) {
                resumeWatchRef.current = { videoId: record.videoId, seconds: record.seconds, phase: 'cue', since: Date.now() };
                watchResume();
              } else {
                setStarting(false);
              }
              return;
            }

            // The queue (and its shuffle order, if shuffle's on) has
            // finished loading -- cue whatever sits at
            // its own starting position, so queueIndex/shufflePosition
            // are correct from the very first frame rather than picking
            // a SEPARATE random song here that wouldn't correspond to
            // anything in the queue's own order.
            const q = queueRef.current;
            const order = shuffleRef.current ? shuffleOrderRef.current : null;
            const startIdx = order && order.length > 0 ? order[0] : 0;
            if (q.length > 0) {
              engine.cueVideoById(q[startIdx].id);
              setQueueIndex(startIdx);
              if (order && order.length > 0) {
                shufflePositionRef.current = 0;
                setShufflePosition(0);
              }
            }
            setReady(true);
            // The user already pressed play before initialization
            // finished (a click on the collapsed player, or on play
            // itself) -- honor that now instead of leaving them to
            // press play a second time.
            if (pendingPlayRef.current) {
              pendingPlayRef.current = false;
              if (q.length) engine.playVideo();
              else if (!playAutoplayTrack()) { announce('Pick a song in Library or Discover.'); void router.push('/music?view=library'); }
            }
            setStarting(false);
          },
          onError: () => fromEngine('youtube', onPlayerError),
          onAutoplayBlocked: () => fromEngine('youtube', onAutoplayRefused),
          onStateChange: (e: { data: number }) => fromEngine('youtube', (engine) => onPlayerState(e.data, engine)),
        },
      });
    });

    return () => {
      cancelled = true;
    };
  // watchResume and refuseResume read only refs and stable setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, loadFullQueue, nextTrack, endResumeWatch]);

  // A resumed song that does not start: the browser refused it (YouTube does not always
  // say so) or it never came. It waits, cued at its moment, for the reader's Play.
  function refuseResume() {
    setStarting(false); setBuffering(false);
    const watch = resumeWatchRef.current;
    const player = playerRef.current;
    endResumeWatch();
    setIsPlaying(false);
    if (!watch || !player) return;
    // Paused somewhere: it stays there. Otherwise cued again, as a refused start may have left
    // YouTube unstarted, without the moment.
    if (playerStateRef.current === PLAYER_STATE.PAUSED) {
      setCurrentTime(player.getCurrentTime());
      return;
    }
    player.cueVideoById({ videoId: watch.videoId, startSeconds: watch.seconds });
    cuedAtRef.current = { videoId: watch.videoId, seconds: watch.seconds };
    setCurrentTime(watch.seconds);
  }

  function watchResume() {
    window.clearInterval(resumeTimerRef.current);
    resumeTimerRef.current = window.setInterval(() => {
      const watch = resumeWatchRef.current;
      if (!watch) {
        window.clearInterval(resumeTimerRef.current);
        return;
      }
      const waited = Date.now() - watch.since;
      if (playerStateRef.current === PLAYER_STATE.BUFFERING && waited < RESUME_BUFFER_MS) return;
      if (waited < (watch.phase === 'cue' ? RESUME_CUE_MS : RESUME_PLAY_MS)) return;
      refuseResume();
    }, 500);
  }

  // Unmounting ends the watch with the provider.
  useEffect(() => () => window.clearInterval(resumeTimerRef.current), []);

  // Poll playback position while playing, for the seek bar. Skipped while
  // the person is actively dragging the seek bar themselves.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || position.get().seeking) return;
      setCurrentTime(player.getCurrentTime());
      selectPreload();
    }, 500);
    return () => clearInterval(interval);
  // The store and selectPreload read refs: the interval needs no fresh closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const initializePlayer = useCallback((prompt = true) => {
    if (!prompt && !readPrivacy().externalMedia) return;
    requestExternalMedia(() => {
      // Opening the player or adding to its queue is not a request for sound.
      // Only a pending play may interrupt the page's background theme.
      if (pendingPlayRef.current || pendingVideoIdRef.current) primeAudio(pendingVideoIdRef.current ?? videoIdRef.current);
      setInitialized(true);
    }, () => { pendingPlayRef.current = false; setStarting(false); setBuffering(false); });
  // The permission callback uses current playback refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pausePlayback = useCallback(() => {
    pendingPlayRef.current = false;
    pendingVideoIdRef.current = null;
    // A song resumed from the last document stays where it is, paused.
    if (resumeRef.current) resumeRef.current = { ...resumeRef.current, playing: false };
    if (resumeWatchRef.current) {
      const { videoId, seconds } = resumeWatchRef.current;
      cuedAtRef.current = { videoId, seconds };
      endResumeWatch();
    }
    playerRef.current?.pauseVideo?.();
    isPlayingRef.current = false;
    setStarting(false);
    setIsPlaying(false);
    bufferingRef.current = false;
    setBufferingState(false);
  }, [endResumeWatch]);

  /*
   * Where the music is, for the next document of this tab (lib/music/musicResume.ts): as this
   * one goes (pagehide), when the tab is hidden (a phone may drop it there without a pagehide),
   * and at each new track, play and pause. Nothing until a song has been played or resumed.
   */
  const leftRef = useRef(false);
  const saveResume = useCallback((left: boolean) => {
    // Once the document is going, nothing writes over the record it left: the browser fires
    // visibilitychange after pagehide as it unloads, and YouTube may still report a pause.
    if (leftRef.current && !left) return;
    if (left) leftRef.current = true;
    const storage = sessionStore();
    if (!storage) return;
    const pending = resumeRef.current;
    const player = playerRef.current;
    if (!playerReadyRef.current || !player) {
      // YouTube is still loading: the record this document took, unchanged but for Play.
      if (pending) writeMusicResume(storage, { ...pending, savedAt: Date.now(), left, playing: pendingPlayRef.current });
      return;
    }
    // A player opened but never played has nothing to carry: YouTube stays unloaded until used.
    if (!videoIdRef.current) return;
    let videoId = videoIdRef.current;
    let seconds = position.get().currentTime;
    try {
      videoId = player.getVideoData()?.video_id || videoId;
      seconds = player.getCurrentTime();
    } catch {
      /* The figures the page last had. */
    }
    const cued = cuedAtRef.current;
    if (cued?.videoId === videoId) seconds = cued.seconds;
    const queue = queueRef.current;
    const order = shuffleRef.current ? shuffleOrderRef.current : null;
    writeMusicResume(storage, {
      version: 1,
      savedAt: Date.now(),
      left,
      videoId,
      title: titleRef.current.slice(0, 500),
      seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
      duration: Number.isFinite(position.get().duration) && position.get().duration > 0 ? position.get().duration : 0,
      // A play still loading is carried as playing: the next document asks for it again.
      playing: isPlayingRef.current || bufferingRef.current || pendingPlayRef.current || !!resumeWatchRef.current,
      queue: queue.map((track) => track.id),
      source: queueSourceRef.current ?? undefined,
      history: historyRef.current,
      playlistIds: playlistIdsRef.current,
      playingPlaylistId: playingPlaylistIdRef.current,
      queueIndex: queueIndexRef.current,
      shuffle: shuffleRef.current,
      shuffleOrder: order ? order.flatMap((index) => (queue[index] ? [queue[index].id] : [])) : null,
      shufflePosition: shufflePositionRef.current,
      repeat: repeatModeRef.current,
      volume: Math.min(100, Math.max(0, Number.isFinite(volumeRef.current) ? volumeRef.current : 50)),
      queued: [...queuedRef.current],
      queueMode: 'chosen', autoplay: autoplayRef.current, autoplayOrder: autoplayOrderRef.current,
      ...(autoplayVideoIdRef.current ? { autoplayVideoId: autoplayVideoIdRef.current } : {}),
    });
  }, [position]);

  useEffect(() => {
    const onPageHide = () => saveResume(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveResume(false);
    };
    // Back from the back/forward cache: this document lives on, so its record is no longer
    // one of a document that went.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      leftRef.current = false;
      saveResume(false);
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [saveResume]);

  useEffect(() => {
    if (videoId) saveResume(false);
  }, [videoId, isPlaying, saveResume]);

  /*
   * The page hidden (another app or tab, the screen locked): nothing here pauses or releases the
   * music -- Monster Siren's <audio> plays on, and goes on to the next song by itself (set and
   * played in the last one's end, lib/music/playbackEngine.ts). A song YouTube was given meanwhile (no Monster
   * Siren id, or Data saver on) may not start until the page is back, as a phone pauses YouTube
   * there: once it is, that song is shown and given the resume's few seconds to start, and if it
   * does not it waits, shown and paused at its start, for the reader's Play (refuseResume).
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return;
      const id = hiddenLoadRef.current;
      hiddenLoadRef.current = null;
      const engine = playerRef.current;
      if (!id || !engine || engine.loaded() !== id || engine.active() !== 'youtube') return;
      if (playerStateRef.current === PLAYER_STATE.PLAYING) return;
      cuedAtRef.current = null;
      videoIdRef.current = id;
      setVideoId(id);
      setTitle(catalogRef.current?.find((song) => song.id === id)?.title ?? '');
      setCurrentTime(0);
      resumeWatchRef.current = { videoId: id, seconds: 0, phase: 'play', since: Date.now() };
      watchResume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  // watchResume reads refs only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ... and this document picks it up, once, on its first render.
  useEffect(() => {
    // Only where the player is drawn: the recruitment pop-out has none (hideSiteChrome),
    // and a window opened from this tab starts with a copy of its sessionStorage.
    if (!containerRef.current) return;
    const savedRecord = takeMusicResume(sessionStore(), Date.now(), { discarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true });
    const record = savedRecord;
    if (!record) return;
    manualAudio.current = true;
    // The music guesser pauses the player as it opens (its effect runs before this one): a
    // song resumed there would play over its clips.
    const play = record.playing && router.pathname !== GAME_PATHS.music;
    resumeRef.current = { ...record, playing: play };
    playlistIdsRef.current = record.playlistIds ?? record.queue;
    autoplayOrderRef.current = record.autoplayOrder ?? []; setAutoplayOrderState(autoplayOrderRef.current);
    autoplayVideoIdRef.current = record.autoplayVideoId ?? ''; setAutoplayVideoId(autoplayVideoIdRef.current);
    if (record.autoplay !== undefined) {
      let preference = record.autoplay;
      try { const stored = window.localStorage.getItem('arkpediaMusicAutoplay'); if (stored !== null) preference = stored === 'true'; } catch { /* refused */ }
      autoplayRef.current = preference; setAutoplayState(preference);
    }
    playingPlaylistIdRef.current = record.playingPlaylistId ?? null;
    setPlayingPlaylistId(playingPlaylistIdRef.current);
    setQueueSource(record.source ?? (record.playingPlaylistId ? { name: 'Saved playlist', href: '/music?view=library&playlist=' + encodeURIComponent(record.playingPlaylistId), playlistId: record.playingPlaylistId } : null));
    if (record.history) setHistory(record.history);
    pendingPlayRef.current = play;
    shuffleRef.current = record.shuffle;
    setShuffle(record.shuffle);
    repeatModeRef.current = record.repeat;
    setRepeatMode(record.repeat);
    // What the player shows until YouTube is back: the song and where in it.
    setVideoId(record.videoId);
    setTitle(record.title);
    setCurrentTime(record.seconds);
    setDuration(record.duration);
    if (play) setStarting(true);
    if (readPrivacy().externalMedia) setInitialized(true);
    else { pendingPlayRef.current = false; setStarting(false); }
  // Once: a record is for the document's first page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
    // A press that may start music primes the audio first, in the press (iOS); one that pauses
    // a loading or playing song needs none.
    if (!isPlayingRef.current && !bufferingRef.current) {
      // Before the player is up, a reload's song is the one Play goes on with, where it was.
      const resume = !playerReadyRef.current ? resumeRef.current : null;
      if (resume?.videoId) primeAudio(resume.videoId, resume.seconds);
      else {
        const id = videoIdRef.current || queueRef.current[shuffleOrderRef.current?.[0] ?? 0]?.id;
        const cued = cuedAtRef.current;
        primeAudio(id, id && cued?.videoId === id ? cued.seconds : 0);
      }
    }
    const player = playerRef.current;
    if (!player || typeof player.playVideo !== 'function' || typeof player.pauseVideo !== 'function') {
      // Not initialized, or the underlying player object exists but
      // isn't fully wired up with its playback methods yet -- start
      // loading now (if not already in progress), and auto-play the
      // moment it's ready instead of silently doing nothing or
      // throwing on a not-yet-callable method.
      pendingPlayRef.current = true;
      setStarting(true);
      if (!player) initializePlayer();
      return;
    }
    endResumeWatch();
    // Loading counts as playing here: the button shows it, and a press stops it.
    if (isPlayingRef.current || bufferingRef.current) pausePlayback();
    else if (videoIdRef.current && !catalogRef.current?.some(song => song.id === videoIdRef.current && !allowed(song))) player.playVideo();
    else if (queueRef.current.length) loadTrackAt(shuffleOrderRef.current?.[0] ?? 0);
    else if (!playAutoplayTrack()) { announce('Pick a song in Library or Discover.'); void router.push('/music?view=library'); }
  }

  // Jumps playback to a SPECIFIC song by videoId -- used by the /music
  // manager page when someone clicks a song directly, rather than the
  // next/prev-through-the-queue flow. Does NOT confine future next/prev
  // to just that song's album: if the track is already in the loaded
  // queue (loaded alongside the player),
  // this just jumps there.
  function putFirst(videoId: string) {
    const previous = queueRef.current;
    const index = previous.findIndex(track => track.id === videoId);
    const song = catalogRef.current?.find(song => song.id === videoId);
    const track = previous[index] ?? (song && allowed(song) ? toQueueTrack(song) : null);
    if (!track) return;
    const next = [track, ...previous.filter(track => track.id !== videoId)];
    autoplayVideoIdRef.current = ''; setAutoplayVideoId('');
    playlistIdsRef.current = [...new Set([...(playlistIdsRef.current ?? []), videoId])];
    queueRef.current = next; setQueue(next); queueIndexRef.current = 0; setQueueIndex(0);
    if (shuffleRef.current) {
      const existing = shuffleOrderRef.current ?? previous.map((_, i) => i);
      const ids = existing.map(i => previous[i]?.id).filter(id => id && id !== videoId);
      const order = [0, ...ids.map(id => next.findIndex(track => track.id === id))];
      shuffleOrderRef.current = order; setShuffleOrder(order); shufflePositionRef.current = 0; setShufflePosition(0);
    }
  }
  function playFirst(videoId: string) {
    if (!playerReadyRef.current) pendingFirstRef.current = videoId;
    else putFirst(videoId);
    playTrackByVideoId(videoId);
  }
  function playTrackByVideoId(videoId: string) {
    primeAudio(videoId);
    const player = playerRef.current;
    if (!playerReadyRef.current || !player || typeof player.loadVideoById !== 'function') {
      // Not initialized yet -- remember which track was requested and
      // start initializing; onReady (above) loads it directly once the
      // player comes up, instead of the usual default-position cue.
      pendingVideoIdRef.current = videoId;
      pendingPlayRef.current = true;
      setStarting(true);
      if (!player) initializePlayer();
      return;
    }
    const q = queueRef.current;
    const idx = q.findIndex((t) => t.id === videoId);
    if (idx !== -1) {
      loadTrackAt(idx);
      const order = shuffleOrderRef.current;
      if (shuffleRef.current && order) {
        const pos = order.indexOf(idx);
        if (pos !== -1) {
          shufflePositionRef.current = pos;
          setShufflePosition(pos);
        }
      }
    } else {
      // A discovery link may point to a song outside the current queue.
      endResumeWatch();
      cuedAtRef.current = null;
      player.loadVideoById(videoId);
    }
    player.playVideo();
  }

  async function playPlaylist(videoIds: string[] | null, source?: MusicSource, selectedId?: string): Promise<number> {
    const request = ++collectionRequest.current;
    const requestedId = selectedId ?? videoIds?.[0];
    primeAudio(requestedId && playableTrack(requestedId) ? requestedId : undefined);
    try {
      await buildQueueFromCatalog();
    } catch {
      announce('Could not load the music catalogue. Try again.');
      return 0;
    }
    if (request !== collectionRequest.current) return 0;
    const byId = new Map((catalogRef.current ?? []).filter(allowed).map(song => [song.id, toQueueTrack(song)]));
    const ids = [...new Set(videoIds ?? byId.keys())];
    const tracks = ids.flatMap(id => byId.get(id) ?? []);
    const index = selectedId ? tracks.findIndex(song => song.id === selectedId) : 0;
    if (!tracks.length || index < 0) {
      announce('This selection is unavailable with your music settings.');
      return 0;
    }
    // Take the complete collection at the moment Play was pressed. Later browsing cannot change it.
    playlistIdsRef.current = ids;
    playingPlaylistIdRef.current = source?.playlistId ?? null;
    setPlayingPlaylistId(playingPlaylistIdRef.current);
    setQueueSource(source ?? { name: 'Library', href: '/music?view=library' });
    clearedRef.current = null;
    setCanUndoClear(false);
    // Explicit requests already lined up play before the new source continues.
    const previous = queueState();
    const oldOrder = previous.shuffleOrder ?? previous.queue.map((_, i) => i);
    const manual = oldOrder.map(i => previous.queue[i]).filter(song => previous.queued.has(song.id) && song.id !== tracks[index].id && byId.has(song.id));
    const manualIds = new Set(manual.map(song => song.id));
    const collection = tracks.filter(song => !manualIds.has(song.id));
    const start = collection.findIndex(song => song.id === tracks[index].id);
    collection.splice(start + 1, 0, ...manual);
    const order = shuffleRef.current ? generateShuffleOrder(collection.length, start).filter(i => !manualIds.has(collection[i].id)) : null;
    if (order) order.splice(1, 0, ...manual.map((_, i) => start + i + 1));
    applyQueueState({ queue: collection, queueIndex: start, shuffleOrder: order, shufflePosition: 0, queued: manualIds });
    discardForward();
    pendingFirstRef.current = null;
    autoplayVideoIdRef.current = ''; setAutoplayVideoId('');
    playQueueIndex(start);
    return tracks.length;
  }

  function toggleShuffle() {
    const turningOn = !shuffleRef.current;
    shuffleRef.current = turningOn; setShuffle(turningOn);
    let q = queueRef.current;
    if (autoplayVideoIdRef.current && shuffleOrderRef.current) {
      const previous = shuffleOrderRef.current;
      const index = Math.max(0, previous.indexOf(queueIndexRef.current));
      q = previous.map(position => q[position]);
      queueRef.current = q; setQueue(q); queueIndexRef.current = index; setQueueIndex(index);
    }
    if (!turningOn && !autoplayVideoIdRef.current && queuedRef.current.size) {
      const current = q[queueIndexRef.current];
      const order = shuffleOrderRef.current ?? q.map((_, i) => i);
      const pending = order.map(i => q[i]).filter(song => song.id !== current?.id && queuedRef.current.has(song.id));
      const requested = new Set(pending.map(song => song.id));
      q = q.filter(song => !requested.has(song.id));
      const index = Math.max(0, q.indexOf(current));
      q.splice(index + 1, 0, ...pending);
      queueRef.current = q; setQueue(q);
      queueIndexRef.current = index; setQueueIndex(index);
    }
    let order = turningOn && q.length ? autoplayVideoIdRef.current ? q.map((_, index) => index) : generateShuffleOrder(q.length, queueIndexRef.current) : null;
    if (order && !autoplayVideoIdRef.current && queuedRef.current.size) {
      const pending = q.map((_, index) => index).filter(index => queuedRef.current.has(q[index].id) && index !== queueIndexRef.current);
      const requested = new Set(pending);
      order = [order[0], ...pending, ...order.slice(1).filter(index => !requested.has(index))];
    }
    shuffleOrderRef.current = order; setShuffleOrder(order);
    const position = order ? Math.max(0, order.indexOf(queueIndexRef.current)) : 0;
    shufflePositionRef.current = position; setShufflePosition(position);
    const library = catalogRef.current ?? [];
    const at = Math.max(0, library.findIndex(song => song.id === videoIdRef.current));
    autoplayOrderRef.current = turningOn && library.length ? generateShuffleOrder(library.length, at).map(index => library[index].id) : [];
    setAutoplayOrderState(autoplayOrderRef.current);
  }

  function cycleRepeat() {
    const current = repeatModeRef.current;
    const next = current === 'off' ? 'one' : current === 'one' ? 'all' : 'off';
    repeatModeRef.current = next; setRepeatMode(next);
  }

  /**
   * Data saver on or off. The song loaded now moves to the engine the setting gives it, at the
   * same moment and in the same state: playing on (the press that changed it lets the new engine
   * start sound) or paused there, with the other engine stopped first (createTrackEngine).
   */
  function setDataSaver(on: boolean) {
    dataSaverRef.current = on;
    setDataSaverState(on);
    try { window.localStorage.setItem(MUSIC_DATA_SAVER_KEY, String(on)); } catch { /* refused: this visit only */ }
    const engine = playerRef.current;
    const id = engine?.loaded();
    if (!engine || !playerReadyRef.current || !id || engine.routeOf(id) === engine.active()) return;
    const cued = cuedAtRef.current?.videoId === id ? cuedAtRef.current : null;
    let seconds = cued ? cued.seconds : engine.getCurrentTime();
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const play = isPlayingRef.current || Boolean(resumeWatchRef.current) || playerStateRef.current === PLAYER_STATE.BUFFERING;
    endResumeWatch();
    hiddenLoadRef.current = null;
    if (play) {
      primeAudio(id);
      cuedAtRef.current = null;
      engine.loadVideoById({ videoId: id, startSeconds: seconds });
    } else {
      cuedAtRef.current = { videoId: id, seconds };
      engine.cueVideoById({ videoId: id, startSeconds: seconds });
      setCurrentTime(seconds);
    }
    setEngineKind(engine.active());
  }

  function setVolumeLevel(v: number) {
    const muting = v === 0 && volumeRef.current > 0;
    if (muting) lastAudibleVolumeRef.current = volumeRef.current;
    else if (v > 0) lastAudibleVolumeRef.current = v;
    volumeRef.current = v;
    setVolume(v);
    playerRef.current?.setVolume(v);
    try {
      window.localStorage.setItem('musicVolume', String(v));
      if (muting) window.localStorage.setItem('musicVolumeBeforeMute', String(lastAudibleVolumeRef.current));
    } catch {
      /* ignore */
    }
  }

  function toggleMute() {
    if (volumeRef.current > 0) { setVolumeLevel(0); return; }
    let previous = lastAudibleVolumeRef.current;
    try {
      const saved = Number(window.localStorage.getItem('musicVolumeBeforeMute'));
      if (Number.isFinite(saved) && saved > 0 && saved <= 100) previous = saved;
    } catch { /* The in-memory volume still restores when storage is unavailable. */ }
    setVolumeLevel(previous);
  }

  function handleSeekChange(v: number) {
    setCurrentTime(v);
  }

  function handleSeekCommit(v: number) {
    playerRef.current?.seekTo(v, true);
    // A cued song not yet played starts from here now.
    if (cuedAtRef.current) cuedAtRef.current = { ...cuedAtRef.current, seconds: v };
    setSeeking(false);
  }

  function setSeeking(v: boolean) {
    position.set({ seeking: v });
    // Preloading the next song waits while the reader drags.
    selectPreload();
  }

  function playQueueIndex(index: number, handoff?: { seconds: number; playing: boolean }) {
    if (!handoff || handoff.playing) primeAudio(queueRef.current[index]?.id, handoff?.seconds);
    // Before YouTube is ready a tap waited for nothing: it now waits for the player, as a song
    // chosen elsewhere does (playTrackByVideoId's pending request).
    if (!playerReadyRef.current) {
      const id = queueRef.current[index]?.id;
      if (id) playTrackByVideoId(id);
      return;
    }
    loadTrackAt(index, handoff);
    const order = shuffleOrderRef.current;
    if (shuffleRef.current && order) {
      const pos = order.indexOf(index);
      if (pos !== -1) {
        shufflePositionRef.current = pos;
        setShufflePosition(pos);
      }
    }
  }

  // Moves a track from one position directly to another -- powers
  // drag-and-drop reordering on the queue panel. If the currently-
  // playing track is the one being moved (or ends up shifted past by
  // another track moving around it), queueIndex is adjusted to match
  // so playback state stays consistent with what's actually loaded.
  // Regenerates the shuffle order (not just clears it) if shuffle is
  // on, since the queue display now renders directly from it -- a
  // stale or cleared order would show the wrong list after a reorder.
  function reorderQueue(fromIndex: number, toIndex: number) {
    // Computed from the refs, here and now: the old version read values its setState updaters
    // assigned, which React 18 may run only at the next render, so the shuffle position was
    // worked out from stale ones and "the song playing" could land anywhere in the queue.
    const current = queueRef.current;
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const playing = queueIndexRef.current;
    const newCurrentIndex = playing === fromIndex ? toIndex
      : fromIndex < playing && toIndex >= playing ? playing - 1
        : fromIndex > playing && toIndex <= playing ? playing + 1 : playing;
    let order: number[] | null = null;
    if (shuffleRef.current && next.length > 0) {
      const existingOrder = shuffleOrderRef.current;
      order = existingOrder
        ? existingOrder.map((idx) => remapIndexAfterMove(idx, fromIndex, toIndex))
        : generateShuffleOrder(next.length, newCurrentIndex); // no order to remap yet -- only path that still needs a fresh one
    }
    applyQueueState({ queue: next, queueIndex: newCurrentIndex, shuffleOrder: order,
      shufflePosition: order ? Math.max(0, order.indexOf(newCurrentIndex)) : 0, queued: queuedRef.current });
  }

  // Reorders the SHUFFLE ORDER's own positions directly -- once
  // something's already shuffled, dragging a row rearranges the
  // shuffled play sequence itself (which song plays 3rd vs 7th, etc.),
  // not the underlying catalog order those songs came from. Much
  // simpler than reorderQueue above: no song actually changes its
  // position in the `queue` array at all here, only shuffleOrder's
  // sequence of references to it does, so there's no remapping of
  // other values needed -- just a plain splice-move on shuffleOrder
  // itself.
  function reorderShuffleOrder(fromPos: number, toPos: number) {
    if (fromPos === toPos) return;
    const order = shuffleOrderRef.current;
    if (!order || fromPos < 0 || fromPos >= order.length || toPos < 0 || toPos >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(fromPos, 1);
    next.splice(toPos, 0, moved);
    shuffleOrderRef.current = next;
    setShuffleOrder(next);
    const pos = next.indexOf(queueIndexRef.current);
    shufflePositionRef.current = pos !== -1 ? pos : 0;
    setShufflePosition(shufflePositionRef.current);
  }

  function moveQueueItemToTop(index: number) {
    const track = queueRef.current[index];
    if (track) void queueSong(track.id, 'next');
  }

  // Removes a track from the queue. Refuses to remove the currently-
  // playing track itself -- that's what the player controls
  // (pause/skip) are for, not the queue manager. Also regenerates the
  // shuffle order, for the same reason as reorderQueue above.
  function removeFromQueue(index: number) {
    // From the refs, synchronously, for the reason given at reorderQueue.
    const current = queueRef.current;
    const playing = queueIndexRef.current;
    if (index === playing || index < 0 || index >= current.length) return;
    const removedId = current[index].id;
    const next = current.filter((_, i) => i !== index);
    const newCurrentIndex = index < playing ? playing - 1 : playing;
    let order: number[] | null = null;
    if (shuffleRef.current && next.length > 0) {
      const existingOrder = shuffleOrderRef.current;
      order = existingOrder
        ? existingOrder
            .map((idx) => remapIndexAfterRemoval(idx, index))
            .filter((idx): idx is number => idx !== null)
        : generateShuffleOrder(next.length, newCurrentIndex); // no order to remap yet -- only path that still needs a fresh one
    }
    const queuedNow = new Set(queuedRef.current);
    queuedNow.delete(removedId);
    applyQueueState({ queue: next, queueIndex: newCurrentIndex, shuffleOrder: order,
      shufflePosition: order ? Math.max(0, order.indexOf(newCurrentIndex)) : 0, queued: queuedNow });
  }

  // A queued song that starts playing is no longer waiting in "Next in queue".
  useEffect(() => {
    if (!videoId || !queuedRef.current.has(videoId)) return;
    const next = new Set(queuedRef.current);
    next.delete(videoId);
    queuedRef.current = next;
    setQueued(next);
  }, [videoId]);

  function discardForward() {
    const current = historyRef.current;
    if (current.position < current.tracks.length - 1) setHistory({ ...current, tracks: current.tracks.slice(0, current.position + 1) });
  }

  function queueState(): QueueState<QueueTrack> {
    return { queue: queueRef.current, queueIndex: queueIndexRef.current, shuffleOrder: shuffleRef.current ? shuffleOrderRef.current : null,
      shufflePosition: shufflePositionRef.current, queued: queuedRef.current };
  }
  /** One queue edit, written to the refs (which the next call and YouTube's events read) and state. */
  function applyQueueState(next: QueueState<QueueTrack>) {
    queueRef.current = next.queue; setQueue(next.queue);
    queueIndexRef.current = next.queueIndex; setQueueIndex(next.queueIndex);
    if (shuffleRef.current) {
      shuffleOrderRef.current = next.shuffleOrder; setShuffleOrder(next.shuffleOrder);
      shufflePositionRef.current = next.shufflePosition; setShufflePosition(next.shufflePosition);
    }
    queuedRef.current = next.queued; setQueued(next.queued);
  }
  /** The catalogue's song as a queue row, unless the reader's settings leave it out. */
  function playableTrack(id: string): QueueTrack | null {
    const song = catalogRef.current?.find(entry => entry.id === id);
    return song && allowed(song) ? toQueueTrack(song) : null;
  }
  const trackTitle = (id: string) => {
    const track = queueRef.current.find(track => track.id === id);
    const song = catalogRef.current?.find(song => song.id === id);
    return songTitle(track?.title ?? song?.title ?? 'This song', track?.altTitle ?? song?.altTitle);
  };

  async function queueSong(id: string, where: Placement): Promise<QueueSongResult> {
    if (!queueRef.current.length) {
      initializePlayer();
      await loadFullQueue();
    }
    // The page's release may be newer than the catalogue loaded when the visit began: its songs
    // are queued from its own catalogue (a tab open across Endfield's release, 2026-10-22).
    try { await buildQueueFromCatalog(); } catch { /* Only songs already in the queue can be placed. */ }
    const state = queueState();
    const current = state.queue[state.queueIndex]?.id === videoIdRef.current || (autoplayVideoIdRef.current && state.queue.length && !state.queued.has(state.queue[state.queueIndex]?.id)) ? state.queueIndex : -1;
    const result = placeSong({ ...state, queueIndex: current, shufflePosition: current < 0 ? -1 : state.shufflePosition }, id, where, playableTrack(id));
    const title = trackTitle(id);
    if (!result.ok) {
      const song = catalogRef.current?.find(entry => entry.id === id);
      const why = song?.game === 'endfield' && !includeEndfieldRef.current ? ' while Endfield music is off'
        : excludeCopyrightedRef.current && song?.copyright ? ' while stream-safe is on' : '';
      announce(result.reason === 'current' ? `${title} is playing now.` : `${title} can’t be queued${why}.`);
      return result.reason;
    }
    discardForward();
    applyQueueState(result.state);
    if (playlistIdsRef.current && !playlistIdsRef.current.includes(id)) playlistIdsRef.current = [...playlistIdsRef.current, id];
    announce(where === 'next' ? `Playing next: ${title}` : `Added to queue: ${title}`);
    return 'queued';
  }

  function switchVersion() {
    if (!alternateVersion || !playerRef.current || !playerReadyRef.current) return;
    const id = videoIdRef.current;
    const target = alternateVersion.song.id;
    const { fromStart } = alternateVersion;
    const route = routeTrack(target);
    const engine = playerRef.current;
    if (!engine || videoIdRef.current !== id || engine.loaded() !== id) return;
    const seconds = cuedAtRef.current?.videoId === id ? cuedAtRef.current.seconds : engine.getCurrentTime();
    let at = fromStart || !Number.isFinite(seconds) ? 0 : seconds;
    const source = routeTrack(id);
    if (!fromStart) {
      const timing = versionTiming(source.kind === 'msr' ? source.cid : id, route.kind === 'msr' ? route.cid : target);
      at = Math.max(0, at + timing.offset);
      const duration = route.kind === 'msr' ? audioRef.current?.versionDuration(route.cid) : undefined;
      if (at >= (duration ?? timing.duration)) {
        announce('The other version has already ended.', false, true);
        return;
      }
    }
    clearPlaybackNotice();
    playNow(target, {
      seconds: at,
      playing: isPlayingRef.current || bufferingRef.current || playerStateRef.current === PLAYER_STATE.BUFFERING || Boolean(resumeWatchRef.current),
    });
  }

  function playNow(id: string, handoff?: { seconds: number; playing: boolean }) {
    if (!handoff || handoff.playing) primeAudio(id, handoff?.seconds);
    // Not loaded yet: the song is put first as the player starts (playFirst), which is the same
    // thing -- nothing has played, so the queue plays on after it.
    if (!playerReadyRef.current) {
      playFirst(id);
      return;
    }
    if (queueRef.current[queueIndexRef.current]?.id === id && videoIdRef.current === id) {
      if (!isPlayingRef.current && !bufferingRef.current) playerRef.current?.playVideo();
      return;
    }
    const state = queueState();
    const current = state.queue[state.queueIndex]?.id === videoIdRef.current || (autoplayVideoIdRef.current && state.queue.length && !state.queued.has(state.queue[state.queueIndex]?.id)) ? state.queueIndex : -1;
    const result = placeSong({ ...state, queueIndex: current, shufflePosition: current < 0 ? -1 : state.shufflePosition }, id, 'next', playableTrack(id));
    if (!result.ok) {
      // A song the queue cannot take (stream-safe, Endfield off): it plays on its own, as a discovery link did.
      playTrackByVideoId(id);
      return;
    }
    const queuedNow = new Set(result.state.queued);
    queuedNow.delete(id);
    applyQueueState({ ...result.state, queued: queuedNow });
    if (playlistIdsRef.current && !playlistIdsRef.current.includes(id)) playlistIdsRef.current = [...playlistIdsRef.current, id];
    playQueueIndex(result.state.queue.findIndex(track => track.id === id), handoff);
  }

  function clearQueue() {
    discardForward();
    const state = queueState();
    if (!state.queue.length) return;
    clearedRef.current = { state, playlistIds: playlistIdsRef.current, playingPlaylistId: playingPlaylistIdRef.current, source: queueSourceRef.current };
    setCanUndoClear(true);
    const cleared = clearUpcoming({ ...state, queueIndex: state.queue[state.queueIndex]?.id === videoIdRef.current ? state.queueIndex : -1 });
    applyQueueState(cleared);
    // A setting turned back (stream-safe off, Endfield on) must not refill a cleared queue with the whole catalogue.
    playlistIdsRef.current = cleared.queue.map(track => track.id);
    playingPlaylistIdRef.current = null; setPlayingPlaylistId(null);
    setQueueSource(null);
    announce(`Cleared ${state.queue.length - cleared.queue.length} songs from the queue.`, true);
  }

  function undoClearQueue() {
    const saved = clearedRef.current;
    if (!saved) return;
    clearedRef.current = null;
    setCanUndoClear(false);
    const playing = queueRef.current[queueIndexRef.current] ?? null;
    const restored = restoreAround(saved.state, playing?.id ?? null, playing);
    // Songs queued since the clear stay queued.
    applyQueueState({ ...restored, queued: new Set([...restored.queued, ...queuedRef.current]) });
    playlistIdsRef.current = saved.playlistIds;
    playingPlaylistIdRef.current = saved.playingPlaylistId; setPlayingPlaylistId(saved.playingPlaylistId);
    setQueueSource(saved.source);
    announce('Restored the queue.');
  }


  // The playing song's art and artist where the catalogue has none (lib/music/songArt.ts), and
  // Monster Siren's JPEG cover for the lock screen whenever its audio plays the song.
  const msrSession = Boolean(videoId) && engineKind === 'msr';
  const currentSource = videoId ? trackSource(videoId) : null;
  const currentCid = currentSource?.kind === 'msr' ? currentSource.cid : videoId ? cidOf(videoId) : undefined;
  const { art: songArt, settled: songArtSettled } = useSongArt(msrSession || !currentTrack?.cover ? currentCid : undefined);
  // Monster Siren's cover as this site serves it: its CDN refuses a request from this page.
  const msrCover = songArt?.cover && currentCid ? msrCoverPath(currentCid) : null;
  const nowPlayingCover = videoId ? currentTrack?.cover ?? msrCover ?? youtubeThumbnail(videoId) : null;
  const nowPlayingArtist = videoId ? currentTrack?.artist ?? artistLine(songArt?.artists) : null;
  const artwork = sessionArtwork({
    msrCover,
    msrCoverType: songArt?.cover ? imageType(songArt.cover) : undefined,
    youtube: youtubeThumbnail(videoId),
    cover: currentTrack?.cover ? contentUrl(currentTrack.cover) : null,
    icon: contentUrl(SITE_ICON_PATH),
    base: typeof window === 'undefined' ? 'https://www.arkpedia.net/' : window.location.href,
  });
  useMsrMediaSession({
    msr: msrSession && !isNativeEngine(audioRef.current),
    trackId: videoId,
    track: currentTrack,
    playing: isPlaying,
    art: { artist: nowPlayingArtist, album: songArt?.albumName ?? null, artwork, artworkPending: msrSession && !songArtSettled },
    actions: {
      // From the lock screen, a press too: a song still loading is asked to play again in it.
      play: () => {
        claimManualAudio();
        if (bufferingRef.current) { primeAudio(videoIdRef.current); playerRef.current?.playVideo(); } else if (!isPlayingRef.current) togglePlay();
      },
      pause: () => { claimManualAudio(); pausePlayback(); },
      next: manualNextTrack,
      previous: () => { claimManualAudio(); prevTrack(); },
      seek: (seconds) => { setCurrentTime(seconds); handleSeekCommit(seconds); },
    },
    position: () => ({ seconds: playerRef.current?.getCurrentTime() ?? position.get().currentTime, duration: playerRef.current?.getDuration() ?? position.get().duration }),
    element: msrSession ? audioRef.current?.element ?? null : null,
  });

  function claimManualAudio(cancelEventResume = true) {
    manualAudio.current = true;
    // A new personal-player choice supersedes an event's saved resume intent.
    if (cancelEventResume) eventAudioResume.current = null;
  }

  function pauseForEvent() {
    if (eventAudioActive.current || !getSetting('eventMusic') || !readPrivacy().externalMedia) return;
    eventAudioActive.current = true;
    const requested = isPlayingRef.current || bufferingRef.current || pendingPlayRef.current || starting;
    eventAudioResume.current = requested ? videoIdRef.current || pendingVideoIdRef.current : null;
    if (requested) pausePlayback();
  }
  function releaseEventAudio() {
    eventAudioActive.current = false;
    const id = eventAudioResume.current;
    eventAudioResume.current = null;
    if (id && id === videoIdRef.current && readPrivacy().externalMedia && !isPlayingRef.current && !bufferingRef.current &&
      !catalogRef.current?.some(song => song.id === id && !allowed(song))) togglePlay();
  }

  // The actions keep their identity across renders (lib/ui/useLatestActions.ts), so the value
  // below changes only with the state it carries.
  const actions = useLatestActions({
    setAutoplay, dismissNotice, setIncludeEndfield, setDataSaver, initializePlayer, pauseForEvent,
    toggleShuffle, cycleRepeat, toggleFavorite, toggleNoAutoplay: toggleSongNoAutoplay,
    reorderQueue, reorderShuffleOrder, moveQueueItemToTop, removeFromQueue, queueSong, clearQueue,
    undoClearQueue, setExcludeCopyrighted,
    togglePlay: () => { claimManualAudio(); togglePlay(); },
    pausePlayback: () => { claimManualAudio(); pausePlayback(); },
    nextTrack: manualNextTrack,
    prevTrack: () => { claimManualAudio(); prevTrack(); },
    playTrackByVideoId: (id: string) => { claimManualAudio(); playTrackByVideoId(id); },
    playFirst: (id: string) => { claimManualAudio(); playFirst(id); },
    switchVersion: () => { claimManualAudio(); switchVersion(); },
    playNow: (id: string) => { claimManualAudio(); playNow(id); },
    playQueueIndex: (index: number) => { claimManualAudio(); playQueueIndex(index); },
    playPlaylist: (ids: string[] | null, source?: MusicSource, selectedId?: string) => { claimManualAudio(); return playPlaylist(ids, source, selectedId); },
    playHistory: (position: number) => { claimManualAudio(); playHistory(position); },
    setVolumeLevel: (v: number) => { claimManualAudio(false); setVolumeLevel(v); },
    toggleMute: () => { claimManualAudio(false); toggleMute(); },
  });
  const eventAudioActions = useLatestActions({ pauseForEvent, releaseEventAudio });
  useEffect(() => {
    if (eventMusicEnabled && mediaAllowed && router.pathname.startsWith('/events/')) eventAudioActions.pauseForEvent();
    else if (router.pathname !== GAME_PATHS.music) eventAudioActions.releaseEventAudio();
  }, [router.pathname, eventMusicEnabled, mediaAllowed, eventAudioActions]);
  useEffect(() => {
    const cancel = () => { if (!router.pathname.startsWith('/events/')) eventAudioActions.releaseEventAudio(); };
    router.events.on('routeChangeError', cancel);
    return () => router.events.off('routeChangeError', cancel);
  }, [router.events, router.pathname, eventAudioActions]);
  const upcomingTrack = useMemo(() => {
    const forward = forwardPosition();
    if (forward >= 0) return playableTrack(history.tracks[forward]);
    const step = nextQueueStep();
    return step ? queue[step.index] : autoplay ? autoplayTracks[0] ?? null : null;
  // Same queue decision as Next, evaluated again whenever the refs it reads change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, queue, shuffleOrder, shuffle, queueIndex, videoId, repeatMode, autoplay, autoplayVideoId, autoplayTracks, queued]);
  const value = useMemo<MusicPlayerContextValue>(() => ({
    ready, starting, isPlaying, buffering, title, videoId, volume, shuffle, repeatMode, favorites,
    queue, queueIndex, shuffleOrder, shufflePosition, queueLoading, playingPlaylistId, queued, queueSource, history, upcomingTrack, libraryTracks, currentTrack, alternateVersion,
    nowPlayingCover, nowPlayingArtist, autoplay, autoplayVideoId, autoplayTracks, notice, excludeCopyrighted, includeEndfield, dataSaver,
    engineKind, noAutoplay, canUndoClear, containerRef, queueView, ...actions,
  }), [
    ready, starting, isPlaying, buffering, title, videoId, volume, shuffle, repeatMode, favorites,
    queue, queueIndex, shuffleOrder, shufflePosition, queueLoading, playingPlaylistId, queued, queueSource, history, upcomingTrack, libraryTracks, currentTrack, alternateVersion,
    nowPlayingCover, nowPlayingArtist, autoplay, autoplayVideoId, autoplayTracks, notice, excludeCopyrighted, includeEndfield, dataSaver,
    engineKind, noAutoplay, canUndoClear, actions,
  ]);
  const playbackActions = useLatestActions({
    handleSeekChange, handleSeekCommit, setSeeking,
    readPlaybackTime: () => playerRef.current?.getCurrentTime() ?? position.get().currentTime,
  });
  const playback = useMemo<MusicPlaybackContextValue>(() => ({ position, ...playbackActions }), [position, playbackActions]);

  return (
    <MusicPlayerContext.Provider value={value}>
      <MusicPlaybackContext.Provider value={playback}>
        {children}
        {endfieldNotice && <EndfieldNoticeDialog onClose={closeEndfieldNotice} />}
        {/* Only with ?audio-debug=1 (or once set, localStorage arkpediaAudioDebug=1): what the
            <audio> element and the player believe, for a phone that cannot be inspected. */}
        <AudioDebugPanel engineKind={engineKind} isPlaying={isPlaying} buffering={buffering}
          engineState={() => audioRef.current?.debug() ?? null} />
      </MusicPlaybackContext.Provider>
    </MusicPlayerContext.Provider>
  );
}
