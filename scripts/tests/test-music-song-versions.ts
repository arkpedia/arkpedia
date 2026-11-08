import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instrumentalLyricLines, versionTiming } from '../../lib/music/versionTiming';
import { findSongVersion } from '../../lib/music/songVersions';

test('pairs exact vocal and instrumental versions in either direction', () => {
  const vocal = { id: 'v', title: '秋绪', altTitle: 'Autumn Moods', album: 'Autumn Moods' };
  const instrumental = { id: 'i', title: '秋绪 (Instrumental)', album: 'Autumn Moods' };
  assert.equal(findSongVersion(vocal, [instrumental])?.song.id, 'i');
  assert.equal(findSongVersion(instrumental, [vocal])?.label, 'Play vocal version');
  assert.equal(findSongVersion(vocal, [{ ...instrumental, album: 'Live' }]), null);
  assert.equal(findSongVersion(vocal, [instrumental, { ...instrumental, id: 'duplicate' }]), null);
  assert.equal(findSongVersion(vocal, [{ ...instrumental, title: 'Autumn Moods (Live Instrumental)' }]), null);
});

test('recording offsets are reversible and independent of outro length', () => {
  for (const [vocal, instrumental, offset] of [
    ['461129', '306884', 14.6255], ['DxMj5INKYQA', '1JJDnq2EVuc', 14.6255],
    ['779468', '048776', 7.863], ['2Qul6EjQmYc', 'klxYxU_4c-k', 7.863],
    ['048753', '125025', 0], ['232244', '953967', 0.00775],
  ] as const) {
    assert.equal(60 + versionTiming(vocal, instrumental).offset, 60 - offset);
    assert.equal(60 + versionTiming(instrumental, vocal).offset, 60 + offset);
  }
  assert.equal(versionTiming('048753', '125025').duration, 156.842);
  assert.deepEqual(versionTiming('unrelated', '306884'), { offset: 0, duration: Infinity });
});

test('borrowed lyrics keep only cues inside the instrumental and leave the vocal sheet intact', () => {
  const lines = [3, 50.298, 221.5].map(time => ({ time, text: String(time) }));
  const expected = [{ time: 50.298 - 14.6255, text: '50.298' }];
  assert.deepEqual(instrumentalLyricLines(lines, '306884'), expected);
  assert.deepEqual(instrumentalLyricLines(lines, '1JJDnq2EVuc'), expected);
  assert.equal(instrumentalLyricLines(lines, '461129'), lines);
  assert.equal(lines.length, 3);
});

test('the short edit maps skipped and repeated passages on both recordings', () => {
  const lines = [17.1, 68.08, 214].map(time => ({ time, text: String(time) }));
  const msr = instrumentalLyricLines(lines, '125012');
  assert.deepEqual(msr.map(line => line.text), ['17.1', '214', '214', '214']);
  assert.deepEqual(msr.map(line => Math.floor(line.time)), [8, 50, 68, 76]);
  const upload = instrumentalLyricLines(lines, 'lR7kZ2xwofI');
  assert.deepEqual(upload.map(line => line.time), msr.map(line => line.time + 0.0895));
});
