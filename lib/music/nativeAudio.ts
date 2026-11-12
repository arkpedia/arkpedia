import { PLAYER_STATE, type MsrAudioEngine, type MsrEngineEvents, type VideoArg } from './playbackEngine';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY, readMusicFavorites } from './musicFavorites';
import { noAutoplaySongs, setNoAutoplay } from './noAutoplay';
import type { TrackSource } from './trackId';

export interface NativeTrack {
  id: string; cid: string; title: string; artist: string; album: string; autoplay: boolean;
}
interface PreferenceEdit { id: string; kind: 'favourites' | 'blocked'; value: boolean }
export interface NativeState {
  sequence?: number; sessionId?: string;
  version: number; track: NativeTrack | null; seconds: number; duration: number;
  playing: boolean; buffering: boolean; revision: number;
  changes: Record<string, PreferenceEdit>; error: string;
}
export interface NativeAudioPlugin {
  /** Optional: iOS 0.3.1+ supplies real PCM-derived logarithmic spectrum levels. */
  getSpectrum?(): Promise<{ trackId: string; available: boolean; bands: number[] }>;
  getState(): Promise<NativeState>;
  configure(options: { tracks: NativeTrack[]; repeat: string; favourites: string[]; blocked: string[]; revision: number }): Promise<NativeState>;
  loadTrack(options: { track: NativeTrack; seconds: number; play: boolean }): Promise<NativeState>;
  command(options: { action: string; seconds?: number; volume?: number }): Promise<NativeState>;
  addListener(name: 'state', listener: (state: NativeState) => void): Promise<{ remove(): Promise<void> }>;
}

/** Older app builds and every ordinary browser keep the existing web engines. */
export function nativeAudioPlugin(): NativeAudioPlugin | null {
  if (typeof window === 'undefined' || window.location.origin !== 'https://www.arkpedia.net') return null;
  const capacitor = (window as unknown as { Capacitor?: { Plugins?: { ArkpediaAudio?: NativeAudioPlugin } } }).Capacitor;
  return capacitor?.Plugins?.ArkpediaAudio ?? null;
}

interface QueueSong { id: string; title: string; altTitle?: string | null; artist?: string | null; album?: string | null }
export interface NativeQueueInput {
  currentId: string; currentAutoplay: boolean; queue: QueueSong[]; order: number[] | null;
  history: { tracks: string[]; position: number }; queued: ReadonlySet<string>;
  autoplay: QueueSong[]; repeat: 'off' | 'all' | 'one';
  lookup(id: string): QueueSong | undefined; route(id: string): TrackSource;
}

/** Snapshot the chosen order; stop at YouTube boundaries instead of silently skipping songs. */
export function nativeQueue(input: NativeQueueInput): { tracks: NativeTrack[]; repeat: string } {
  const ordered = (input.order ?? input.queue.map((_, index) => index)).flatMap(index => input.queue[index] ? [input.queue[index]] : []);
  const index = ordered.findIndex(track => track.id === input.currentId);
  const pending = input.currentAutoplay ? ordered.filter(track => input.queued.has(track.id)) : ordered.slice(index + 1);
  const future: { id: string; autoplay: boolean }[] = [
    ...input.history.tracks.slice(input.history.position + 1).map(id => ({ id, autoplay: false })),
    ...pending.map(track => ({ id: track.id, autoplay: false })),
    ...(input.repeat === 'all' ? ordered.slice(0, index + 1).map(track => ({ id: track.id, autoplay: false }))
      : input.autoplay.map(track => ({ id: track.id, autoplay: true }))),
  ];
  const convert = (id: string, autoplay: boolean): NativeTrack | null => {
    const route = input.route(id), song = input.lookup(id);
    if (route.kind !== 'msr' || !song) return null;
    return { id, cid: route.cid, title: song.altTitle || song.title, artist: song.artist || 'Monster Siren Records', album: song.album || '', autoplay };
  };
  const current = convert(input.currentId, input.currentAutoplay);
  if (!current) return { tracks: [], repeat: 'off' };
  const seen = new Set([current.id]);
  const tracks: NativeTrack[] = [];
  const futureIds = new Set(future.map(track => track.id));
  // Preserve Previous across page re-renders, but never jump across a YouTube history entry.
  if (input.repeat !== 'all') {
    for (const id of input.history.tracks.slice(0, input.history.position).reverse()) {
      if (seen.has(id) || futureIds.has(id)) continue;
      const track = convert(id, false); if (!track) break;
      tracks.unshift(track); seen.add(id);
    }
  }
  tracks.push(current);
  let repeat: string = input.repeat;
  for (const item of future) {
    if (seen.has(item.id)) continue;
    const track = convert(item.id, item.autoplay);
    if (!track) { if (repeat === 'all') repeat = 'off'; break; }
    tracks.push(track); seen.add(item.id);
    if (tracks.length >= 3000) { if (repeat === 'all') repeat = 'off'; break; }
  }
  return { tracks, repeat };
}

export interface NativeEngine extends MsrAudioEngine {
  native: true;
  track(): NativeTrack | null;
  synchronize(snapshot: { tracks: NativeTrack[]; repeat: string }): void;
  restore(): Promise<boolean>;
  refresh(): void;
}

export function isNativeEngine(engine: MsrAudioEngine | null): engine is NativeEngine {
  return Boolean(engine && 'native' in engine && engine.native === true);
}

/** A native engine reports the same states as the web engine. It owns no browser audio. */
export function createNativeAudioEngine(events: MsrEngineEvents, plugin: NativeAudioPlugin,
  lookup: (id: string, cid: string) => NativeTrack, element: HTMLAudioElement): NativeEngine {
  let current: NativeState = { version: 1, track: null, seconds: 0, duration: 0, playing: false, buffering: false, revision: 0, changes: {}, error: '' };
  let serial = Promise.resolve();
  let awaitingId: string | null = null;
  let acknowledged = -1;
  let active = false;
  let cue = false;
  let signature = '';
  let queueSignature = '';
  let errorReported = '';
  let lastSequence = -1;
  let nativeSession = '';

  const report = (force = false) => {
    if (!active) return;
    const code = current.buffering ? PLAYER_STATE.BUFFERING : current.playing ? PLAYER_STATE.PLAYING : cue ? PLAYER_STATE.CUED : PLAYER_STATE.PAUSED;
    const next = `${current.track?.id}:${code}`;
    if (force || next !== signature) { signature = next; events.onState(code); }
    if (current.error && current.error !== errorReported) { errorReported = current.error; events.onStuck(); }
  };
  const accept = (state: NativeState) => {
    if (state.version !== 1) return;
    if (state.sessionId && state.sessionId !== nativeSession) { nativeSession = state.sessionId; lastSequence = -1; }
    if (state.sequence !== undefined && state.sequence <= lastSequence) return;
    if (state.sequence !== undefined) lastSequence = state.sequence;
    // Apply absolute values once per revision. Repeated native ticks must not toggle twice or
    // undo a subsequent tap in the website. Unacknowledged edits survive a process restart.
    if (state.revision > acknowledged) {
      try {
        const favorites = readMusicFavorites(window.localStorage);
        for (const change of Object.values(state.changes ?? {})) {
          if (typeof change.id !== 'string' || typeof change.value !== 'boolean') continue;
          if (change.kind === 'favourites') { if (change.value) favorites.add(change.id); else favorites.delete(change.id); }
          else if (change.kind === 'blocked') setNoAutoplay(change.id, change.value);
        }
        window.localStorage.setItem(MUSIC_FAVORITES_KEY, JSON.stringify([...favorites]));
        window.dispatchEvent(new Event(MUSIC_FAVORITES_EVENT));
        acknowledged = state.revision;
      } catch { /* Keep native edits unacknowledged if web storage is unavailable. */ }
    }
    if (awaitingId && state.track?.id !== awaitingId) return;
    awaitingId = null;
    current = state;
    if (state.playing) cue = false;
    report();
  };
  const send = (operation: () => Promise<NativeState>) => {
    serial = serial.then(async () => accept(await operation())).catch(() => {
      queueSignature = ''; awaitingId = null; current = { ...current, playing: false, buffering: false, error: 'Native audio could not respond. Try Play again.' };
      report();
    });
    return serial;
  };
  void Promise.resolve(plugin.addListener('state', accept)).catch(() => { /* Commands and refresh still reconcile state. */ });
  const refresh = () => { send(() => plugin.getState()).then(() => report(true)); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('pageshow', refresh);
  const load = (video: VideoArg, play: boolean) => {
    const id = typeof video === 'string' ? video : video.videoId;
    const cid = typeof video === 'string' ? id.replace(/^msr:/, '') : video.cid ?? '';
    const seconds = typeof video === 'string' ? 0 : video.startSeconds ?? 0;
    active = true; cue = !play; errorReported = ''; awaitingId = id;
    current = { ...current, track: lookup(id, cid), seconds, duration: 0, playing: false, buffering: play, error: '' };
    queueSignature = '';
    // A native load replaces any browser prime; never leave duplicate streams playing.
    element.pause(); element.removeAttribute('src'); element.load();
    send(() => plugin.loadTrack({ track: lookup(id, cid), seconds, play }));
  };
  return {
    native: true, element,
    track: () => current.track,
    restore: async () => {
      await send(() => plugin.getState());
      active = Boolean(current.track); cue = false;
      return active;
    },
    refresh,
    synchronize(snapshot) {
      if (!active || !snapshot.tracks.length) return;
      const next = JSON.stringify([snapshot, [...readMusicFavorites(window.localStorage)], [...noAutoplaySongs()]]);
      if (next === queueSignature) return;
      queueSignature = next;
      send(async () => {
        // Reconcile background edits before publishing any web preference snapshot.
        accept(await plugin.getState());
        return plugin.configure({ ...snapshot, favourites: [...readMusicFavorites(window.localStorage)], blocked: [...noAutoplaySongs()], revision: acknowledged });
      });
    },
    loadVideoById: video => load(video, true), cueVideoById: video => load(video, false),
    playVideo() { active = true; cue = false; send(() => plugin.command({ action: 'play' })); },
    pauseVideo() { cue = false; send(() => plugin.command({ action: 'pause' })); },
    stop() { active = false; awaitingId = null; queueSignature = ''; send(() => plugin.command({ action: 'stop' })); },
    seekTo(seconds) { current.seconds = seconds; send(() => plugin.command({ action: 'seek', seconds })); },
    setVolume(volume) { send(() => plugin.command({ action: 'volume', volume: volume / 100 })); },
    getCurrentTime: () => current.seconds, getDuration: () => current.duration,
    getVideoData: () => ({ video_id: current.track?.id, title: current.track?.title }),
    prepareVersion() {}, versionDuration: () => undefined,
    debug: () => ({ native: true, playing: current.playing, revision: current.revision, error: current.error }),
  };
}
