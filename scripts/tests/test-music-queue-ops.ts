import assert from 'node:assert/strict';
import test from 'node:test';
import { clearUpcoming, currentPosition, displayOrder, placeSong, queuedRun, restoreAround, type QueueState } from '../../lib/music/queueOps';

type Song = { id: string };
const songs = (...ids: string[]): Song[] => ids.map(id => ({ id }));
const ids = (state: QueueState<Song>) => displayOrder(state).map(index => state.queue[index].id);
const plain = (queue: Song[], queueIndex = 0, queued: string[] = []): QueueState<Song> =>
  ({ queue, queueIndex, shuffleOrder: null, shufflePosition: 0, queued: new Set(queued) });
const shuffled = (queue: Song[], order: number[], position: number, queued: string[] = []): QueueState<Song> =>
  ({ queue, queueIndex: order[position], shuffleOrder: order, shufflePosition: position, queued: new Set(queued) });
const current = (state: QueueState<Song>) => state.queue[state.queueIndex].id;

test('Play next moves a song already in the queue to right after the current one, without a copy', () => {
  const result = placeSong(plain(songs('a', 'b', 'c', 'd', 'e'), 1), 'e', 'next');
  assert.ok(result.ok);
  assert.deepEqual(ids(result.state), ['a', 'b', 'e', 'c', 'd']);
  assert.equal(current(result.state), 'b');
  assert.equal(result.position, 2);
  assert.equal(result.moved, true);
  // A song played earlier (before the current one) comes forward too.
  const back = placeSong(plain(songs('a', 'b', 'c', 'd'), 2), 'a', 'next');
  assert.ok(back.ok);
  assert.deepEqual(ids(back.state), ['b', 'c', 'a', 'd']);
  assert.equal(current(back.state), 'c');
});

test('Add to queue lands after the songs already queued, in the order they were added', () => {
  let state = plain(songs('a', 'b', 'c', 'd', 'e', 'f'), 0);
  for (const id of ['e', 'c', 'f']) {
    const result = placeSong(state, id, 'last');
    assert.ok(result.ok);
    state = result.state;
  }
  assert.deepEqual(ids(state), ['a', 'e', 'c', 'f', 'b', 'd']);
  assert.equal(queuedRun(state), 3);
  // Play next still jumps the line.
  const next = placeSong(state, 'd', 'next');
  assert.ok(next.ok);
  assert.deepEqual(ids(next.state), ['a', 'd', 'e', 'c', 'f', 'b']);
  // Re-adding a song inside the run moves it to the run's end.
  const again = placeSong(state, 'e', 'last');
  assert.ok(again.ok);
  assert.deepEqual(ids(again.state), ['a', 'c', 'f', 'e', 'b', 'd']);
});

test('with shuffle on only the play order changes, and the current song keeps playing', () => {
  const state = shuffled(songs('a', 'b', 'c', 'd', 'e'), [3, 0, 4, 1, 2], 1);
  assert.equal(current(state), 'a');
  const result = placeSong(state, 'c', 'next');
  assert.ok(result.ok);
  assert.deepEqual(result.state.queue, state.queue, 'the queue array itself is untouched');
  assert.deepEqual(ids(result.state), ['d', 'a', 'c', 'e', 'b']);
  assert.equal(current(result.state), 'a');
  assert.equal(currentPosition(result.state), 1);
});

test('a song the queue lacks is inserted once, and one with no track to insert is unavailable', () => {
  const state = plain(songs('a', 'b', 'c'), 0);
  const inserted = placeSong(state, 'x', 'last', { id: 'x' });
  assert.ok(inserted.ok);
  assert.deepEqual(ids(inserted.state), ['a', 'x', 'b', 'c']);
  assert.equal(inserted.moved, false);
  assert.deepEqual(placeSong(state, 'y', 'next'), { ok: false, reason: 'unavailable' });
  const shuffledInsert = placeSong(shuffled(songs('a', 'b', 'c'), [2, 0, 1], 0), 'x', 'next', { id: 'x' });
  assert.ok(shuffledInsert.ok);
  assert.deepEqual(ids(shuffledInsert.state), ['c', 'x', 'a', 'b']);
  // Into an empty queue: the song becomes the current one.
  const empty = placeSong(plain([]), 'x', 'next', { id: 'x' });
  assert.ok(empty.ok);
  assert.deepEqual(ids(empty.state), ['x']);
  assert.equal(current(empty.state), 'x');
});

test('the current song is not queued after itself', () => {
  assert.deepEqual(placeSong(plain(songs('a', 'b'), 1), 'b', 'next'), { ok: false, reason: 'current' });
});

test('Clear queue keeps only the playing song, and Undo plays on from it in the old queue', () => {
  const before = shuffled(songs('a', 'b', 'c', 'd'), [1, 3, 0, 2], 1, ['a']);
  const cleared = clearUpcoming(before);
  assert.deepEqual(ids(cleared), ['d']);
  assert.equal(cleared.queued.size, 0);
  // The listener skipped on: the old queue comes back around the song playing now.
  const restored = restoreAround(before, 'a');
  assert.deepEqual(ids(restored), ['b', 'd', 'a', 'c']);
  assert.equal(current(restored), 'a');
  // A song the snapshot never held goes back right after the snapshot's current one.
  const outside = restoreAround(plain(songs('a', 'b', 'c'), 0), 'x', { id: 'x' });
  assert.deepEqual(ids(outside), ['a', 'x', 'b', 'c']);
  assert.equal(current(outside), 'x');
  assert.equal(outside.queued.has('x'), false);
});
