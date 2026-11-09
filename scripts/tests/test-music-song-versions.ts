import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instrumentalLyricLines, versionTiming } from '../../lib/music/versionTiming';
import { findSongVersion } from '../../lib/music/songVersions';
import { songsFromAlbums, type RawAlbum } from '../../lib/music/albumsData';
import { stripLyricCredits } from '../../lib/music/lyricCredits';
import measuredTimings from '../../config/music-recording-timings.json';

test('pairs exact vocal and instrumental versions in either direction', () => {
  const vocal = { id: 'v', title: '秋绪', altTitle: 'Autumn Moods', album: 'Autumn Moods' };
  const instrumental = { id: 'i', title: '秋绪 (Instrumental)', album: 'Autumn Moods' };
  assert.equal(findSongVersion(vocal, [instrumental])?.song.id, 'i');
  assert.equal(findSongVersion(instrumental, [vocal])?.label, 'Play vocal version');
  assert.equal(findSongVersion(vocal, [{ ...instrumental, album: 'Live' }]), null);
  assert.equal(findSongVersion(vocal, [instrumental, { ...instrumental, id: 'duplicate' }]), null);
  assert.equal(findSongVersion(vocal, [{ ...instrumental, title: 'Autumn Moods (Live Instrumental)' }]), null);
});

test('legacy published lyric arrays lose only their opening credit block', () => {
  const sung = [{ time: 10, text: 'First sung line' }, { time: 20, text: 'Performed by: a sung line now' }];
  const oldRelease = [{ time: 1, text: 'Director: Person' }, { time: 2, text: 'Performed by: Person' }, { time: 3, text: 'OP: Publisher' }, ...sung];
  assert.deepEqual(stripLyricCredits(oldRelease), sung);
  assert.equal(stripLyricCredits(sung), sung);
});

test('lyric borrowing shares version matching across instrumental title conventions', () => {
  for (const suffix of [' (Instrumental)', '(Instrumental)', '（Instrumental）', '（Instrumental)', '  (instrumental)', ' (Instrumental Version)']) {
    const album: RawAlbum = { albumId: 'magic', albumName: 'Magic Theorem', songs: [
      { songId: '880368', songName: 'Magic Theorem', albumId: 'magic', videoId: 'vocal', lyricFilename: 'vocal.lrc' },
      { songId: '514576', songName: 'Magic Theorem' + suffix, albumId: 'magic', videoId: 'instrumental' },
    ] };
    const songs = songsFromAlbums([album]);
    assert.equal(songs[1].hasLyrics, true, suffix);
    assert.equal(songs[1].lyricTrackId, 'vocal', suffix);
    assert.equal(songs[1].lyricFilename, 'vocal.lrc', suffix);
    album.songs![1].lyricFilename = 'own.lrc';
    assert.equal(songsFromAlbums([album])[1].lyricTrackId, 'instrumental', 'An independent instrumental sheet stays on its own clock');
    album.songs!.push({ ...album.songs![0], songId: 'duplicate', videoId: 'duplicate' });
    delete album.songs![1].lyricFilename;
    assert.equal(songsFromAlbums([album])[1].hasLyrics, false, 'Ambiguous vocals are not guessed');
  }
});

test('the catalogue typo pairs only the verified Operation Fake Waves recordings', () => {
  const vocal = { id: '461171', title: 'Operation Fake Waves', album: 'fake-waves' };
  const instrumental = { id: '232282', title: 'Opeation Fake Waves (Instrumental)', album: 'fake-waves' };
  assert.equal(findSongVersion(vocal, [instrumental])?.song.id, instrumental.id);
  assert.equal(findSongVersion(instrumental, [vocal])?.song.id, vocal.id);
  assert.equal(findSongVersion(vocal, [{ ...instrumental, id: 'unrelated' }]), null);
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
  // The current Opus upload and the earlier AAC measurement agree within 5 ms.
  for (let i = 0; i < upload.length; i++) assert.ok(Math.abs(upload[i].time - msr[i].time - 0.0895) < .005);
});

test('Magic Theorem uses its measured recording clock for switching and borrowed cues', () => {
  const vocal = '880368', instrumental = '514576';
  assert.ok(Math.abs(versionTiming(vocal, instrumental).offset - .368917) < .000001);
  assert.ok(Math.abs(versionTiming(instrumental, vocal).offset + .368917) < .000001);
  const lines = [{ time: 10.5, text: 'First line' }];
  assert.deepEqual(instrumentalLyricLines(lines, instrumental), [{ time: 10.868917, text: 'First line' }]);
  assert.equal(instrumentalLyricLines(lines, instrumental, true), lines, 'An independent instrumental lyric file is already on its own clock');
});

test('video intros shift upload lyrics without moving the native recording', () => {
  const lines = [{ time: 30, text: 'Line' }];
  assert.equal(instrumentalLyricLines(lines, '953922'), lines);
  const projected = instrumentalLyricLines(lines, 'MpMto0d4tgg');
  assert.ok(projected[0].time > 40 && projected[0].time < 41);
});

test('every calibrated pair round-trips on the shared music, including upload clocks', () => {
  const seen = new Set<string>();
  for (const [vocal, instrumental, offset, vocalLength, instrumentalLength] of measuredTimings.pairs as [string, string, number, number, number][]) {
    assert.ok(!seen.has(vocal + '/' + instrumental));
    seen.add(vocal + '/' + instrumental);
    const start = Math.max(0, offset), end = Math.min(vocalLength, instrumentalLength + offset);
    assert.ok(end > start);
    for (const fraction of [.1, .5, .9]) {
      const at = start + (end - start) * fraction;
      const other = at + versionTiming(vocal, instrumental).offset;
      assert.ok(other >= 0 && other < instrumentalLength);
      assert.ok(Math.abs(other + versionTiming(instrumental, vocal).offset - at) < .000001);
    }
  }
  const videos = new Set<string>();
  for (const [video, cid, offset, nativeLength, uploadLength] of measuredTimings.youtubeAliases as [string, string, number, number, number][]) {
    assert.ok(!videos.has(video)); videos.add(video);
    assert.match(cid, /^\d+$/);
    assert.ok(Number.isFinite(offset) && nativeLength > 0 && uploadLength > 0);
    const pair = measuredTimings.pairs.find(([vocal, instrumental]) => vocal === cid || instrumental === cid);
    if (pair) {
      const [vocal, instrumental, nativeOffset] = pair as [string, string, number, number, number];
      const other = cid === vocal ? instrumental : vocal;
      const expected = offset + (cid === vocal ? -nativeOffset : nativeOffset);
      assert.ok(Math.abs(versionTiming(video, other).offset - expected) < .000001);
      assert.ok(Math.abs(versionTiming(other, video).offset + expected) < .000001);
      assert.equal(versionTiming(other, video).duration, uploadLength);
    }
  }
});
