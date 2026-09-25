import test from 'node:test';
import assert from 'node:assert/strict';
import { newestFirst } from '../../lib/music/albumsDataServer';
import { coverUploadDate, normalizeReleaseDate, parseReleaseDate } from '../../lib/music/releaseDate.mjs';

test('album release dates are read as days, so prose and blanks never outrank the newest album', () => {
  assert.equal(parseReleaseDate('2026/09/03'), Date.UTC(2026, 8, 3));
  for (const bad of ['October 8, 2025', '2026-09-03', '2026/02/30', '', null, undefined]) assert.equal(parseReleaseDate(bad), null, String(bad));
  assert.equal(normalizeReleaseDate('October 8, 2025'), '2025/10/08');
  assert.equal(normalizeReleaseDate('Febuary 16, 2024'), '2024/02/16');
  assert.equal(normalizeReleaseDate('December 5th, 2023'), '2023/12/05');
  assert.equal(normalizeReleaseDate('8 October 2025'), '2025/10/08');
  assert.equal(normalizeReleaseDate('2026-9-3'), '2026/09/03');
  for (const bad of ['Smarch 3, 2025', 'February 30, 2024', 'soon', '']) assert.equal(normalizeReleaseDate(bad), null, bad);
  assert.equal(coverUploadDate('https://web.hycdn.cn/siren/pic/20260921/b75d27f5.jpg'), '2026/09/21');
  assert.equal(coverUploadDate('https://web.hycdn.cn/siren/pic/bad/b75d27f5.jpg'), null);
  // The four ways Recently added used to go wrong, as it would have sorted them by text.
  const albums = [
    { albumId: 'prose', releaseDate: 'October 8, 2025' },
    { albumId: 'blank', releaseDate: '' },
    { albumId: 'newest', releaseDate: '2026/09/03' },
    { albumId: 'typo', releaseDate: 'Febuary 16, 2024' },
    { albumId: 'unreadable', releaseDate: 'soon' },
    { albumId: 'older', releaseDate: '2026/01/11' },
  ];
  assert.deepEqual(newestFirst(albums).map(album => album.albumId), ['newest', 'older', 'prose', 'typo']);
});
