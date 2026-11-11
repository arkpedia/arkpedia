import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeAudioEngine, nativeAudioPlugin, nativeQueue, type NativeAudioPlugin, type NativeQueueInput, type NativeState, type NativeTrack } from '../../lib/music/nativeAudio';
import { PLAYER_STATE } from '../../lib/music/playbackEngine';

const songs = ['1', '2', '3', '4'].map(id => ({ id: `msr:${id}`, title: `Song ${id}` }));
const queueInput = (extra: Partial<NativeQueueInput> = {}): NativeQueueInput => ({
  currentId: 'msr:2', currentAutoplay: false, queue: songs.slice(0, 3), order: null,
  history: { tracks: ['msr:1', 'msr:2'], position: 1 }, queued: new Set(), autoplay: [songs[3]], repeat: 'off',
  lookup: id => songs.find(song => song.id === id), route: id => ({ kind: 'msr', cid: id.slice(4) }), ...extra,
});

test('native snapshots preserve queue before autoplay, history and shuffle order', () => {
  assert.deepEqual(nativeQueue(queueInput()).tracks.map(track => [track.id, track.autoplay]), [
    ['msr:1', false], ['msr:2', false], ['msr:3', false], ['msr:4', true],
  ]);
  const shuffled = nativeQueue(queueInput({ order: [1, 0, 2], history: { tracks: ['msr:2'], position: 0 } }));
  assert.deepEqual(shuffled.tracks.map(track => track.id), ['msr:2', 'msr:1', 'msr:3', 'msr:4']);
  const repeatedLater = nativeQueue(queueInput({ order: [1, 0, 2] }));
  assert.deepEqual(repeatedLater.tracks.map(track => track.id), ['msr:2', 'msr:1', 'msr:3', 'msr:4'], 'An upcoming chosen song must not disappear because it was heard earlier');
});

test('repeat all loops only chosen tracks, while repeat one retains the manual Next target', () => {
  const repeated = nativeQueue(queueInput({ repeat: 'all' }));
  assert.equal(repeated.repeat, 'all');
  assert.deepEqual(repeated.tracks.map(track => track.id), ['msr:2', 'msr:3', 'msr:1']);
  assert.equal(nativeQueue(queueInput({ repeat: 'one' })).tracks.at(-1)?.id, 'msr:4');
});

test('a YouTube boundary stops native lookahead instead of skipping or repeating the partial queue', () => {
  const result = nativeQueue(queueInput({ repeat: 'all', route: id => id === 'msr:3' ? { kind: 'youtube', videoId: 'youtube' } : { kind: 'msr', cid: id.slice(4) } }));
  assert.deepEqual(result.tracks.map(track => track.id), ['msr:2']);
  assert.equal(result.repeat, 'off');
});

test('chosen additions take priority while an autoplay track is playing', () => {
  const result = nativeQueue(queueInput({ currentId: 'msr:4', currentAutoplay: true, queued: new Set(['msr:3']), history: { tracks: ['msr:4'], position: 0 }, autoplay: [songs[0]] }));
  assert.deepEqual(result.tracks.map(track => [track.id, track.autoplay]), [['msr:4', true], ['msr:3', false], ['msr:1', true]]);
});

test('the native bridge is absent in ordinary browsers and on Preview', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://preview.arkpedia.net' }, Capacitor: { Plugins: { ArkpediaAudio: {} } } } });
    assert.equal(nativeAudioPlugin(), null);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://www.arkpedia.net' } } });
    assert.equal(nativeAudioPlugin(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('background preference edits survive reconciliation and do not toggle again on repeated ticks', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const storage = new Map<string, string>();
  const track: NativeTrack = { id: 'msr:1', cid: '1', title: 'First', artist: 'MSR', album: '', autoplay: false };
  let state: NativeState = { version: 1, track, playing: true, buffering: false, seconds: 42, duration: 100, revision: 1,
    changes: { 'favourites:msr:1': { id: 'msr:1', kind: 'favourites', value: true }, 'blocked:msr:2': { id: 'msr:2', kind: 'blocked', value: true } }, error: '' };
  let listener: (state: NativeState) => void = () => {};
  const configs: Parameters<NativeAudioPlugin['configure']>[0][] = [];
  const loads: string[] = [];
  const plugin: NativeAudioPlugin = {
    getState: async () => structuredClone(state),
    addListener: async (_, callback) => { listener = callback; return { remove: async () => {} }; },
    configure: async config => { configs.push(config); state = { ...state, changes: {} }; return structuredClone(state); },
    command: async () => structuredClone(state),
    loadTrack: async request => { loads.push(request.track.id); state = { ...state, track: request.track, playing: request.play, seconds: request.seconds }; return structuredClone(state); },
  };
  const events: number[] = [];
  const windowStub = Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  } });
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { visibilityState: 'visible' }) });
    const element = { pause() {}, removeAttribute() {}, load() {} } as unknown as HTMLAudioElement;
    const engine = createNativeAudioEngine({ onState: code => events.push(code), onError() {}, onStuck() {}, onAutoplayBlocked() {} }, plugin,
      (id, cid) => ({ ...track, id, cid }), element);
    assert.equal(await engine.restore(), true);
    assert.equal(engine.getCurrentTime(), 42);
    assert.deepEqual(loads, [], 'Restoring must not reload a playing native stream');
    assert.deepEqual(JSON.parse(storage.get('musicFavorites')!), ['msr:1']);
    assert.deepEqual(JSON.parse(storage.get('arkpediaMusicNoAutoplay')!), ['msr:2']);
    storage.set('musicFavorites', '[]'); // A newer explicit tap in the website.
    listener(structuredClone(state));
    assert.deepEqual(JSON.parse(storage.get('musicFavorites')!), [], 'A repeated native revision must not undo the web tap');
    engine.synchronize({ tracks: [track], repeat: 'off' });
    await engine.restore(); // Drain the serialized bridge operations.
    assert.equal(configs[0].revision, 1);
    assert.deepEqual(configs[0].favourites, []);
    assert.deepEqual(configs[0].blocked, ['msr:2']);
    engine.loadVideoById({ videoId: 'msr:2', cid: '2' });
    engine.loadVideoById({ videoId: 'msr:3', cid: '3' });
    await engine.restore();
    assert.equal(engine.getVideoData().video_id, 'msr:3');
    assert.ok(events.includes(PLAYER_STATE.PLAYING));
    engine.cueVideoById({ videoId: 'msr:1', cid: '1' });
    await new Promise(resolve => setImmediate(resolve));
    listener({ ...state, playing: true }); // Play from the lock screen, not the website.
    listener({ ...state, playing: false });
    assert.equal(events.at(-1), PLAYER_STATE.PAUSED, 'Remote Pause after a cued track must clear the website playing state');
    listener({ ...state, sessionId: 'native', sequence: 10, seconds: 80 });
    listener({ ...state, sessionId: 'native', sequence: 9, seconds: 0 });
    assert.equal(engine.getCurrentTime(), 80, 'A delayed response must not rewind newer playback state');
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
