/**
 * Where the music was, carried into the next document of this tab.
 *
 * The player is one YouTube iframe in the app shell (lib/music/musicPlayerContext.tsx), so a
 * new document ends the song: a reload, and the load Next makes in place of a client
 * navigation it cannot finish. After every deploy an open tab asks for its own build's page
 * data (/_next/data/<build>/<page>.json), the new deployment answers 404, and Next loads the
 * page as a new document instead (next/dist/shared/lib/router/router.js,
 * handleHardNavigation). So the first page a tab opened after a deploy, of those it had not
 * opened before, restarted the music: most often the newest pages, which nobody had opened
 * yet ("some pages reset the music player", 2026-10-07). Vercel's Skew Protection would keep
 * the old build's data reachable, but it is a setting of the hosting project, so the site
 * copes on its own.
 *
 * The player writes where it is to this tab's sessionStorage as the document goes (pagehide),
 * when the tab is hidden, and at each new track, play and pause; the next document's player
 * picks it up while it is fresh: the same song at the same moment, the same queue, shuffled
 * order, repeat and volume, playing if it was. Whether a new document may start sound by
 * itself is the browser's call (autoplay): where it refuses, the song waits at its moment,
 * one press of Play away.
 */

export const MUSIC_RESUME_KEY = 'arkpediaMusicResume';
/** How long a record waits for the next document: a reload takes seconds; a tab the browser
 *  dropped in the background and reloads when it is shown again may take minutes. */
export const MUSIC_RESUME_MAX_AGE_MS = 3 * 60 * 1000;

const REPEAT_MODES = ['off', 'one', 'all'] as const;

export interface MusicResumeState {
  version: 1;
  /** Date.now() when it was written. */
  savedAt: number;
  /**
   * Written as the document went (pagehide). Only such a record resumes by itself. One written
   * while the document lived (tab hidden, a new track) is also in any tab duplicated from this
   * one, since a duplicate gets a copy of sessionStorage, and must not start a second copy of
   * the song there; it resumes only in a tab the browser dropped and reloaded
   * (document.wasDiscarded), where pagehide never came.
   */
  left: boolean;
  videoId: string;
  /** YouTube's title, for a song outside the queue (a discovery link); the queue's own title wins. */
  title: string;
  seconds: number;
  duration: number;
  /** Playing, or about to (Play pressed while YouTube was loading); else paused at `seconds`. */
  playing: boolean;
  /** The queue's songs in its order: it may have been reordered or had songs taken out. */
  queue: string[];
  /** A saved playlist limits which songs stream-safe can put back into this queue. */
  playlistIds?: string[] | null;
  /** Saved playlist behind the queue, used to default the add-song picker after reload. */
  playingPlaylistId?: string | null;
  queueIndex: number;
  shuffle: boolean;
  /** The shuffled order of play, as songs (null with shuffle off). */
  shuffleOrder: string[] | null;
  shufflePosition: number;
  repeat: (typeof REPEAT_MODES)[number];
  volume: number;
}

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** This tab's sessionStorage, or null where the browser refuses it (blocked site data). */
export function sessionStore(): SessionStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeMusicResume(storage: SessionStore | null, state: MusicResumeState): void {
  try {
    storage?.setItem(MUSIC_RESUME_KEY, JSON.stringify(state));
  } catch {
    /* Full or refused: the next document starts with the music stopped, as it did before. */
  }
}

// A YouTube video id, as the player is handed it: nothing else reaches loadVideoById.
const VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/;
const isId = (value: unknown): value is string => typeof value === 'string' && VIDEO_ID.test(value);
const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 20000 && value.every(isId);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isSeconds = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 86400;

/** A record, checked field by field: null for anything that is not one. */
export function parseMusicResume(raw: string | null): MusicResumeState | null {
  if (!raw) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
  const { savedAt, left, videoId, title, seconds, duration, playing, queue, queueIndex, shuffle, shuffleOrder, shufflePosition, repeat, volume } = value;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || typeof left !== 'boolean' || !isId(videoId)) return null;
  if (typeof title !== 'string' || title.length > 500 || !isSeconds(seconds) || !isSeconds(duration) || typeof playing !== 'boolean') return null;
  if (!isIdList(queue) || !isCount(queueIndex) || typeof shuffle !== 'boolean' || !isCount(shufflePosition)) return null;
  if (shuffleOrder !== null && !isIdList(shuffleOrder)) return null;
  if (!REPEAT_MODES.includes(repeat as never) || typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 100) return null;
  if (value.playlistIds != null && !isIdList(value.playlistIds)) return null;
  if (value.playingPlaylistId != null && (typeof value.playingPlaylistId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.playingPlaylistId))) return null;
  return {
    ...(value.playlistIds !== undefined ? { playlistIds: value.playlistIds as string[] | null } : {}),
    ...(value.playingPlaylistId !== undefined ? { playingPlaylistId: value.playingPlaylistId as string | null } : {}),
    version: 1, savedAt, left, videoId, title, seconds, duration, playing, queue, queueIndex, shuffle,
    shuffleOrder: shuffleOrder as string[] | null, shufflePosition, repeat: repeat as MusicResumeState['repeat'], volume,
  };
}

/**
 * The record this new document resumes, if there is a fresh one: written as the last document
 * went (or before the browser dropped the tab), at most MUSIC_RESUME_MAX_AGE_MS ago. A stale or
 * broken record is removed; a taken one is marked as no longer leaving, so a tab duplicated
 * from this one later does not resume it too (the player writes it again as this one goes).
 */
export function takeMusicResume(storage: SessionStore | null, now: number, { discarded = false } = {}): MusicResumeState | null {
  let raw: string | null;
  try {
    raw = storage?.getItem(MUSIC_RESUME_KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  const state = parseMusicResume(raw);
  // A clock that moved back a little (a sync) is no reason to drop it; a record from the future is.
  const fresh = !!state && now - state.savedAt <= MUSIC_RESUME_MAX_AGE_MS && state.savedAt <= now + 60_000;
  if (!state || !fresh) {
    try {
      storage?.removeItem(MUSIC_RESUME_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  if (!state.left && !discarded) return null;
  writeMusicResume(storage, { ...state, left: false });
  return state;
}

export interface RestoredQueue<T> {
  queue: T[];
  queueIndex: number;
  /** Positions in `queue`, every one once; null when the record had none (shuffle off). */
  shuffleOrder: number[] | null;
  shufflePosition: number;
}

/**
 * The record's queue, of the songs the catalogue still offers (`tracks`, already without the
 * copyrighted ones when stream-safe is on), in the record's order; its shuffled order as
 * positions in that queue, with any song it lost track of at the end. Null when none of its
 * songs are left, so the player builds its queue as it always did.
 */
export function restoreQueue<T extends { id: string }>(tracks: readonly T[], state: MusicResumeState): RestoredQueue<T> | null {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const queue: T[] = [];
  const index = new Map<string, number>();
  for (const id of state.queue) {
    const track = byId.get(id);
    if (!track || index.has(id)) continue;
    index.set(id, queue.length);
    queue.push(track);
  }
  if (!queue.length) return null;
  // The song playing, or for one outside the queue (a discovery link) the queue's place it left.
  const queueIndex = index.get(state.videoId) ?? index.get(state.queue[state.queueIndex]) ?? 0;
  let shuffleOrder: number[] | null = null;
  let shufflePosition = 0;
  if (state.shuffle && state.shuffleOrder) {
    const seen = new Set<number>();
    for (const id of state.shuffleOrder) {
      const at = index.get(id);
      if (at !== undefined) seen.add(at);
    }
    shuffleOrder = [...seen];
    for (let i = 0; i < queue.length; i++) if (!seen.has(i)) shuffleOrder.push(i);
    shufflePosition = index.has(state.videoId)
      ? shuffleOrder.indexOf(queueIndex)
      : Math.min(state.shufflePosition, shuffleOrder.length - 1);
  }
  return { queue, queueIndex, shuffleOrder, shufflePosition };
}
