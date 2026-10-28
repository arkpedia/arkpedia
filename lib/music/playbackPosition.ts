/**
 * Where the song is: its clock, its length, and whether the reader is dragging a seek bar.
 *
 * The clock moves every 500 ms while a song plays. Kept out of the player's React state so that
 * tick re-renders nothing but the few parts that show it (the seek bars, the lyrics), through
 * useSyncExternalStore (lib/music/musicPlayerContext.tsx useMusicPlayback); everything else
 * that reads the player (every Library row, the nav, an operator page) stays as it was.
 */
export interface PlaybackPosition {
  /** Seconds into the song. */
  currentTime: number;
  /** The song's length in seconds; 0 until the engine knows it. */
  duration: number;
  /** The reader is dragging a seek bar: the clock is not polled over their hand. */
  seeking: boolean;
}

export interface PlaybackPositionStore {
  /** The position as it stands; the same object until something changes. */
  get(): PlaybackPosition;
  subscribe(listener: () => void): () => void;
  /** Writes the fields given; listeners hear only a change. */
  set(patch: Partial<PlaybackPosition>): void;
}

export const INITIAL_PLAYBACK_POSITION: PlaybackPosition = { currentTime: 0, duration: 0, seeking: false };

export function createPlaybackPositionStore(initial: PlaybackPosition = INITIAL_PLAYBACK_POSITION): PlaybackPositionStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(patch) {
      const next = { ...snapshot };
      let changed = false;
      for (const key of Object.keys(patch) as (keyof PlaybackPosition)[]) {
        const value = patch[key];
        if (value === undefined || Object.is(value, snapshot[key])) continue;
        (next as Record<keyof PlaybackPosition, unknown>)[key] = value;
        changed = true;
      }
      if (!changed) return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
