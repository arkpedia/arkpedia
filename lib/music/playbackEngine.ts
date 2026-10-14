import { trackSource, type TrackSource } from './trackId';

/*
 * The player's sound comes from one of two engines: the YouTube iframe, and an <audio> element
 * playing Monster Siren's own file. Which one plays a track is chosen each time it is loaded, not
 * by its id (lib/music/trackId.ts): a song with a Monster Siren id plays from Monster Siren -- an
 * <audio> element keeps playing while the page is hidden, where a phone pauses YouTube -- unless
 * the reader turned on Data saver, which plays it from YouTube instead; a song with no Monster
 * Siren id plays from YouTube, and one with no YouTube upload from Monster Siren
 * (musicPlayerContext's routeTrack). lib/music/musicPlayerContext.tsx drives both through one
 * surface, the part of YouTube's iframe player API it always used (PlaybackEngine): YouTube's
 * player is one as it stands, the Monster Siren engine below implements the same methods and
 * reports the same states, and createTrackEngine hands each call to the engine chosen for the
 * track. So the queue, resume, repeat and skip logic stays one code path whichever engine plays,
 * and every engine names a track by its track id, whatever file it plays.
 */

/** YouTube's player states (YT.PlayerState), which both engines report. */
export const PLAYER_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

/** A track to load: its track id, and where to start. `cid` is the Monster Siren song the audio
 *  engine plays for it, given by createTrackEngine (a YouTube id names none of its own). */
export type VideoArg = string | { videoId: string; startSeconds?: number; cid?: string };

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
  /** The track id last loaded or cued, '' before any. */
  loaded(): string;
  /** Which engine would play this track now: where a reload of it (Data saver turned on or off)
   *  would go, compared with active(). */
  routeOf(id: string): EngineKind;
}

/** Where a track's sound comes from now: its YouTube video, or a Monster Siren song. */
export type TrackRoute = (id: string) => TrackSource;

/** The route by id alone, for a player that knows no Monster Siren ids of YouTube songs. */
export const routeById: TrackRoute = (id) => trackSource(id) ?? { kind: 'youtube', videoId: id };

/**
 * One engine for the player: each load or cue goes to the engine `route` chooses for the track,
 * and the one that played before is stopped (YouTube paused, the audio released), so two songs
 * never play at once. Everything else goes to the engine of the track loaded; volume to both.
 */
export function createTrackEngine(youtube: PlaybackEngine, audio: PlaybackEngine & { stop(): void }, route: TrackRoute = routeById): TrackEngine {
  let active: EngineKind = 'youtube';
  let loadedId = '';
  const pick = (video: VideoArg, run: (engine: PlaybackEngine, video: VideoArg) => void) => {
    const id = typeof video === 'string' ? video : video.videoId;
    const startSeconds = typeof video === 'string' ? 0 : video.startSeconds ?? 0;
    const source = route(id);
    loadedId = id;
    if (source.kind !== active) {
      // Switched first, so the paused event the old engine sends is already stale when it comes.
      const previous = active;
      active = source.kind;
      if (previous === 'youtube') youtube.pauseVideo();
      else audio.stop();
    }
    // The audio engine is told which Monster Siren song plays for the track; YouTube gets the
    // same call it always did.
    if (source.kind === 'msr') run(audio, { videoId: id, startSeconds, cid: source.cid });
    else run(youtube, typeof video === 'string' ? video : { videoId: id, startSeconds });
  };
  const current = () => (active === 'msr' ? audio : youtube);
  return {
    active: () => active,
    loaded: () => loadedId,
    routeOf: (id) => route(id).kind,
    loadVideoById: (video) => pick(video, (engine, arg) => engine.loadVideoById(arg)),
    cueVideoById: (video) => pick(video, (engine, arg) => engine.cueVideoById(arg)),
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

export interface MsrAudioEngine extends PlaybackEngine {
  stop(): void;
  /** Asks for a song's address ahead of its turn (kept for ADDRESS_MAX_AGE_MS), so it starts at
   *  once, with no request between the last song's end and its start. */
  prepare(cid: string): void;
  element: HTMLAudioElement;
}

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
 *
 * While the page is hidden the player asks ahead for the next song's address (prepare), so when
 * a song ends the next one is set on this same element and played in the same task as the end:
 * the browser keeps the page's audio session, and the lock screen's controls, from song to song.
 */
export function createMsrAudioEngine(events: EngineEvents, { resolve = resolveMsrAudio, now = Date.now }: AudioEngineOptions = {}): MsrAudioEngine {
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
  /** An address asked for ahead (prepare): the song, the address, when it was given. */
  let prepared: { cid: string; url: string; at: number } | null = null;
  let preparing = '';

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

  /** The address asked for ahead, while it is still good, taken (it is used once). */
  function takePrepared(): string | null {
    const ready = prepared && prepared.cid === cid && now() - prepared.at <= ADDRESS_MAX_AGE_MS ? prepared.url : null;
    if (prepared?.cid === cid) prepared = null;
    return ready;
  }

  async function begin(fresh = false) {
    const g = generation;
    if (loadedCid !== cid || now() - loadedAt > ADDRESS_MAX_AGE_MS || fresh) {
      const at = position();
      // Asked for ahead: set and played in this same task, with no request in between.
      const ready = fresh ? null : takePrepared();
      if (ready) {
        setFile(ready, at);
      } else {
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
      }
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
    // The song the track plays: given (a YouTube song played from Monster Siren), or its own id.
    const source = trackSource(next.videoId);
    const song = (typeof video === 'string' ? undefined : video.cid) ?? (source?.kind === 'msr' ? source.cid : undefined);
    if (!song) return;
    generation += 1;
    // Named as the player names it, whichever file plays: what it saves and resumes is the track.
    id = next.videoId;
    if (song !== loadedCid) release();
    cid = song;
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
    prepare(next) {
      if (!next || next === preparing || next === loadedCid || (prepared?.cid === next && now() - prepared.at <= ADDRESS_MAX_AGE_MS)) return;
      preparing = next;
      resolve(next, false).then((url) => { prepared = { cid: next, url, at: now() }; }, () => { /* Asked again when it plays. */ })
        .finally(() => { if (preparing === next) preparing = ''; });
    },
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
