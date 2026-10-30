import test from 'node:test';
import assert from 'node:assert/strict';
import arknightsAlbums from '../../data/albums.json';
import endfieldAlbums from '../../data/endfield-albums.json';
import {
  albumCoverPath, catalogueAlbums, getAllAlbums, monsterSirenOnlySongsFromAlbums, songsFromAlbums, YOUTUBE_COVER, type RawAlbum,
} from '../../lib/music/albumsData';
import { discoverPageData } from '../../lib/music/albumsDataServer';
import { discoverShown, RECENT_ALBUMS_LIMIT } from '../../lib/music/discoverFilter';
import { loadMusicCatalogue, projectMusicCatalogue } from '../../lib/music/musicCatalogue';
import {
  DEFAULT_SONG_FILTER, MUSIC_EXCLUDE_COPYRIGHTED_KEY, MUSIC_INCLUDE_ENDFIELD_KEY, readSongFilter, refilterQueue, songAllowed, writeSongFilter,
} from '../../lib/music/songFilter';
import { getSongChoices } from '../../lib/music-guesser/catalogue';
import { ENDFIELD_NOTICE_KEY, setEndfieldNoticeDismissed, shouldShowEndfieldNotice } from '../../lib/music/endfieldNotice';
import { buildSiteSearchEntries, type SiteSearchSources } from '../../lib/search/siteSearchIndex';
import { searchSite, siteSearchJump } from '../../lib/search/siteSearch';
import { createSongIndex } from '../../lib/music/songSearch';
import { gameSearchNames } from '../../lib/music/songFilter';

/*
 * Arknights: Endfield's music (data/endfield-albums.json) and the player's Endfield setting
 * (lib/music/songFilter.ts). The catalogue is read off the label's YouTube channel by
 * arkpedia-data's importer (its scripts/sync/sync-endfield-albums.mjs, whose own test lives
 * beside it); the tests here that read the bundled file check only what must hold of any
 * catalogue.
 */

// The catalogue: each album and song with its game.

const msrSong = (songId: string, videoId: string) => ({ songId, songName: `Song ${songId}`, albumId: 'msr', videoId });
const efSong = (videoId: string) => ({ songId: `endfield-${videoId}`, songName: `Endfield ${videoId}`, albumId: 'endfield-one', videoId, credits: [{ role: 'artist', names: ['Composer One'] }] });
const ARKNIGHTS: RawAlbum[] = [{ albumId: 'msr', albumName: 'Arknights Album', releaseDate: '2026/01/01', coverFilename: 'a.webp', songs: [msrSong('100001', 'msrvideo001'), msrSong('100002', '')] }];
const ENDFIELD: RawAlbum[] = [{ albumId: 'endfield-one', albumName: 'Endfield Album', game: 'endfield', releaseDate: '2026/10/19',
  coverUrl: 'https://i.ytimg.com/vi/efvideo0001/maxresdefault.jpg', songs: [efSong('efvideo0001'), efSong('efvideo0002')] }];

test('every song carries its album\'s game, and Monster Siren\'s gates never take an Endfield song', () => {
  const albums = catalogueAlbums(ARKNIGHTS, ENDFIELD);
  const songs = songsFromAlbums(albums);
  assert.deepEqual(songs.map((song) => [song.trackId, song.game]), [['msrvideo001', 'arknights'], ['efvideo0001', 'endfield'], ['efvideo0002', 'endfield']]);
  assert.deepEqual(monsterSirenOnlySongsFromAlbums(albums).map((song) => song.songId), ['100002']);
  assert.equal(albumCoverPath(ENDFIELD[0]), 'https://i.ytimg.com/vi/efvideo0001/maxresdefault.jpg', 'drawn from its YouTube thumbnail');
  assert.equal(albumCoverPath({ ...ENDFIELD[0], game: undefined }), null, 'only an Endfield album is drawn from YouTube');
  const rows = projectMusicCatalogue(songs).songs;
  assert.deepEqual(rows[0], { videoId: 'msrvideo001', cid: '100001', title: 'Song 100001', album: 'Arknights Album', cover: '/album-covers/a.webp' });
  assert.deepEqual(rows[1], { videoId: 'efvideo0001', title: 'Endfield efvideo0001', artist: 'Composer One', album: 'Endfield Album',
    cover: 'https://i.ytimg.com/vi/efvideo0001/maxresdefault.jpg', game: 'endfield' }, 'no Monster Siren id, and its game');
});

test('the build refuses an album filed under the wrong game or an id the two files share', () => {
  assert.throws(() => catalogueAlbums(ARKNIGHTS, [{ ...ENDFIELD[0], game: undefined }]), /not endfield/);
  assert.throws(() => catalogueAlbums([{ ...ARKNIGHTS[0], game: 'endfield' }], []), /Monster Siren's albums are Arknights/);
  assert.throws(() => catalogueAlbums(ARKNIGHTS, [{ ...ENDFIELD[0], albumId: 'msr' }]), /in both/);
  assert.throws(() => catalogueAlbums(ARKNIGHTS, [{ ...ENDFIELD[0], songs: [{ ...efSong('efvideo0001'), songId: '123456' }] }]), /non-numeric id/);
});

test('the player keeps a row\'s game, takes an Endfield cover, and drops a game it does not know', async () => {
  const body = { songs: [
    { videoId: 'efvideo0001', title: 'Endfield', cover: 'https://i.ytimg.com/vi/efvideo0001/maxresdefault.jpg', game: 'endfield' },
    { videoId: 'futuregame1', title: 'Another game', game: 'another' },
    { videoId: 'msrvideo001', cid: '100001', title: 'Arknights' },
  ] };
  const fetcher = async () => ({ ok: true, status: 200, json: async () => body });
  const songs = await loadMusicCatalogue('/music-catalogue.json', undefined, fetcher);
  assert.deepEqual(songs.map((song) => [song.id, song.game ?? null]), [['efvideo0001', 'endfield'], ['msrvideo001', null]]);
});

test('the bundled Endfield catalogue holds together (any day\'s copy)', () => {
  const albums = endfieldAlbums as RawAlbum[];
  assert.ok(albums.length > 0);
  const ids = new Set<string>();
  for (const album of albums) {
    assert.equal(album.game, 'endfield', album.albumId);
    assert.match(album.albumId, /^endfield-[a-z0-9-]+$/);
    assert.ok(album.coverFilename || YOUTUBE_COVER.test(album.coverUrl ?? ''), `${album.albumId} has a cover`);
    // Only the import's adoption sets a filename, named by the album's id (album-covers/).
    if (album.coverFilename) assert.equal(album.coverFilename, `${album.albumId}_cover.webp`);
    for (const song of album.songs ?? []) {
      assert.match(song.videoId, /^[\w-]{11}$/);
      assert.equal(song.songId, `endfield-${song.videoId}`);
      assert.equal(song.albumId, album.albumId);
      assert.ok(!ids.has(song.videoId), `${song.videoId} once`);
      ids.add(song.videoId);
    }
  }
  // Both files together pass the build's own check, and the song guesser, which plays Monster
  // Siren's audio files, never draws an Endfield song.
  const all = getAllAlbums();
  assert.equal(all.length, (arknightsAlbums as RawAlbum[]).length + albums.length);
  const guessable = new Set(getSongChoices().map((choice) => choice.id));
  for (const album of albums) for (const song of album.songs ?? []) assert.ok(!guessable.has(song.songId));
});

// ---------------------------------------------------------------------------------------
// The setting.

test('Endfield songs are left out until the reader turns them on; stream-safe still applies', () => {
  const arknights = { copyright: false };
  const copyrighted = { copyright: true };
  const endfield = { game: 'endfield' };
  assert.deepEqual([arknights, copyrighted, endfield].map((song) => songAllowed(DEFAULT_SONG_FILTER, song)), [true, true, false]);
  assert.deepEqual([arknights, copyrighted, endfield].map((song) => songAllowed({ excludeCopyrighted: true, includeEndfield: true }, song)), [true, false, true]);
});

test('the setting is stored per browser, off by default, and a refusing storage reads as the default', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  assert.deepEqual(readSongFilter(storage), { excludeCopyrighted: false, includeEndfield: false });
  writeSongFilter(storage, { excludeCopyrighted: false, includeEndfield: true });
  assert.equal(store.get(MUSIC_INCLUDE_ENDFIELD_KEY), 'true');
  assert.equal(store.get(MUSIC_EXCLUDE_COPYRIGHTED_KEY), 'false', 'stream-safe keeps its old key');
  assert.deepEqual(readSongFilter(storage), { excludeCopyrighted: false, includeEndfield: true });
  const refusing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  assert.deepEqual(readSongFilter(refusing), DEFAULT_SONG_FILTER);
  assert.doesNotThrow(() => writeSongFilter(refusing, DEFAULT_SONG_FILTER));
});

const CATALOGUE = [
  { id: 'ark1', title: 'A1' }, { id: 'ef1', title: 'E1', game: 'endfield' }, { id: 'ark2', title: 'A2' },
  { id: 'ef2', title: 'E2', game: 'endfield' }, { id: 'ark3', title: 'A3', copyright: true },
];
const toTrack = (song: { id: string }) => ({ id: song.id });
const ON = { excludeCopyrighted: false, includeEndfield: true };
const OFF = DEFAULT_SONG_FILTER;

test('turning Endfield on puts its songs at the end of the queue; nothing already there moves', () => {
  const queue = [{ id: 'ark2' }, { id: 'ark1' }, { id: 'ark3' }];
  const result = refilterQueue({ queue, queueIndex: 1, shuffleOrder: [2, 0, 1], catalogue: CATALOGUE, before: OFF, after: ON, toTrack, playlistIds: null });
  assert.deepEqual(result.queue.map((track) => track.id), ['ark2', 'ark1', 'ark3', 'ef1', 'ef2']);
  assert.equal(result.queueIndex, 1, 'the playing song stays current');
  assert.deepEqual(result.shuffleOrder, [2, 0, 1, 3, 4]);
  // A saved playlist playing: only its own songs come in.
  const playlist = refilterQueue({ queue, queueIndex: 0, shuffleOrder: null, catalogue: CATALOGUE, before: OFF, after: ON, toTrack, playlistIds: ['ark2', 'ark1', 'ark3', 'ef2'] });
  assert.deepEqual(playlist.queue.map((track) => track.id), ['ark2', 'ark1', 'ark3', 'ef2']);
  assert.equal(playlist.shuffleOrder, null);
});

test('turning Endfield off takes its songs out where they stand and keeps the shuffle order', () => {
  const queue = [{ id: 'ef2' }, { id: 'ark1' }, { id: 'ef1' }, { id: 'ark2' }];
  const result = refilterQueue({ queue, queueIndex: 3, shuffleOrder: [3, 2, 1, 0], catalogue: CATALOGUE, before: ON, after: OFF, toTrack, playlistIds: null });
  assert.deepEqual(result.queue.map((track) => track.id), ['ark1', 'ark2']);
  assert.equal(result.queueIndex, 1);
  assert.deepEqual(result.shuffleOrder, [1, 0]);
  // The playing song itself was Endfield's: the queue starts again from its first song.
  assert.equal(refilterQueue({ queue, queueIndex: 0, shuffleOrder: null, catalogue: CATALOGUE, before: ON, after: OFF, toTrack, playlistIds: null }).queueIndex, 0);
  // Stream-safe turned off lets in only the songs it hid, not songs the reader took out.
  const safe = refilterQueue({ queue: [{ id: 'ark1' }], queueIndex: 0, shuffleOrder: null, catalogue: CATALOGUE,
    before: { excludeCopyrighted: true, includeEndfield: false }, after: OFF, toTrack, playlistIds: null });
  assert.deepEqual(safe.queue.map((track) => track.id), ['ark1', 'ark3']);
});

test('Discover lists Endfield songs, albums and artists only while the setting is on', () => {
  const albums: RawAlbum[] = [
    ...Array.from({ length: 14 }, (_, i) => ({ albumId: `msr${i}`, albumName: `MSR ${i}`, releaseDate: `2025/01/${String(i + 1).padStart(2, '0')}`,
      songs: [{ songId: String(200000 + i), songName: `S${i}`, albumId: `msr${i}`, videoId: `msrvid${String(i).padStart(5, '0')}`, credits: [{ role: 'artist', names: ['MSR Artist'] }] }] })),
    // Newer than every Arknights album: without a cap per game they would fill Recently added.
    ...Array.from({ length: 14 }, (_, i) => ({ albumId: `endfield-${i}`, albumName: `EF ${i}`, game: 'endfield', releaseDate: `2026/02/${String(i + 1).padStart(2, '0')}`,
      coverUrl: 'https://i.ytimg.com/vi/efvideo0001/maxresdefault.jpg',
      songs: [{ songId: `endfield-efvid${String(i).padStart(6, '0')}`, songName: `E${i}`, albumId: `endfield-${i}`, videoId: `efvid${String(i).padStart(6, '0')}`, credits: [{ role: 'artist', names: ['Endfield Artist'] }] }] })),
  ];
  const data = discoverPageData(albums);
  assert.equal(data.recentAlbums.length, 2 * RECENT_ALBUMS_LIMIT, 'the newest of each game');
  assert.ok(data.songs.every((song) => (song.videoId.startsWith('ef') ? song.game === 'endfield' : !('game' in song))));
  const lists = { songs: data.songs, recentAlbums: data.recentAlbums, albums: data.albums, artists: data.artists };
  const off = discoverShown(lists, OFF);
  assert.equal(off.songs.length, 14);
  assert.ok(off.songs.every((song) => song.game !== 'endfield'));
  assert.equal(off.albums.length, 14);
  assert.deepEqual(off.recentAlbums.map((album) => album.albumId), Array.from({ length: RECENT_ALBUMS_LIMIT }, (_, i) => `msr${13 - i}`));
  assert.deepEqual(off.artists.map((artist) => artist.name), ['MSR Artist']);
  const on = discoverShown(lists, ON);
  assert.equal(on.songs.length, 28);
  assert.equal(on.recentAlbums.length, RECENT_ALBUMS_LIMIT);
  assert.ok(on.recentAlbums.every((album) => album.game === 'endfield'), 'newest first, whichever game');
  assert.deepEqual(on.artists.map((artist) => artist.name).sort(), ['Endfield Artist', 'MSR Artist']);
});

test('site search names Endfield\'s songs and albums, and never lists the label as an artist', () => {
  const EMPTY: SiteSearchSources = { pages: [], operators: [], operatorAliases: {}, events: [], contents: [], stages: [], enemies: [], albums: [], songs: [], creators: [], people: [] };
  const entries = buildSiteSearchEntries({
    ...EMPTY,
    albums: [{ albumId: 'endfield-one', albumName: 'Endfield Album', game: 'endfield' }, { albumId: '4527', albumName: '明日方舟OST1', albumAltName: 'Arknights OST 1' }],
    songs: [{ title: 'Endfield Song', artist: 'Composer One', game: 'endfield' }, { title: 'Synthetech', artist: 'BaoUner' }],
  });
  const sub = (title: string) => entries.find((entry) => entry.title === title)?.sub;
  assert.equal(sub('Endfield Album'), 'Endfield');
  assert.equal(sub('Arknights OST 1'), undefined);
  assert.equal(sub('Endfield Song'), 'Endfield · Composer One');
  assert.equal(sub('Synthetech'), 'BaoUner');
});

test('the refresh probe watches the label\'s own Endfield feed', async () => {
  // @ts-expect-error Node publication scripts are plain JavaScript.
  const { ENDFIELD_FEED } = await import('../content/refresh-fingerprint.mjs');
  // arkpedia-data's importer reads this same address, and its own test holds its copy of it.
  assert.equal(ENDFIELD_FEED, 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_wSsatRjjuF1xPlN9mtAPw');
});

test('the touch-screen pop-up shows until the reader ticks Don\'t show again, and never on a desktop', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) };
  assert.equal(shouldShowEndfieldNotice(storage, false), false, 'a desktop plays on in the background');
  assert.equal(shouldShowEndfieldNotice(storage, true), true);
  setEndfieldNoticeDismissed(storage, true);
  assert.equal(store.get(ENDFIELD_NOTICE_KEY), 'true');
  assert.equal(shouldShowEndfieldNotice(storage, true), false);
  setEndfieldNoticeDismissed(storage, false);
  assert.equal(shouldShowEndfieldNotice(storage, true), true, 'unticked, it shows again');
  // Storage that refuses: the warning shows, and remembering fails quietly.
  const refusing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => { throw new Error('SecurityError'); } };
  assert.equal(shouldShowEndfieldNotice(refusing, true), true);
  assert.doesNotThrow(() => setEndfieldNoticeDismissed(refusing, true));
});

// "endfield" finds the game's music: the site search by its names (lib/search/siteSearchIndex.ts),
// the music pages' boxes by an extra field (lib/music/songFilter.ts gameSearchNames).
const SEARCH_SOURCES: SiteSearchSources = {
  pages: [], operators: [], operatorAliases: {}, events: [{ name: 'Some Arknights Event' }], contents: [], stages: [], enemies: [], creators: [], people: [],
  albums: [
    { albumId: '4527', albumName: '明日方舟OST1', albumAltName: 'Arknights OST 1' },
    { albumId: 'endfield-zeroth', albumName: 'Zeroth Directive Original Soundtrack, Vol. 1', game: 'endfield' },
    { albumId: 'endfield-yi', albumName: 'Yi', game: 'endfield' },
  ],
  songs: [
    { title: 'Synthetech', artist: 'BaoUner' },
    { title: 'Protocol Flow', artist: 'Hybrid', game: 'endfield' },
    // An Arknights song whose own title holds the word: it ranks on its title.
    { title: 'Endfield Horizon', artist: 'Someone' },
  ],
};

test('site search: "endfield" finds Endfield music first, its albums before its songs, and a title with the word on its title', () => {
  const entries = buildSiteSearchEntries(SEARCH_SOURCES);
  const ranked = searchSite(entries, 'endfield').map((r) => `${r.entry.kind}:${r.entry.title}${r.onTitle ? ' (title)' : ''}`);
  assert.deepEqual(ranked, [
    'page:Endfield music (title)',
    'song:Endfield Horizon (title)',
    'album:Yi',
    'album:Zeroth Directive Original Soundtrack, Vol. 1',
    'song:Protocol Flow',
  ]);
  assert.equal(entries.find((e) => e.title === 'Endfield music')!.href, '/music/discover?q=endfield');
  // Enter on /search?s=endfield opens Discover's search for it, the one row named so on its title.
  assert.equal(siteSearchJump(searchSite(entries, 'endfield'))?.title, 'Endfield music');
  // "arknights endfield" too, and Arknights' own music is not among them.
  const both = searchSite(entries, 'arknights endfield').map((r) => r.entry.title);
  assert.deepEqual(both.slice(0, 4), ['Endfield music', 'Yi', 'Zeroth Directive Original Soundtrack, Vol. 1', 'Protocol Flow']);
  assert.ok(!both.includes('Arknights OST 1') && !both.includes('Synthetech'));
  // No Endfield record, no Endfield music row.
  assert.ok(!buildSiteSearchEntries({ ...SEARCH_SOURCES, albums: SEARCH_SOURCES.albums.slice(0, 1) }).some((e) => e.title === 'Endfield music'));
});

test('the music boxes: "endfield" matches the game, under a title that holds the word', () => {
  const songs = [
    { title: 'Synthetech', album: 'Arknights OST 1' },
    { title: 'Protocol Flow', album: 'Zeroth Directive Original Soundtrack, Vol. 1', game: 'endfield' },
    { title: 'Endfield Horizon', album: 'Some EP' },
  ];
  const index = createSongIndex(songs, (song) => ({ ...song, extra: gameSearchNames(song.game) }));
  assert.deepEqual(index.search('endfield').map((s) => s.title), ['Endfield Horizon', 'Protocol Flow']);
  assert.deepEqual(index.search('arknights endfield').map((s) => s.title), ['Protocol Flow']);
  assert.deepEqual(gameSearchNames(undefined), []);
});
