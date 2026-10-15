import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lyricPreview, songTitle, upcomingIndices } from '../../lib/music/musicPolish';
import { parseLrc } from '../../lib/music/albumsDataServer';
import { migrateChosenQueue, parseMusicResume, type MusicResumeState } from '../../lib/music/musicResume';

test('repeat-all preview wraps the actual shuffled order; repeat-off ends', () => {
  assert.deepEqual(upcomingIndices([2, 0, 1], 2, 'all'), [2, 0, 1]);
  assert.deepEqual(upcomingIndices([2, 0, 1], 1, 'off'), [1]);
  assert.deepEqual(upcomingIndices([2, 0, 1], 2, 'off'), []);
  assert.deepEqual(upcomingIndices([2], 0, 'all'), [2]);
  assert.deepEqual(upcomingIndices([2], 0, 'one'), []);
  assert.deepEqual(upcomingIndices([], 0, 'all'), []);
});

test('lyrics preview follows playback and has three lines at either boundary; unsynced is an excerpt', () => {
  const lines = [0, 10, 20, 30, 40].map(time => ({ time, text: String(time) }));
  assert.deepEqual(lyricPreview(lines, 25).map(row => [row.line.time, row.active]), [[10, false], [20, true], [30, false]]);
  assert.equal(lyricPreview(lines, 0).length, 3);
  assert.equal(lyricPreview(lines, 99).length, 3);
  assert.deepEqual(lyricPreview(lines.map(line => ({ ...line, time: 0 })), 99).map(row => [row.line.text, row.active]), [['0', false], ['10', false], ['20', false]]);
  assert.deepEqual(lyricPreview([], 0), []);
});

test('titles use the same localized name regardless of timing and have a native fallback', () => {
  assert.equal(songTitle('酸橙色信笺', 'Letter in Orange'), 'Letter in Orange');
  assert.equal(songTitle('酸橙色信笺', ''), '酸橙色信笺');
});

test('legacy automatic queue migrates without losing chosen songs or its edited automatic order', () => {
  const legacy: MusicResumeState = { version: 1, savedAt: 10, left: true, videoId: 'b', title: 'B', seconds: 42, duration: 240,
    playing: true, queue: ['a', 'b', 'c', 'd'], queueIndex: 1, shuffle: true, shuffleOrder: ['b', 'd', 'c', 'a'], shufflePosition: 0,
    repeat: 'off', volume: 50, queued: ['d'] };
  const result = migrateChosenQueue(legacy, legacy.queue);
  assert.deepEqual(result.queue, ['b', 'd']);
  assert.deepEqual(result.autoplayOrder, ['b', 'd', 'c', 'a']);
  assert.equal(result.seconds, 42);
  assert.equal(result.autoplay, true);
  assert.deepEqual(parseMusicResume(JSON.stringify(result)), result);
  assert.deepEqual(migrateChosenQueue({ ...legacy, playlistIds: legacy.queue }).queue, legacy.queue);
  assert.deepEqual(migrateChosenQueue({ ...result, autoplay: false }), { ...result, autoplay: false });
});

test('plain lyric text is available as an unsynchronized excerpt without metadata or credit preamble', () => {
  assert.deepEqual(parseLrc('[00:00]Composer: Person'), []);
  const lines = parseLrc('[ar:Singer]\nComposer: Person\nFirst verse\nSecond verse\nThird verse\nFourth verse');
  assert.deepEqual(lines.map(line => line.time), [0, 0, 0, 0]);
  assert.deepEqual(lyricPreview(lines, 99).map(row => row.line.text), ['First verse', 'Second verse', 'Third verse']);
});

test('legacy shortened and ambiguous queues retain every song and edited order', () => {
  const state: MusicResumeState = { version: 1, savedAt: 10, left: true, videoId: 'a', title: 'A', seconds: 10, duration: 240,
    playing: false, queue: ['a', 'b'], queueIndex: 0, shuffle: true, shuffleOrder: ['b', 'a'], shufflePosition: 1, repeat: 'off', volume: 50 };
  for (const catalogue of [undefined, ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
    const result = migrateChosenQueue(state, catalogue);
    assert.deepEqual(result.queue, ['a', 'b']);
    assert.deepEqual(result.shuffleOrder, ['b', 'a']);
    assert.deepEqual(result.playlistIds, ['a', 'b']);
    assert.equal(result.seconds, 10);
  }
});
