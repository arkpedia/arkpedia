import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlaybackPositionStore, INITIAL_PLAYBACK_POSITION } from '../../lib/music/playbackPosition';

test('the position store keeps one snapshot until a field changes, and tells its listeners only then', () => {
  const store = createPlaybackPositionStore();
  let heard = 0;
  const stop = store.subscribe(() => { heard += 1; });
  const first = store.get();
  assert.deepEqual(first, INITIAL_PLAYBACK_POSITION);
  // The same values again: no new snapshot (useSyncExternalStore would re-render on one), nobody told.
  store.set({ currentTime: 0 });
  store.set({});
  assert.equal(store.get(), first);
  assert.equal(heard, 0);
  store.set({ currentTime: 12.5 });
  assert.equal(heard, 1);
  assert.notEqual(store.get(), first);
  assert.deepEqual(store.get(), { currentTime: 12.5, duration: 0, seeking: false });
  // Several fields in one write: one notice, the untouched field kept.
  store.set({ duration: 240, seeking: true });
  assert.equal(heard, 2);
  assert.deepEqual(store.get(), { currentTime: 12.5, duration: 240, seeking: true });
  // An undefined field is not a write of undefined.
  store.set({ currentTime: undefined, seeking: false });
  assert.deepEqual(store.get(), { currentTime: 12.5, duration: 240, seeking: false });
  stop();
  store.set({ currentTime: 13 });
  assert.equal(heard, 3, 'unsubscribed: not told');
});
