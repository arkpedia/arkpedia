import { createPairedAudio } from './pairedAudio';
import { logAudioEvent, musicAudioElement, msrAudioAddress, msrAudioCid, releaseMusicAudioFile, setMusicAudioFile } from './audioElement';
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
export type VideoArg = string | { videoId: string; startSeconds?: number; cid?: string; switchVersion?: boolean };

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
    if (source.kind === 'msr') run(audio, { videoId: id, startSeconds, cid: source.cid, ...(typeof video !== 'string' && video.switchVersion ? { switchVersion: true } : {}) });
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

/** Monster Siren's addresses are signed for a few hours (three, 2026-10-22: the expiry is in the
 *  address, monsterSirenAudio.ts audioLinkExpiry). One older than this is asked again before it
 *  plays, rather than waiting for the CDN to refuse it. */
const ADDRESS_MAX_AGE_MS = 60 * 60 * 1000;

export interface MsrAudioEngine extends PlaybackEngine {
  stop(): void;
  element: HTMLAudioElement;
  prepareVersion: (cid: string | null, offset?: number | null) => void;
  versionDuration: (cid: string) => number | undefined;
  whenVersionReady: (cid: string, run: () => void) => void;
  /** What the engine believes, for the debug panel (components/music/AudioDebugPanel.tsx). */
  debug(): Record<string, string | number | boolean>;
}

/** What the Monster Siren engine tells the player beyond what YouTube's does. */
export interface MsrEngineEvents extends EngineEvents {
  /** A song asked to play made no sound, from its address and again from a fresh one: the engine
   *  paused it and waits for the next Play. */
  onStuck(): void;
}

/** How long a play that was asked for may go without sound before the engine pauses it and the
 *  player says so (onStuck): from the request while no file has come (`load`), from the element's
 *  "playing" while the clock has not moved (`start`), and after it had played (`stall`). The next
 *  Play loads a fresh address, in its press. A check may set window.__arkpediaAudioWatchdogMs to
 *  shorten them. */
export const AUDIO_WATCHDOG_MS = { load: 30000, nodata: 10000, start: 8000, stall: 20000 } as const;
/** A clock standing still this long while playing is shown as loading, not as playing. */
const STALL_SHOWN_MS = 1500;
const WATCHDOG_TICK_MS = 500;
function watchdogMs(): { load: number; nodata: number; start: number; stall: number } {
  const hook = typeof window === 'undefined' ? undefined
    : (window as unknown as { __arkpediaAudioWatchdogMs?: { load?: number; nodata?: number; start?: number; stall?: number } }).__arkpediaAudioWatchdogMs;
  return { load: hook?.load ?? AUDIO_WATCHDOG_MS.load, nodata: hook?.nodata ?? AUDIO_WATCHDOG_MS.nodata, start: hook?.start ?? AUDIO_WATCHDOG_MS.start, stall: hook?.stall ?? AUDIO_WATCHDOG_MS.stall };
}

interface AudioEngineOptions {
  /** The address of a song's audio (lib/music/audioElement.ts msrAudioAddress): one the press
   *  can set and play at once, with no request first. */
  address?: (cid: string, fresh: boolean) => string;
  now?: () => number;
  element?: HTMLAudioElement;
}

/**
 * The Monster Siren engine: one hidden <audio> element (data-music-audio, lib/music/
 * audioElement.ts), kept for the whole visit; a press that came before the engine could play has
 * already set and played its song's file there (primeMusicAudio), and load() takes it over.
 *
 * Ordinary track changes reuse the active element. Matched versions can exchange it with
 * a synchronized muted element without stopping playback. One upcoming file, or failing that its signed
 * address, may be prepared by audioPreload.ts while this song plays; otherwise files load only
 * when asked to play. Its
 * address is ours (pages/api/music-audio), a redirect to
 * Monster Siren's signed one, so it is set and played in the same task as the press or the last
 * song's end, with no request between. A refused file (the CDN answers 403, which the element
 * reports as an error) is loaded again once, past the redirect's edge copy, and the song carries
 * on from where it was; a second failure is the player's to handle, as a YouTube video that
 * cannot play is (it skips).
 *
 * Playing means sound: the engine reports PLAYING only once the element's clock moves, not on
 * its "playing" event or a play() call -- an iPhone showed Pause, and a lock-screen clock running,
 * over a song that stayed silent at 0:00. Until the clock moves, and whenever it stands still
 * while playing ("waiting", or no progress for STALL_SHOWN_MS), it reports BUFFERING. A watchdog
 * (AUDIO_WATCHDOG_MS) pauses a song that made no sound in its time (onStuck), where it was; the
 * next Play loads a fresh address in the press.
 *
 * When a song ends the next one is set on this same element and played in the same task as the
 * end: the browser keeps the page's audio session, and the lock screen's controls, from song to
 * song, the page hidden or not.
 */
export function createMsrAudioEngine(events: MsrEngineEvents, { address = msrAudioAddress, now = Date.now, element }: AudioEngineOptions = {}): MsrAudioEngine {
  let el = element ?? musicAudioElement();
  const pair = createPairedAudio(() => el, listen);

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
  let volume = 0.5;
  /** Bumped by every load, cue and stop: an address that arrives for an older one is dropped. */
  let generation = 0;
  /** True from releasing a file until the next one starts loading: the old file's last events
   *  (its pause, its abort) are queued before the new file's loadstart, and are not this track's. */
  let settling = false;

  /* The watchdog's view: whether PLAYING has been reported for this play, where the clock was
   * last seen and when it last moved, whether the song played at all since it was loaded, and
   * whether the fresh address has been tried for this silence. */
  let confirmed = false;
  let clock = 0;
  let movedAt = 0;
  let everPlayed = false;
  /** The silence ended the last play: the next Play (a press) loads a fresh address, in the press. */
  let rescued = false;
  /** When the element said it plays (its "playing" event) for this play; 0 before. */
  let startedAt = 0;
  /** How much of the file the element held, and when that last grew: a file that comes slowly is
   *  waited for (`load`), one that has stopped coming is not (`nodata`). */
  let held = 0;
  let heldAt = 0;
  let watchdog: number | undefined;

  // A state the engine reaches by being asked (a cue, a pause, fetching the address) is reported
  // after the call returns, as YouTube reports its own: the player sets up what the state means
  // (a resume's watch) after asking. One that a later load or stop overtook is not reported.
  const report = (state: number) => {
    const g = generation;
    window.setTimeout(() => { if (g === generation) events.onState(state); }, 0);
  };
  /** A play asked for and not yet heard: shown as loading, unless it was refused or heard first. */
  const reportPending = () => {
    const g = generation;
    window.setTimeout(() => { if (g === generation && wantPlay && !confirmed) events.onState(PLAYER_STATE.BUFFERING); }, 0);
  };

  const position = () => (loadedCid === cid && loadedCid ? pendingSeek ?? el.currentTime : start);
  /** Whether an element event is about the track loaded now (not the last file, nor a prime). */
  const current = () => !settling && Boolean(loadedCid) && loadedCid === cid;

  function arm() {
    confirmed = false;
    startedAt = 0;
    held = 0;
    heldAt = now();
    clock = position();
    movedAt = now();
    if (watchdog === undefined) watchdog = window.setInterval(tick, WATCHDOG_TICK_MS);
  }
  function disarm() {
    window.clearInterval(watchdog);
    watchdog = undefined;
    confirmed = false;
  }

  /** The clock read: moving forward, while playing and not seeking, is sound. */
  function observe() {
    if (!wantPlay || !current() || el.paused || el.seeking) return;
    const t = el.currentTime;
    if (t > clock + 0.01) {
      clock = t;
      movedAt = now();
      everPlayed = true;
      if (!confirmed) {
        confirmed = true;
        rescued = false;
        retried = false;
        logAudioEvent('engine: sound (clock moving)');
        events.onState(PLAYER_STATE.PLAYING);
      }
    } else if (t < clock) {
      clock = t;
    }
  }

  /** Loading is not silence: the file may take a while on a phone's network (an iPhone took about
   *  seven seconds over 5G, 2026-10-14). The clock is held to `start` only once the element says
   *  it plays, and to `stall` once it has moved; before that, to `load`. */
  function tick() {
    if (!wantPlay) { disarm(); return; }
    observe();
    const t = now();
    const limits = watchdogMs();
    if (confirmed && t - movedAt > Math.min(STALL_SHOWN_MS, limits.stall)) {
      confirmed = false;
      logAudioEvent('engine: clock stopped');
      events.onState(PLAYER_STATE.BUFFERING);
    }
    if (confirmed) return;
    if (everPlayed) { if (t - movedAt > limits.stall) silent('the clock stopped'); return; }
    if (startedAt) { if (t - Math.max(startedAt, movedAt) > limits.start) silent('it says it plays, the clock does not move'); return; }
    const buffered = el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0;
    if (buffered > held) { held = buffered; heldAt = t; }
    if (t - Math.max(movedAt, heldAt) > limits.nodata) silent('no data came');
    else if (t - movedAt > limits.load) silent('no file came');
  }

  /** No sound for the watchdog's time: paused where it was, and the player says so (onStuck). It is
   *  never loaded again from here: an iPhone loads a file only in a press, so a fresh address set
   *  by this timer sat there with no data (2026-10-14). The next Play does it, in its press. */
  function silent(why: string) {
    const at = position();
    start = at;
    clock = at;
    logAudioEvent(`engine: no sound (${why}), paused for a Play`);
    rescued = true;
    wantPlay = false;
    disarm();
    if (!el.paused) el.pause();
    events.onStuck();
  }

  function release() {
    if (!el.getAttribute('src')) return;
    settling = true;
    el.pause();
    el.removeAttribute('src');
    el.load();
    releaseMusicAudioFile(el);
    loadedCid = '';
    pendingSeek = null;
  }

  /** A moment in the file set: at once where the file says how long it is, else once it does
   *  (a moment set before then is not kept by every browser). */
  function seekLoaded(seconds: number) {
    clock = seconds;
    if (el.readyState === 0) { pendingSeek = seconds; return; }
    pendingSeek = null;
    el.currentTime = seconds;
  }

  function setFile(url: string, at: number) {
    settling = true;
    setMusicAudioFile(el, cid, url);
    loadedCid = cid;
    loadedAt = now();
    pendingSeek = at > 0 ? at : null;
    clock = at;
    el.volume = volume;
  }

  function refused() {
    wantPlay = false;
    disarm();
    events.onState(PLAYER_STATE.UNSTARTED);
    events.onAutoplayBlocked();
  }

  /** The song's file set (when it is not, or its address is old, or a fresh one is asked for)
   *  and played, in this same task: in a press, the press starts the sound (iOS). */
  function begin(fresh = false) {
    const g = generation;
    if (loadedCid !== cid || now() - loadedAt > ADDRESS_MAX_AGE_MS || fresh) {
      setFile(address(cid, fresh), position());
      // Paused: the file is set, so the next Play starts at once.
      if (!wantPlay) { report(PLAYER_STATE.PAUSED); return; }
    }
    el.volume = volume;
    logAudioEvent('play()');
    el.play().then(() => logAudioEvent('play() resolved'), (error: unknown) => {
      const name = (error as { name?: string })?.name ?? 'Error';
      logAudioEvent(`play() rejected: ${name}`);
      if (g !== generation || !wantPlay) return;
      if (name === 'NotAllowedError') { refused(); return; }
      // A play a later load, pause or address replaced; a file the element cannot play is its
      // error event's (below). Any other refusal is a start that made no sound.
      if (name === 'AbortError' || el.error || !el.paused) return;
      silent(`play() refused: ${name}`);
    });
  }

  function load(video: VideoArg, play: boolean) {
    const next = typeof video === 'string' ? { videoId: video, startSeconds: 0 } : video;
    // The song the track plays: given (a YouTube song played from Monster Siren), or its own id.
    const source = trackSource(next.videoId);
    const song = (typeof video === 'string' ? undefined : video.cid) ?? (source?.kind === 'msr' ? source.cid : undefined);
    if (!song) return;
    generation += 1;
    const warmed = pair.swap(song, cid, play && typeof video !== 'string' && Boolean(video.switchVersion));
    if (warmed) {
      el = warmed.element;
      loadedCid = song;
      loadedAt = now();
      settling = false;
      if (warmed.live) {
        id = next.videoId;
        cid = song;
        retried = rescued = false;
        pendingSeek = null;
        start = clock = el.currentTime;
        wantPlay = everPlayed = confirmed = true;
        movedAt = now();
        report(PLAYER_STATE.PLAYING);
        return;
      }
    } else pair.clear();
    // Named as the player names it, whichever file plays: what it saves and resumes is the track.
    id = next.videoId;
    // A file the press set and played before the engine could (primeMusicAudio) is this song's:
    // taken over where it is, not reloaded.
    const primed = song !== loadedCid && msrAudioCid(el.getAttribute('src')) === song;
    // A primed file the CDN already refused: its error event came before the engine was up, so
    // went unheard (and play() on it only rejects, with the error set). It is asked again here,
    // once, from a fresh address, as the error event would have (CI met this when a press beat
    // YouTube's player API, 2026-10-19).
    const primedFailed = primed && Boolean(el.error);
    if (primed && !primedFailed) {
      settling = false;
      loadedCid = song;
      loadedAt = now();
    } else if (song !== loadedCid) { release(); everPlayed = false; }
    cid = song;
    start = next.startSeconds || 0;
    wantPlay = play;
    retried = primedFailed;
    rescued = primedFailed && !play;
    // The same song again (repeat one, a resume cued once more): its file stays, at the moment.
    if (loadedCid === cid && !(primed && start === 0)) seekLoaded(start);
    if (play) {
      arm();
      reportPending();
      begin(primedFailed);
    } else {
      disarm();
      if (loadedCid === cid) el.pause();
      report(PLAYER_STATE.CUED);
    }
  }

  function listen(target: HTMLAudioElement) {
    const on = (type: string, handler: () => void) => target.addEventListener(type, () => {
      if (target === el) handler();
    });
    on('loadstart', () => { settling = false; });
    on('loadedmetadata', () => {
      if (pendingSeek === null || !current()) return;
      clock = pendingSeek;
      el.currentTime = pendingSeek;
      pendingSeek = null;
    });
    on('playing', () => {
      if (!current() || el.paused) return;
      // Started from outside the player (the system's own controls): watched like a Play.
      if (!wantPlay) { wantPlay = true; rescued = false; arm(); }
      if (!startedAt) startedAt = now();
      observe();
    });
    on('timeupdate', observe);
    on('seeking', () => { if (current()) clock = el.currentTime; });
    on('seeked', () => { if (current()) clock = el.currentTime; });
    on('waiting', () => {
      if (!current() || !wantPlay) return;
      confirmed = false;
      events.onState(PLAYER_STATE.BUFFERING);
    });
    // The end fires pause first; it is reported once, as the end.
    on('pause', () => {
      if (!current() || !el.paused || el.ended) return;
      wantPlay = false;
      disarm();
      events.onState(PLAYER_STATE.PAUSED);
    });
    on('ended', () => {
      if (!current()) return;
      wantPlay = false;
      disarm();
      events.onState(PLAYER_STATE.ENDED);
    });
    on('error', () => {
      if (!current() || !el.getAttribute('src')) return;
      if (retried) { wantPlay = false; disarm(); events.onError(); return; }
      // Most likely the signed address expired (a long pause, a seek into what was not loaded).
      retried = true;
      start = el.currentTime || pendingSeek || start;
      loadedCid = '';
      if (wantPlay) movedAt = now();
      begin(true);
    });
  }
  listen(el);

  return {
    get element() { return el; },
    prepareVersion: pair.prepare,
    versionDuration: pair.duration,
    whenVersionReady: pair.whenReady,
    loadVideoById: (video) => load(video, true),
    cueVideoById: (video) => load(video, false),
    playVideo() {
      if (!cid) return;
      // Already heard playing: nothing to ask again (the lock screen's Play over a playing song).
      if (wantPlay && confirmed && !el.paused) return;
      wantPlay = true;
      // After a silence the file is loaded again from a fresh address, here, in the press.
      const fresh = rescued;
      rescued = false;
      arm();
      reportPending();
      begin(fresh);
    },
    pauseVideo() {
      wantPlay = false;
      disarm();
      if (loadedCid === cid && loadedCid && !el.paused) el.pause();
      else report(PLAYER_STATE.PAUSED);
    },
    seekTo(seconds) {
      if (wantPlay) movedAt = now();
      if (loadedCid !== cid || !loadedCid) { start = seconds; clock = seconds; return; }
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
      pair.clear();
      generation += 1;
      wantPlay = false;
      disarm();
      release();
      id = '';
      cid = '';
      start = 0;
    },
    debug: () => ({
      song: cid || '-',
      wantPlay,
      heard: confirmed,
      everPlayed,
      freshOnPlay: rescued,
      startedMs: startedAt ? Math.round(now() - startedAt) : 0,
      quietMs: wantPlay ? Math.round(now() - movedAt) : 0,
    }),
  };
}
