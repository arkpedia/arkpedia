import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { MUSIC_CHANNEL_ID, getUploadsPlaylistId } from './musicConfig';
import { fetchVideoOEmbedInfo } from './youtube';
import { useContentUrl } from '@/lib/content/context';
import { GAME_PATHS } from '@/lib/minigames/catalogue';
import { MUSIC_CATALOGUE_PATH, loadMusicCatalogue, type MusicCatalogueSong } from './musicCatalogue';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY, readMusicFavorites } from './musicFavorites';
import { restoreQueue, sessionStore, takeMusicResume, writeMusicResume, type MusicResumeState } from './musicResume';

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaylist(): string[] | undefined;
  getVideoData(): { title?: string; video_id?: string };
  loadVideoById(video: string | { videoId: string; startSeconds?: number }): void;
  cueVideoById(video: string | { videoId: string; startSeconds?: number }): void;
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
  title: string;
  altTitle?: string | null;
  artist?: string | null;
}

function toQueueTrack(song: MusicCatalogueSong): QueueTrack {
  return { id: song.videoId, title: song.title, altTitle: song.altTitle ?? null, artist: song.artist ?? null };
}

interface MusicPlayerContextValue {
  ready: boolean;
  starting: boolean;
  isPlaying: boolean;
  title: string;
  videoId: string;
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  favorites: Set<string>;
  currentTime: number;
  duration: number;
  seeking: boolean;
  queue: QueueTrack[];
  queueIndex: number;
  shuffleOrder: number[] | null; // full pre-computed shuffle permutation of queue indices -- null when shuffle is off
  shufflePosition: number; // where the currently-playing track sits within shuffleOrder
  queueLoading: boolean;
  excludeCopyrighted: boolean; // "stream-safe mode" -- filters copyrighted songs out of the queue entirely, not just a display filter on one page
  initializePlayer: () => void;
  togglePlay: () => void;
  pausePlayback: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleFavorite: (videoId: string) => void;
  setVolumeLevel: (v: number) => void;
  handleSeekChange: (v: number) => void;
  handleSeekCommit: (v: number) => void;
  setSeeking: (v: boolean) => void;
  playQueueIndex: (index: number) => void;
  playTrackByVideoId: (videoId: string) => void;
  playFirst: (videoId: string) => void;
  playPlaylist: (videoIds: string[] | null) => Promise<number>;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  reorderShuffleOrder: (fromPos: number, toPos: number) => void;
  moveQueueItemToTop: (index: number) => void;
  removeFromQueue: (index: number) => void;
  setExcludeCopyrighted: (v: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  return ctx;
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const catalogRef = useRef<MusicCatalogueSong[] | null>(null);
  const catalogPromiseRef = useRef<Promise<MusicCatalogueSong[]> | null>(null);
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [title, setTitle] = useState('');
  const [videoId, setVideoId] = useState('');
  const [volume, setVolume] = useState(50);
  const [shuffle, setShuffle] = useState(true);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [excludeCopyrighted, setExcludeCopyrightedState] = useState(false);
  const excludeCopyrightedRef = useRef(false);

  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueLoading, setQueueLoading] = useState(false);
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
  const playlistIdsRef = useRef<string[] | null>(null);
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
  // And what a record of the moment needs (saveResume, below).
  const isPlayingRef = useRef(false);
  const videoIdRef = useRef('');
  const titleRef = useRef('');
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const volumeRef = useRef(50);
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
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Loaded once on mount, same pattern as musicVolume.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('musicExcludeCopyrighted');
      if (saved === 'true') {
        setExcludeCopyrightedState(true);
        excludeCopyrightedRef.current = true;
      }
    } catch {
      /* ignore */
    }
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
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      favoritesRef.current = next;
      try {
        window.localStorage.setItem(MUSIC_FAVORITES_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function buildQueueFromCatalog(): Promise<QueueTrack[]> {
    // Concurrent requests share one download; a failed one is retried on the next request.
    if (!catalogPromiseRef.current) {
      catalogPromiseRef.current = loadMusicCatalogue(catalogueUrlRef.current).catch((error) => {
        catalogPromiseRef.current = null;
        throw error;
      });
    }
    const catalog = catalogRef.current ?? await catalogPromiseRef.current;
    catalogRef.current = catalog;
    // Read the latest preference after loading: it may have changed
    // while the catalogue was downloading.
    const songs = excludeCopyrightedRef.current ? catalog.filter((s) => !s.copyright) : catalog;
    return songs.map(toQueueTrack);
  }

  function setExcludeCopyrighted(v: boolean) {
    setExcludeCopyrightedState(v);
    excludeCopyrightedRef.current = v;
    try {
      window.localStorage.setItem('musicExcludeCopyrighted', String(v));
    } catch {
      /* ignore */
    }

    // Rebuilding from buildQueueFromCatalog() here was the actual bug
    // -- it reconstructs the queue in raw catalog order every time,
    // throwing away any manual reordering, and then always generated a
    // fresh random shuffle order on top of that regardless. Instead:
    // turning stream-safe ON filters copyrighted songs OUT of the
    // CURRENT queue (preserving whatever order it's already in);
    // turning it OFF appends the newly-available songs onto the END of
    // the current queue. Either way, everything that was already there
    // keeps its position.
    const oldQueue = queueRef.current;
    const currentId = oldQueue[queueIndexRef.current]?.id;
    const fullCatalog = catalogRef.current;
    // Until loading finishes, the preference above is all we need:
    // buildQueueFromCatalog will apply it to the initial queue.
    if (!fullCatalog) return;
    const catalogById = new Map(fullCatalog.map((s) => [s.videoId, s]));

    let nextQueue: QueueTrack[];
    // Maps each OLD queue index to its new index (or -1 if it got
    // filtered out) -- used below to remap the shuffle order too,
    // instead of regenerating it.
    const oldIndexToNewIndex: number[] = [];

    if (v) {
      nextQueue = [];
      oldQueue.forEach((track, oldIdx) => {
        if (catalogById.get(track.id)?.copyright) {
          oldIndexToNewIndex[oldIdx] = -1;
        } else {
          oldIndexToNewIndex[oldIdx] = nextQueue.length;
          nextQueue.push(track);
        }
      });
    } else {
      oldQueue.forEach((_, oldIdx) => {
        oldIndexToNewIndex[oldIdx] = oldIdx; // nothing already in the queue moves
      });
      const existingIds = new Set(oldQueue.map((t) => t.id));
      const toAdd = fullCatalog
        .filter((s) => !existingIds.has(s.videoId) && (!playlistIdsRef.current || playlistIdsRef.current.includes(s.videoId)))
        .map(toQueueTrack);
      nextQueue = [...oldQueue, ...toAdd];
    }

    queueRef.current = nextQueue;
    setQueue(nextQueue);

    const newIdx = currentId ? nextQueue.findIndex((t) => t.id === currentId) : -1;
    const resolvedIdx = newIdx !== -1 ? newIdx : Math.floor(Math.random() * nextQueue.length);
    setQueueIndex(resolvedIdx);

    if (shuffleRef.current && nextQueue.length > 0) {
      const existingOrder = shuffleOrderRef.current;
      let finalOrder: number[];
      if (existingOrder) {
        if (v) {
          finalOrder = existingOrder
            .map((oldIdx) => oldIndexToNewIndex[oldIdx])
            .filter((idx): idx is number => idx !== undefined && idx !== -1);
        } else {
          const addedCount = nextQueue.length - oldQueue.length;
          const newIndices = Array.from({ length: addedCount }, (_, i) => oldQueue.length + i);
          finalOrder = [...existingOrder, ...newIndices];
        }
      } else {
        finalOrder = generateShuffleOrder(nextQueue.length, resolvedIdx); // no order to remap yet -- only path that still needs a fresh one
      }
      shuffleOrderRef.current = finalOrder;
      setShuffleOrder(finalOrder);
      const pos = finalOrder.indexOf(resolvedIdx);
      shufflePositionRef.current = pos !== -1 ? pos : 0;
      setShufflePosition(shufflePositionRef.current);
    }
  }

  // A song resumed from the last document stops waiting to start: it plays, the reader
  // chose another, or the browser refused to start it.
  const endResumeWatch = useCallback(() => {
    if (!resumeWatchRef.current) return;
    resumeWatchRef.current = null;
    window.clearInterval(resumeTimerRef.current);
    setStarting(false);
  }, []);

  const loadTrackAt = useCallback((index: number) => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const clamped = ((index % q.length) + q.length) % q.length;
    setQueueIndex(clamped);
    endResumeWatch();
    cuedAtRef.current = null;
    playerRef.current?.loadVideoById(q[clamped].id);
  }, [endResumeWatch]);

  // Download the catalogue on demand and construct the queue once.
  const loadFullQueue = useCallback(async (): Promise<QueueTrack[]> => {
    const player = playerRef.current;
    if (queueRef.current.length > 0) return queueRef.current;
    setQueueLoading(true);
    try {
      let built = await buildQueueFromCatalog();
      // Concurrent requests share the catalogue download. Only the first
      // completion should create the queue and choose its shuffle order.
      if (queueRef.current.length > 0) {
        setQueueLoading(false);
        return queueRef.current;
      }
      // The queue the last document had, in its order, and its place in it
      // (lib/music/musicResume.ts).
      const restored = resumeRef.current ? restoreQueue(built, resumeRef.current) : null;
      if (restored) {
        built = restored.queue;
        if (restored.shuffleOrder) {
          shuffleOrderRef.current = restored.shuffleOrder;
          setShuffleOrder(restored.shuffleOrder);
          shufflePositionRef.current = restored.shufflePosition;
          setShufflePosition(restored.shufflePosition);
        }
      }
      if (built.length > 0) {
        queueRef.current = built;
        setQueue(built);
        const currentId = player?.getVideoData()?.video_id;
        const idx = restored ? restored.queueIndex : currentId ? built.findIndex((t) => t.id === currentId) : -1;
        if (idx !== -1) {
          queueIndexRef.current = idx;
          setQueueIndex(idx);
        }
        if (shuffleRef.current && shuffleOrderRef.current === null) {
          const order = generateShuffleOrder(built.length, idx !== -1 ? idx : Math.floor(Math.random() * built.length));
          shuffleOrderRef.current = order;
          setShuffleOrder(order);
          shufflePositionRef.current = 0;
          setShufflePosition(0);
        }
        setQueueLoading(false);
        return built;
      }
    } catch {
      /* fall through to the oEmbed fallback below */
    }

    // Last-resort fallback (catalog genuinely empty, or the above
    // failed): whatever the embedded player itself has loaded, with
    // titles looked up individually via the free oEmbed endpoint. No
    // composer/artist/characters available from oEmbed.
    if (!player) {
      setQueueLoading(false);
      return [];
    }
    const playlist = player.getPlaylist();
    if (!playlist || playlist.length === 0) {
      setQueueLoading(false);
      return [];
    }
    const titles = await Promise.all(playlist.map((id) => fetchVideoOEmbedInfo(id).then((info) => info.title)));
    const built = playlist.map((id, i) => ({ id, title: titles[i] || `Track ${i + 1}` }));
    queueRef.current = built;
    setQueue(built);
    setQueueLoading(false);
    return built;
  }, []);

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

  const nextTrack = useCallback(async () => {
    let q = queueRef.current;
    if (q.length === 0) {
      q = await loadFullQueue();
      if (q.length === 0) return; // genuinely nothing to play (e.g. the catalog fetch itself failed)
    }
    if (shuffleRef.current) {
      const order = shuffleOrderRef.current ?? generateShuffleOrder(q.length, queueIndexRef.current);
      const nextPos = (shufflePositionRef.current + 1) % order.length;
      shuffleOrderRef.current = order;
      setShuffleOrder(order);
      shufflePositionRef.current = nextPos;
      setShufflePosition(nextPos);
      loadTrackAt(order[nextPos]);
    } else {
      loadTrackAt(queueIndexRef.current + 1);
    }
  }, [loadTrackAt, loadFullQueue]);

  const prevTrack = useCallback(() => {
    if (shuffleRef.current) {
      const order = shuffleOrderRef.current;
      const q = queueRef.current;
      if (!order || q.length === 0) return;
      const prevPos = (shufflePositionRef.current - 1 + order.length) % order.length;
      shufflePositionRef.current = prevPos;
      setShufflePosition(prevPos);
      loadTrackAt(order[prevPos]);
      return;
    }
    loadTrackAt(queueIndexRef.current - 1);
  }, [loadTrackAt]);

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;

    // The catalogue can arrive after the iframe API on a slow network.
    // Wait for both so the first Play click uses the intended queue.
    Promise.all([loadYouTubeApi(), loadFullQueue()]).then(() => {
      if (cancelled || !containerRef.current || playerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '1',
        width: '1',
        playerVars: {
          listType: 'playlist',
          list: getUploadsPlaylistId(MUSIC_CHANNEL_ID),
          autoplay: 0,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
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
            e.target.setVolume(savedVolume);
            setVolume(savedVolume);

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
              e.target.loadVideoById(vid);
              setReady(true);
              setStarting(false);
              return;
            }

            // The song carried over from the last document: cued at its moment, so a
            // refused start still leaves it there, one press of Play away; when it was
            // playing, Play follows once YouTube says it is cued (onStateChange). Not a
            // copyrighted song while stream-safe is on, which another tab may have
            // turned on since.
            const excluded = record && excludeCopyrightedRef.current
              && catalogRef.current?.some((song) => song.videoId === record.videoId && song.copyright);
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
              e.target.cueVideoById({ videoId: record.videoId, startSeconds: record.seconds });
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
              e.target.cueVideoById(q[startIdx].id);
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
              e.target.playVideo();
            }
            setStarting(false);
          },
          onError: () => {
            // Unplayable video (deleted, region-blocked, embedding
            // disabled, age-restricted, etc.) -- skip it instead of
            // leaving playback dead with no recovery.
            setIsPlaying(false);
            nextTrack();
          },
          // The browser would not let this document start sound by itself (autoplay):
          // a resumed song waits at its moment for the reader's Play.
          onAutoplayBlocked: () => {
            if (resumeWatchRef.current) refuseResume();
          },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            const state = window.YT.PlayerState;
            playerStateRef.current = e.data;
            const watch = resumeWatchRef.current;
            if (e.data === state.CUED && watch?.phase === 'cue') {
              watch.phase = 'play';
              watch.since = Date.now();
              e.target.playVideo();
            }
            if (e.data === state.PLAYING) {
              cuedAtRef.current = null;
              endResumeWatch();
              setIsPlaying(true);
              const data = e.target.getVideoData();
              setTitle(data?.title || '');
              setVideoId(data?.video_id || '');
              setDuration(e.target.getDuration());
              // Retry if the initial catalogue load failed.
              if (queueRef.current.length === 0) loadFullQueue();
            } else if (e.data === state.PAUSED) {
              setIsPlaying(false);
            } else if (e.data === state.ENDED) {
              setIsPlaying(false);
              if (repeatModeRef.current === 'one') {
                const q = queueRef.current;
                if (q.length > 0) e.target.loadVideoById(q[queueIndexRef.current].id);
              } else if (repeatModeRef.current === 'all') {
                // loadTrackAt's own index wraparound (modulo) already
                // takes care of looping back to the start once the end
                // is reached -- nothing extra needed here.
                nextTrack();
              } else {
                // repeatMode === 'off' -- unlike 'all', playback should
                // actually STOP once the last track finishes, rather
                // than nextTrack's wraparound silently looping back to
                // the beginning anyway.
                const order = shuffleRef.current ? shuffleOrderRef.current : null;
                const atEnd = order
                  ? shufflePositionRef.current >= order.length - 1
                  : queueIndexRef.current >= queueRef.current.length - 1;
                if (!atEnd) nextTrack();
              }
            }
          },
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
    const watch = resumeWatchRef.current;
    const player = playerRef.current;
    endResumeWatch();
    setIsPlaying(false);
    if (!watch || !player) return;
    // Paused somewhere: it stays there. Otherwise cued again, as a refused start may have left
    // YouTube unstarted, without the moment.
    if (playerStateRef.current === window.YT.PlayerState.PAUSED) {
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
      if (playerStateRef.current === window.YT.PlayerState.BUFFERING && waited < RESUME_BUFFER_MS) return;
      if (waited < (watch.phase === 'cue' ? RESUME_CUE_MS : RESUME_PLAY_MS)) return;
      refuseResume();
    }, 500);
  }

  // Unmounting ends the watch with the provider.
  useEffect(() => () => window.clearInterval(resumeTimerRef.current), []);

  // Poll playback position while playing, for the seek bar. Skipped while
  // the person is actively dragging the seek bar themselves.
  useEffect(() => {
    if (!isPlaying || seeking) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setCurrentTime(player.getCurrentTime());
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, seeking]);

  const initializePlayer = useCallback(() => {
    setInitialized(true);
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
    setStarting(false);
    setIsPlaying(false);
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
    let seconds = currentTimeRef.current;
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
      duration: Number.isFinite(durationRef.current) && durationRef.current > 0 ? durationRef.current : 0,
      playing: isPlayingRef.current || pendingPlayRef.current || !!resumeWatchRef.current,
      queue: queue.map((track) => track.id),
      playlistIds: playlistIdsRef.current,
      queueIndex: queueIndexRef.current,
      shuffle: shuffleRef.current,
      shuffleOrder: order ? order.flatMap((index) => (queue[index] ? [queue[index].id] : [])) : null,
      shufflePosition: shufflePositionRef.current,
      repeat: repeatModeRef.current,
      volume: Math.min(100, Math.max(0, Number.isFinite(volumeRef.current) ? volumeRef.current : 50)),
    });
  }, []);

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

  // ... and this document picks it up, once, on its first render.
  useEffect(() => {
    // Only where the player is drawn: the recruitment pop-out has none (hideSiteChrome),
    // and a window opened from this tab starts with a copy of its sessionStorage.
    if (!containerRef.current) return;
    const record = takeMusicResume(sessionStore(), Date.now(), { discarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true });
    if (!record) return;
    // The music guesser pauses the player as it opens (its effect runs before this one): a
    // song resumed there would play over its clips.
    const play = record.playing && router.pathname !== GAME_PATHS.music;
    resumeRef.current = { ...record, playing: play };
    playlistIdsRef.current = record.playlistIds ?? null;
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
    setInitialized(true);
  // Once: a record is for the document's first page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
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
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
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
    const song = catalogRef.current?.find(song => song.videoId === videoId);
    const track = previous[index] ?? (song && !(excludeCopyrightedRef.current && song.copyright) ? toQueueTrack(song) : null);
    if (!track) return;
    const next = [track, ...previous.filter(track => track.id !== videoId)];
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

  async function playPlaylist(videoIds: string[] | null): Promise<number> {
    if (!playerReadyRef.current) return 0;
    await buildQueueFromCatalog();
    const byId = new Map((catalogRef.current ?? []).map(song => [song.videoId, song]));
    const tracks = [...new Set(videoIds ?? [...byId.keys()])].flatMap(id => {
      const song = byId.get(id);
      return song && !(excludeCopyrightedRef.current && song.copyright) ? [toQueueTrack(song)] : [];
    });
    if (!tracks.length) return 0;
    playlistIdsRef.current = videoIds ? [...videoIds] : null;
    queueRef.current = tracks; setQueue(tracks);
    queueIndexRef.current = 0; setQueueIndex(0);
    // Start in the saved order. The reader can turn shuffle on afterwards.
    shuffleRef.current = false; setShuffle(false);
    shuffleOrderRef.current = null; setShuffleOrder(null);
    shufflePositionRef.current = 0; setShufflePosition(0);
    loadTrackAt(0);
    return tracks.length;
  }

  function toggleShuffle() {
    setShuffle((s) => {
      const turningOn = !s;
      if (turningOn) {
        const q = queueRef.current;
        if (q.length > 0) {
          const order = generateShuffleOrder(q.length, queueIndexRef.current);
          shuffleOrderRef.current = order;
          setShuffleOrder(order);
          shufflePositionRef.current = 0;
          setShufflePosition(0);
        }
      } else {
        shuffleOrderRef.current = null;
        setShuffleOrder(null);
        shufflePositionRef.current = 0;
        setShufflePosition(0);
      }
      return turningOn;
    });
  }

  function cycleRepeat() {
    setRepeatMode((r) => (r === 'off' ? 'one' : r === 'one' ? 'all' : 'off'));
  }

  function setVolumeLevel(v: number) {
    setVolume(v);
    playerRef.current?.setVolume(v);
    try {
      window.localStorage.setItem('musicVolume', String(v));
    } catch {
      /* ignore */
    }
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

  function playQueueIndex(index: number) {
    loadTrackAt(index);
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
    if (fromIndex === toIndex) return;
    let newLength = 0;
    let newCurrentIndex = queueIndexRef.current;
    setQueue((current) => {
      if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      newLength = next.length;
      return next;
    });
    setQueueIndex((current) => {
      if (current === fromIndex) {
        newCurrentIndex = toIndex;
      } else if (fromIndex < current && toIndex >= current) {
        newCurrentIndex = current - 1;
      } else if (fromIndex > current && toIndex <= current) {
        newCurrentIndex = current + 1;
      } else {
        newCurrentIndex = current;
      }
      return newCurrentIndex;
    });
    if (shuffleRef.current && newLength > 0) {
      const existingOrder = shuffleOrderRef.current;
      const remapped = existingOrder
        ? existingOrder.map((idx) => remapIndexAfterMove(idx, fromIndex, toIndex))
        : generateShuffleOrder(newLength, newCurrentIndex); // no order to remap yet -- only path that still needs a fresh one
      shuffleOrderRef.current = remapped;
      setShuffleOrder(remapped);
      const pos = remapped.indexOf(newCurrentIndex);
      shufflePositionRef.current = pos !== -1 ? pos : 0;
      setShufflePosition(shufflePositionRef.current);
    }
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

  // Despite the name/icon, this doesn't move to literal array index 0
  // -- it moves to be the very next thing that plays after the
  // currently-playing song, which is what "push to top" actually needs
  // to mean once the currently-playing song isn't itself at index 0
  // (true as soon as you've advanced past the first track at all).
  // Landing at literal index 0 would put it BEFORE the current song
  // instead, which never plays "next" at all without a full wraparound.
  function moveQueueItemToTop(index: number) {
    if (shuffleRef.current && shuffleOrderRef.current) {
      const order = shuffleOrderRef.current;
      const fromPos = order.indexOf(index);
      if (fromPos === -1) return;
      const curPos = shufflePositionRef.current;
      if (fromPos === curPos) return; // can't push the currently-playing song to play next after itself
      const targetPos = fromPos < curPos ? curPos : curPos + 1;
      reorderShuffleOrder(fromPos, targetPos);
      return;
    }
    const qi = queueIndexRef.current;
    if (index === qi) return; // can't push the currently-playing song to play next after itself
    const target = index < qi ? qi : qi + 1;
    reorderQueue(index, target);
  }


  // Removes a track from the queue. Refuses to remove the currently-
  // playing track itself -- that's what the player controls
  // (pause/skip) are for, not the queue manager. Also regenerates the
  // shuffle order, for the same reason as reorderQueue above.
  function removeFromQueue(index: number) {
    if (index === queueIndex) return;
    let newLength = 0;
    let newCurrentIndex = queueIndexRef.current;
    setQueue((current) => {
      const next = current.filter((_, i) => i !== index);
      newLength = next.length;
      return next;
    });
    setQueueIndex((current) => {
      newCurrentIndex = index < current ? current - 1 : current;
      return newCurrentIndex;
    });
    if (shuffleRef.current && newLength > 0) {
      const existingOrder = shuffleOrderRef.current;
      const remapped = existingOrder
        ? existingOrder
            .map((idx) => remapIndexAfterRemoval(idx, index))
            .filter((idx): idx is number => idx !== null)
        : generateShuffleOrder(newLength, newCurrentIndex); // no order to remap yet -- only path that still needs a fresh one
      shuffleOrderRef.current = remapped;
      setShuffleOrder(remapped);
      const pos = remapped.indexOf(newCurrentIndex);
      shufflePositionRef.current = pos !== -1 ? pos : 0;
      setShufflePosition(shufflePositionRef.current);
    }
  }

  const value: MusicPlayerContextValue = {
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
    seeking,
    queue,
    queueIndex,
    shuffleOrder,
    shufflePosition,
    queueLoading,
    excludeCopyrighted,
    initializePlayer,
    togglePlay,
    pausePlayback,
    nextTrack,
    prevTrack,
    toggleShuffle,
    cycleRepeat,
    toggleFavorite,
    setVolumeLevel,
    handleSeekChange,
    handleSeekCommit,
    setSeeking,
    playQueueIndex,
    playTrackByVideoId, playFirst, playPlaylist,
    reorderQueue,
    reorderShuffleOrder,
    moveQueueItemToTop,
    removeFromQueue,
    setExcludeCopyrighted,
    containerRef,
  };

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}
