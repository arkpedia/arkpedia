import test from 'node:test';
import assert from 'node:assert/strict';
import type { RawAlbum } from '../../lib/music/albumsData';
import { browseAlbumsFromSongs, discoverFromRelease, discoverPageData } from '../../lib/music/albumsDataServer';

/*
 * Browse by album on /music/discover (2026-10-14, asked for by the site's co-owner, after
 * Monster Siren's own site): every album with a song to play, newest first. The album list
 * keeps the albums with no readable date (newestFirst leaves them out of Recently added) and
 * puts them last, and counts the songs its tile opens on, those only Monster Siren has too.
 */

const song = (songId: string, albumId: string, videoId: string) => ({ songId, songName: `Song ${songId}`, albumId, videoId });
const FIXTURE: RawAlbum[] = [
  { albumId: 'old', albumName: '旧专辑', albumAltName: 'Old Album', coverFilename: 'old.webp', releaseDate: '2020/01/02', songs: [song('1', 'old', 'aaaaaaaaaaa'), song('2', 'old', 'bbbbbbbbbbb')] },
  { albumId: 'undated', albumName: 'No Date', releaseDate: '', songs: [song('3', 'undated', 'ccccccccccc')] },
  { albumId: 'new', albumName: '新专辑', albumAltName: '', coverFilename: '', releaseDate: 'October 8, 2025', songs: [song('4', 'new', ''), song('5', 'new', 'ddddddddddd')] },
  { albumId: 'newest', albumName: 'Newest', releaseDate: '2026/09/24', songs: [song('6', 'newest', '')] },
  { albumId: 'empty', albumName: 'Empty', releaseDate: '2026/09/25', songs: [] },
];

test('Browse by album lists every album with a song, newest first, the undated last', () => {
  const { albums } = discoverPageData(FIXTURE);
  assert.deepEqual(albums, [
    { albumId: 'newest', albumName: 'Newest', albumAltName: 'Newest', coverPath: null, releaseDate: '2026/09/24', songCount: 1 },
    { albumId: 'new', albumName: '新专辑', albumAltName: '新专辑', coverPath: null, releaseDate: '2025/10/08', songCount: 2 },
    { albumId: 'old', albumName: '旧专辑', albumAltName: 'Old Album', coverPath: '/album-covers/old.webp', releaseDate: '2020/01/02', songCount: 2 },
    { albumId: 'undated', albumName: 'No Date', albumAltName: 'No Date', coverPath: null, releaseDate: '', songCount: 1 },
  ]);
});

test('each album\'s count is the songs its tile opens on (Discover\'s album facet)', () => {
  const data = discoverPageData(FIXTURE);
  const all = [...data.songs, ...data.pendingSongs];
  for (const album of data.albums) assert.equal(album.songCount, all.filter((s) => s.albumId === album.albumId).length, album.albumId);
});

test('a release compiled before Browse by album gets its list from the songs it carries', () => {
  const data = discoverPageData(FIXTURE);
  const { albums: _albums, ...previous } = data;
  void _albums;
  const filled = discoverFromRelease(previous);
  assert.ok(Array.isArray(filled.albums));
  // Recently added dates the albums it lists, so they lead; the rest follow, the catalogue's
  // last first. Counts and names are the same as this code's own list.
  assert.deepEqual(filled.albums.map((a) => a.albumId), ['newest', 'new', 'old', 'undated']);
  assert.deepEqual(filled.albums.map((a) => [a.albumAltName, a.songCount]), data.albums.map((a) => [a.albumAltName, a.songCount]));
  // A release this code compiled passes through as it is.
  assert.equal(discoverFromRelease(data), data);
});

test('the fallback orders the albums Recently added leaves out after it, newest of them first', () => {
  const songs = [
    { albumId: 'a', albumName: 'A', coverPath: null },
    { albumId: 'b', albumName: 'B', coverPath: null },
    { albumId: 'a', albumName: 'A', coverPath: null },
    { albumId: 'c', albumName: 'C', coverPath: '/album-covers/c.webp' },
  ];
  const albums = browseAlbumsFromSongs(songs, [{ albumId: 'b', albumName: '乙', albumAltName: 'B', releaseDate: '2026/01/01' }]);
  assert.deepEqual(albums.map((a) => [a.albumId, a.albumName, a.songCount, a.releaseDate]), [['b', '乙', 1, '2026/01/01'], ['c', 'C', 1, ''], ['a', 'A', 2, '']]);
});
