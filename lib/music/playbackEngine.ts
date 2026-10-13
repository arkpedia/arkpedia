import { trackSource } from './trackId';

/*
 * The player's sound comes from one of two engines, per track (lib/music/trackId.ts): the YouTube
 * iframe for a song with a YouTube upload, and an <audio> element playing Monster Siren's own file
 * for a song with none. lib/music/musicPlayerContext.tsx drives both through one surface, the part
 * of YouTube's iframe player API it always used (PlaybackEngine): YouTube's player is one as it
 * stands, the Monster Siren engine below implements the same methods and reports the same states,
 * and createTrackEngine hands each call to the engine of the track it names. So the queue, resume,
 * repeat and skip logic stays one code path whichever engine plays.
 */

/** YouTube's player states (YT.PlayerState), which both engines report. */
export const PLAYER_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export type VideoArg = string | { videoId: string; startSeconds?: number };

/** What the player context drives: play/pause/seek/position/duration/volume, the track loaded,
 *  and loading a track to play (load) or to wait at a moment (cue). */
export interface PlaybackEngine {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  getVideoData(): { title?: string; video_id?: string };
  loadVideoById(video: VideoArg): void;
  cueVideoById(video: VideoArg): void;
}

/** What an engine tells the player: a new state, a track it cannot play, a start the browser refused. */
export interface EngineEvents {
  onState(state: number): void;
  onError(): void;
  onAutoplayBlocked(): void;
}

export type EngineKind = 'youtube' | 'msr';

export interface TrackEngine extends PlaybackEngine {
  /** Which engine plays the track loaded now. Events from the other one are stale. */
  active(): EngineKind;
}

const kindOf = (video: VideoArg): EngineKind => trackSource(typeof video === 'string' ? video : video.videoId)?.kind === 'msr' ? 'msr' : 'youtube';

/**
 * One engine for the player: each load or cue goes to the engine of the track it names, and the
 * one that played before is stopped (YouTube paused, the audio released), so two songs never
 * play at once. Everything else goes to the engine of the track loaded; volume to both.
 */
export function createTrackEngine(youtube: PlaybackEngine, audio: PlaybackEngine & { stop(): void }): TrackEngine {
  let active: EngineKind = 'youtube';
  const pick = (video: VideoArg): PlaybackEngine => {
    const kind = kindOf(video);
    if (kind !== active) {
      // Switched first, so the paused event the old engine sends is already stale when it comes.
      const previous = active;
      active = kind;
      if (previous === 'youtube') youtube.pauseVideo();
      else audio.stop();
    }
    return kind === 'msr' ? audio : youtube;
  };
  const current = () => (active === 'msr' ? audio : youtube);
  return {
    active: () => active,
    loadVideoById: (video) => pick(video).loadVideoById(video),
    cueVideoById: (video) => pick(video).cueVideoById(video),
    playVideo: () => current().playVideo(),
    pauseVideo: () => current().pauseVideo(),
    seekTo: (seconds, allowSeekAhead) => current().seekTo(seconds, allowSeekAhead),
    getCurrentTime: () => current().getCurrentTime(),
    getDuration: () => current().getDuration(),
    getVideoData: () => current().getVideoData(),
    setVolume: (volume) => { youtube.setVolume(volume); audio.setVolume(volume); },
  };
}

/** Monster Siren's signed address for a song's audio, by way of pages/api/music-guesser (which
 *  checks the answer is that song, on Monster Siren's CDN). Audio bytes never pass through us. */
export async function resolveMsrAudio(cid: string, fresh: boolean): Promise<string> {
  // `fresh` skips the edge cache of the address (a few minutes), after the CDN refused one.
  const response = await fetch(`/api/music-guesser/${encodeURIComponent(cid)}${fresh ? `?retry=${Date.now()}` : ''}`);
  if (!response.ok) throw new Error(`Monster Siren audio returned ${response.status}`);
  const { url } = await response.json() as { url?: unknown };
  if (typeof url !== 'string' || !url) throw new Error('Monster Siren audio is invalid');
  return url;
}

/** Monster Siren's addresses are signed for a few hours (about five, 2026-10-12). One older than
 *  this is asked again before it plays, rather than waiting for the CDN to refuse it. */
const ADDRESS_MAX_AGE_MS = 60 * 60 * 1000;

interface AudioEngineOptions {
  resolve?: (cid: string, fresh: boolean) => Promise<string>;
  now?: () => number;
}

/**
 * The Monster Siren engine: one hidden <audio> element (data-music-audio), kept for the whole
 * visit so a browser that only lets a page start sound after a press (iOS) counts the first
 * press for every later track.
 *
 * The file's address is asked for only when the track is to play, never when it is queued or
 * cued (preload none: each is a WAV of about 50 MB). The address is signed and expires, so a
 * refused one (the CDN answers 403, which the element reports as an error) is asked again once
 * and the song carries on from where it was; a second failure is the player's to handle, as a
 * YouTube video that cannot play is (it skips).
 */
export function createMsrAudioEngine(events: EngineEvents, { resolve = resolveMsrAudio, now = Date.now }: AudioEngineOptions = {}): PlaybackEngine & { stop(): void; element: HTMLAudioElement } {
  const el = document.createElement('audio');
  el.preload = 'none';
  el.hidden = true;
  el.setAttribute('data-music-audio', '');
  document.body.appendChild(el);

  let id = '';
  let cid = '';
  /** Where the track starts, until its file is loaded. */
  let start = 0;
  /** The song the element's file is, and when its address was given. */
  let loadedCid = '';
  let loadedAt = 0;
  /** A seek made before the file said how long it is, applied once it does. */
  let pendingSeek: number | null = null;
  let wantPlay = false;
  let retried = false;
  let unlocked = false;
  let volume = 0.5;
  /** Bumped by every load, cue and stop: an address that arrives for an older one is dropped. */
  let generation = 0;
  /** True from releasing a file until the next one starts loading: the old file's last events
   *  (its pause, its abort) are queued before the new file's loadstart, and are not this track's. */
  let settling = false;

  // A state the engine reaches by being asked (a cue, a pause, fetching the address) is reported
  // after the call returns, as YouTube reports its own: the player sets up what the state means
  // (a resume's watch) after asking. One that a later load or stop overtook is not reported.
  const report = (state: number) => {
    const g = generation;
    window.setTimeout(() => { if (g === generation) events.onState(state); }, 0);
  };

  const position = () => (loadedCid === cid && loadedCid ? pendingSeek ?? el.currentTime : start);

  function release() {
    if (!el.getAttribute('src')) return;
    settling = true;
    el.pause();
    el.removeAttribute('src');
    el.load();
    loadedCid = '';
    pendingSeek = null;
  }

  /** A moment in the file set: at once where the file says how long it is, else once it does
   *  (a moment set before then is not kept by every browser). */
  function seekLoaded(seconds: number) {
    if (el.readyState === 0) { pendingSeek = seconds; return; }
    pendingSeek = null;
    el.currentTime = seconds;
  }

  function setFile(url: string, at: number) {
    settling = true;
    el.src = url;
    loadedCid = cid;
    loadedAt = now();
    pendingSeek = at > 0 ? at : null;
    el.volume = volume;
  }

  // A browser that starts sound only after a press (iOS) remembers the element that was asked to
  // play during one; the address is fetched first, so the play that follows is outside the press.
  // Asking once, empty, during the first press lets every later play through.
  function unlock() {
    if (unlocked || el.getAttribute('src')) return;
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation && !activation.isActive) return;
    unlocked = true;
    settling = true;
    el.play().catch(() => { /* No file yet: only the permission was wanted. */ });
    el.pause();
  }

  function refused() {
    wantPlay = false;
    events.onState(PLAYER_STATE.UNSTARTED);
    events.onAutoplayBlocked();
  }

  async function begin(fresh = false) {
    const g = generation;
    if (loadedCid !== cid || now() - loadedAt > ADDRESS_MAX_AGE_MS || fresh) {
      const at = position();
      report(PLAYER_STATE.BUFFERING);
      let url: string;
      try {
        url = await resolve(cid, fresh);
      } catch {
        if (g === generation) events.onError();
        return;
      }
      if (g !== generation) return;
      setFile(url, at);
      // Paused while the address came: the file is set, so the next Play starts at once.
      if (!wantPlay) { report(PLAYER_STATE.PAUSED); return; }
    }
    el.volume = volume;
    el.play().catch((error: unknown) => {
      if (g !== generation || !wantPlay) return;
      if ((error as { name?: string })?.name === 'NotAllowedError') refused();
      // Anything else arrives as the element's error event (handled below), or is a play a
      // later load or pause replaced (AbortError).
    });
  }

  function load(video: VideoArg, play: boolean) {
    const next = typeof video === 'string' ? { videoId: video, startSeconds: 0 } : video;
    const source = trackSource(next.videoId);
    if (source?.kind !== 'msr') return;
    generation += 1;
    id = next.videoId;
    if (source.cid !== loadedCid) release();
    cid = source.cid;
    start = next.startSeconds || 0;
    wantPlay = play;
    retried = false;
    // The same song again (repeat one, a resume cued once more): its file stays, at the moment.
    if (loadedCid === cid) seekLoaded(start);
    if (play) {
      unlock();
      void begin();
    } else {
      if (loadedCid === cid) el.pause();
      report(PLAYER_STATE.CUED);
    }
  }

  el.addEventListener('loadstart', () => { settling = false; });
  el.addEventListener('loadedmetadata', () => {
    if (pendingSeek === null) return;
    el.currentTime = pendingSeek;
    pendingSeek = null;
  });
  el.addEventListener('playing', () => {
    if (settling || loadedCid !== cid) return;
    retried = false;
    events.onState(PLAYER_STATE.PLAYING);
  });
  el.addEventListener('waiting', () => {
    if (!settling && loadedCid === cid) events.onState(PLAYER_STATE.BUFFERING);
  });
  // The end fires pause first; it is reported once, as the end.
  el.addEventListener('pause', () => {
    if (settling || loadedCid !== cid || el.ended) return;
    wantPlay = false;
    events.onState(PLAYER_STATE.PAUSED);
  });
  el.addEventListener('ended', () => {
    if (settling || loadedCid !== cid) return;
    wantPlay = false;
    events.onState(PLAYER_STATE.ENDED);
  });
  el.addEventListener('error', () => {
    if (settling || loadedCid !== cid || !el.getAttribute('src')) return;
    if (retried) { wantPlay = false; events.onError(); return; }
    // Most likely the signed address expired (a long pause, a seek into what was not loaded).
    retried = true;
    start = el.currentTime || pendingSeek || start;
    loadedCid = '';
    void begin(true);
  });

  return {
    element: el,
    loadVideoById: (video) => load(video, true),
    cueVideoById: (video) => load(video, false),
    playVideo() {
      if (!cid) return;
      wantPlay = true;
      unlock();
      void begin();
    },
    pauseVideo() {
      wantPlay = false;
      if (loadedCid === cid && loadedCid && !el.paused) el.pause();
      else report(PLAYER_STATE.PAUSED);
    },
    seekTo(seconds) {
      if (loadedCid !== cid || !loadedCid) { start = seconds; return; }
      seekLoaded(seconds);
    },
    getCurrentTime: position,
    getDuration: () => (loadedCid === cid && Number.isFinite(el.duration) ? el.duration : 0),
    setVolume(next) {
      volume = Math.min(1, Math.max(0, next / 100));
      el.volume = volume;
    },
    getVideoData: () => ({ video_id: id, title: '' }),
    stop() {
      generation += 1;
      wantPlay = false;
      release();
      id = '';
      cid = '';
      start = 0;
    },
  };
}
