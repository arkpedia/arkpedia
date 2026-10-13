import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RawAlbum } from '../../lib/music/albumsData';
import { songsFromAlbums } from '../../lib/music/albumsData';
import { albumSummaries, discoverPageData } from '../../lib/music/albumsDataServer';

/*
 * A new Monster Siren album arrives as a record with no YouTube videoId (a person adds it) and
 * no cover (the album sync fills coverFilename once arkpedia-image-assets publishes it), and
 * /music/discover listed only albums with a playable song, so every new album stayed off it:
 * 1014 月明人间 and 0232 逐影集趣ost from 2026-09-25, both in the day's quarantine as
 * published-partial. They now lead Recently added with the placeholder cover, and their songs
 * are listed as not on YouTube yet.
 */

// Data main's albums.json on 2026-09-26: the two quarantined albums as the album sync wrote them,
// and the newest album that has a videoId and a cover.
const FIXTURE: RawAlbum[] = [
  { albumId: '7760', albumName: '月行水上', albumAltName: 'Sur le lac lune vivante', coverFilename: '月行水上_cover.webp', releaseDate: '2026/09/03', characters: [], albumCategory: ['Event OST'], albumGenre: [],
    songs: [{ songId: '953936', songName: '凡常恩典', songAltName: '', albumId: '7760', credits: [], lyricFilename: '凡常恩典_lyrics.lrc', videoId: 'chBNJdaKaPA', length: '03:47', songCategory: ['Event OST'], songGenre: [], copyright: 'no' }] },
  { albumId: '0232', albumName: '逐影集趣ost', albumAltName: '', coverFilename: '', releaseDate: '2026/09/21', characters: [], albumCategory: [], albumGenre: [],
    songs: [{ songId: '880383', songName: 'Rondo in the Clouds', songAltName: '', albumId: '0232', credits: [], lyricFilename: '', videoId: '', length: '02:52', songCategory: [], songGenre: [], copyright: 'no' }] },
  { albumId: '1014', albumName: '月明人间', albumAltName: '', coverFilename: '', releaseDate: '2026/09/24', characters: [], albumCategory: [], albumGenre: [],
    songs: [{ songId: '953935', songName: '月明人间', songAltName: '', albumId: '1014', credits: [], lyricFilename: '', videoId: '', length: '03:25', songCategory: [], songGenre: [], copyright: 'no' }] },
  // An album with no songs at all has nothing to show.
  { albumId: 'empty', albumName: 'Empty', coverFilename: 'Empty_cover.webp', releaseDate: '2026/09/25', songs: [] },
];

test('a new album with no videoId and no cover yet leads Recently added, with the placeholder', () => {
  const data = discoverPageData(FIXTURE);
  assert.deepEqual(data.recentAlbums, [
    { albumId: '1014', albumName: '月明人间', albumAltName: '月明人间', coverPath: null, releaseDate: '2026/09/24', playable: false },
    { albumId: '0232', albumName: '逐影集趣ost', albumAltName: '逐影集趣ost', coverPath: null, releaseDate: '2026/09/21', playable: false },
    { albumId: '7760', albumName: '月行水上', albumAltName: 'Sur le lac lune vivante', coverPath: '/album-covers/月行水上_cover.webp', releaseDate: '2026/09/03', playable: true },
  ]);
  // Its songs are listed, linked to Monster Siren, never queued: the player needs a videoId.
  assert.deepEqual(data.pendingSongs.map(song => [song.songId, song.albumId, song.coverPath]), [['880383', '0232', null], ['953935', '1014', null]]);
  assert.deepEqual(data.songs.map(song => song.videoId), ['chBNJdaKaPA']);
  assert.deepEqual(songsFromAlbums(FIXTURE).map(song => song.albumId), ['7760']);
  assert.deepEqual(albumSummaries(FIXTURE).map(album => [album.albumId, album.songCount, album.pendingCount]), [['7760', 1, 0], ['0232', 0, 1], ['1014', 0, 1]]);
});

test('the same album shows its cover once the image repository publishes it and the sync names it', () => {
  const published = FIXTURE.map(album => album.albumId === '1014' ? { ...album, coverFilename: '月明人间_cover.webp' } : album);
  assert.equal(discoverPageData(published).recentAlbums[0].coverPath, '/album-covers/月明人间_cover.webp');
  const playable = published.map(album => album.albumId === '1014' ? { ...album, songs: album.songs!.map(song => ({ ...song, videoId: 'x'.repeat(11) })) } : album);
  const data = discoverPageData(playable);
  assert.equal(data.recentAlbums[0].playable, true);
  assert.deepEqual(data.pendingSongs.map(song => song.songId), ['880383']);
});

test('every album cover on the music pages goes through AlbumCover, so none can forget the placeholder', () => {
  const files = ['pages/music/discover.tsx', 'pages/music/index.tsx', ...fs.readdirSync('components/music').map(name => path.join('components/music', name))]
    .filter(file => file !== 'components/music/AlbumCover.tsx');
  const offenders: string[] = [];
  for (const file of files) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!/<Image\b[^>]*\bsrc=\{[^}]*[cC]over/.test(line)) return;
      // The now-playing cover fills a 280px frame and has its own ♪ fallback beside it.
      if (file === 'pages/music/index.tsx' && /src=\{nowPlayingCover\}/.test(line)) return;
      offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
  assert.match(fs.readFileSync('pages/music/discover.tsx', 'utf8'), /<AlbumCover coverPath=\{a\.coverPath\}/);
});
