/**
 * The queue edits the music page offers -- Play now, Play next, Add to queue, Clear -- as pure
 * functions of the player's queue state (lib/music/musicPlayerContext.tsx), so the provider
 * applies one result to its refs and state at once, and the rules are tested without YouTube
 * (scripts/tests/test-music-queue-ops.ts).
 *
 * The queue is played in display order: the shuffle order when shuffle is on, else the queue's
 * own. Every position here is a display position, and the current song's is `current`. Songs the
 * reader queued (Play next, Add to queue) and that have not played yet are `queued`: the run of
 * them right after the current song is "Next in queue", and Add to queue lands at its end, as in
 * Spotify or YouTube Music. A song already in the queue is moved, never duplicated: the default
 * queue holds every song, so a copy would play it twice.
 */

export interface QueueSong {
  id: string;
}

export interface QueueState<T extends QueueSong> {
  queue: T[];
  queueIndex: number;
  /** Queue indices in the order they play, or null with shuffle off. */
  shuffleOrder: number[] | null;
  shufflePosition: number;
  queued: ReadonlySet<string>;
}

export type Placement = 'next' | 'last';

export type PlaceResult<T extends QueueSong> =
  | { ok: true; state: QueueState<T>; position: number; moved: boolean }
  | { ok: false; reason: 'current' | 'unavailable' };

/** Queue indices in the order they play. */
export function displayOrder(state: QueueState<QueueSong>): number[] {
  return state.shuffleOrder ?? state.queue.map((_, index) => index);
}

/** The current song's display position. */
export function currentPosition(state: QueueState<QueueSong>): number {
  return state.shuffleOrder ? state.shufflePosition : state.queueIndex;
}

/** How many songs right after the current one the reader queued and have not played. */
export function queuedRun(state: QueueState<QueueSong>): number {
  const order = displayOrder(state);
  const current = currentPosition(state);
  let run = 0;
  while (current + 1 + run < order.length && state.queued.has(state.queue[order[current + 1 + run]]?.id)) run += 1;
  return run;
}

/** The state with the queue played in `order` (queue indices in display order). */
function withOrder<T extends QueueSong>(state: QueueState<T>, queue: T[], order: number[], queued: ReadonlySet<string>): QueueState<T> {
  const currentIndex = state.queueIndex;
  if (state.shuffleOrder) {
    return { queue, queueIndex: currentIndex, shuffleOrder: order, shufflePosition: Math.max(0, order.indexOf(currentIndex)), queued };
  }
  // Shuffle off: the queue itself is the order.
  return { queue: order.map(index => queue[index]), queueIndex: Math.max(0, order.indexOf(currentIndex)), shuffleOrder: null, shufflePosition: 0, queued };
}

/**
 * Puts a song right after the current one ('next') or at the end of the songs the reader already
 * queued there ('last'). `track` is the song to insert when the queue does not hold it (a saved
 * playlist, or a queue cleared down to its current song); without it such a song is
 * 'unavailable' (stream-safe filtered it, or it is not in the catalogue).
 */
export function placeSong<T extends QueueSong>(state: QueueState<T>, id: string, where: Placement, track?: T | null): PlaceResult<T> {
  const order = displayOrder(state);
  const current = currentPosition(state);
  const queued = new Set(state.queued);
  const existing = state.queue.findIndex(song => song.id === id);
  if (existing !== -1 && existing === state.queueIndex && state.queue.length > 0) return { ok: false, reason: 'current' };
  // The run is counted before this song moves: it may be inside it.
  const slot = current + 1 + (where === 'last' ? queuedRun(state) : 0);
  queued.add(id);
  if (existing !== -1) {
    const from = order.indexOf(existing);
    const next = order.filter((_, position) => position !== from);
    const to = from < slot ? slot - 1 : slot;
    next.splice(to, 0, existing);
    const placed = withOrder(state, state.queue, next, queued);
    return { ok: true, state: placed, position: displayOrder(placed).indexOf(placed.queue.findIndex(song => song.id === id)), moved: true };
  }
  if (!track) return { ok: false, reason: 'unavailable' };
  const queue = [...state.queue, track];
  const next = [...order];
  next.splice(Math.min(slot, next.length), 0, queue.length - 1);
  // An empty queue has no current song: the new one becomes it.
  const base = state.queue.length === 0 ? { ...state, queueIndex: 0, shufflePosition: 0 } : state;
  const placed = withOrder(base, queue, next, queued);
  return { ok: true, state: placed, position: displayOrder(placed).indexOf(placed.queue.findIndex(song => song.id === id)), moved: false };
}

/** Every song but the current one taken out: what Clear queue leaves. */
export function clearUpcoming<T extends QueueSong>(state: QueueState<T>): QueueState<T> {
  const current = state.queue[state.queueIndex];
  if (!current) return { queue: [], queueIndex: 0, shuffleOrder: state.shuffleOrder ? [] : null, shufflePosition: 0, queued: new Set() };
  return { queue: [current], queueIndex: 0, shuffleOrder: state.shuffleOrder ? [0] : null, shufflePosition: 0, queued: new Set() };
}

/**
 * A saved state put back (Undo after Clear queue), playing on from the song playing now: the
 * snapshot's current position moves to wherever that song sits in it. When the snapshot does not
 * hold the song, the song goes back where it was cleared from, right after the snapshot's current.
 */
export function restoreAround<T extends QueueSong>(snapshot: QueueState<T>, playingId: string | null, playing?: T | null): QueueState<T> {
  if (!playingId) return snapshot;
  const index = snapshot.queue.findIndex(song => song.id === playingId);
  if (index !== -1) {
    const order = displayOrder(snapshot);
    return snapshot.shuffleOrder
      ? { ...snapshot, queueIndex: index, shufflePosition: Math.max(0, order.indexOf(index)) }
      : { ...snapshot, queueIndex: index };
  }
  if (!playing) return snapshot;
  const placed = placeSong(snapshot, playingId, 'next', playing);
  if (!placed.ok) return snapshot;
  const state = placed.state;
  const at = state.queue.findIndex(song => song.id === playingId);
  const queued = new Set(state.queued);
  queued.delete(playingId);
  return state.shuffleOrder
    ? { ...state, queueIndex: at, shufflePosition: displayOrder(state).indexOf(at), queued }
    : { ...state, queueIndex: at, queued };
}
