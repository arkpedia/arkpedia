import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monsterSirenOnlySongsFromAlbums, songsFromAlbums, type RawAlbum } from '../../lib/music/albumsData';
import { parseMusicResume, restoreQueue, type MusicResumeState } from '../../lib/music/musicResume';
import { addSongToPlaylists, formatPlaylistFile, parsePlaylistFile, readPlaylists } from '../../lib/music/musicPlaylists';
import { createTrackEngine, PLAYER_STATE, type PlaybackEngine, type VideoArg } from '../../lib/music/playbackEngine';
import { isStoredTrackId, lyricsPath, msrTrackId, trackSource, youtubeWatchUrl } from '../../lib/music/trackId';

/*
 * A song with no YouTube upload plays Monster Siren's own audio (lib/music/trackId.ts,
 * lib/music/playbackEngine.ts). It is named msr:<cid> wherever the player stores a song, and every
 * song on YouTube keeps its bare video id, so favourites, playlists and queues saved before stay
 * as they are. The browser half is tests/browser/music-msr-playback.spec.ts.
 */

test('a track id says which engine plays it, and only a YouTube song has a YouTube page', () => {
  assert.deepEqual(trackSource('ZCiLqOcjA0Y'), { kind: 'youtube', videoId: 'ZCiLqOcjA0Y' });
  assert.deepEqual(trackSource(msrTrackId('697616')), { kind: 'msr', cid: '697616' });
  for (const bad of ['', 'msr:', 'msr:12a', 'msr:../x']) assert.equal(trackSource(bad), null, bad);
  assert.equal(youtubeWatchUrl('ZCiLqOcjA0Y'), 'https://www.youtube.com/watch?v=ZCiLqOcjA0Y');
  assert.equal(youtubeWatchUrl('msr:697616'), null);
  assert.equal(youtubeWatchUrl(''), null);
  // Lyric files are plain filenames: no colon reaches the release or a checkout.
  assert.equal(lyricsPath('ZCiLqOcjA0Y'), '/lyrics/ZCiLqOcjA0Y.json');
  assert.equal(lyricsPath('msr:697616'), '/lyrics/msr-697616.json');
  assert.ok(isStoredTrackId('ZCiLqOcjA0Y') && isStoredTrackId('msr:697616'));
  assert.ok(!isStoredTrackId('msr:x') && !isStoredTrackId('short') && !isStoredTrackId(5));
});

test('the albums give the player every song: on YouTube by video id, the rest by Monster Siren id', () => {
  const albums: RawAlbum[] = [{ albumId: '5107', albumName: 'Yanking', coverFilename: 'Yanking_cover.webp', songs: [
    { songId: '697615', songName: 'Yanking', albumId: '5107', videoId: 'aaaaaaaaaaa', lyricFilename: 'Yanking_lyrics.lrc' },
    { songId: '697616', songName: 'Yanking (Instrumental)', albumId: '5107', videoId: '' },
    { songId: 'not-a-cid', songName: 'Broken', albumId: '5107', videoId: '' },
  ] }];
  assert.deepEqual(songsFromAlbums(albums).map(song => [song.trackId, song.videoId, song.songId]), [['aaaaaaaaaaa', 'aaaaaaaaaaa', '697615']]);
  const msr = monsterSirenOnlySongsFromAlbums(albums);
  assert.deepEqual(msr.map(song => [song.trackId, song.videoId, song.songId, song.coverPath]), [['msr:697616', '', '697616', '/album-covers/Yanking_cover.webp']]);
  // An instrumental still borrows its vocal take's lyrics, as a YouTube one does.
  assert.equal(msr[0].lyricFilename, 'Yanking_lyrics.lrc');
});

test('a reload carries a Monster Siren song, and a queue holding one, like any other', () => {
  const record: MusicResumeState = {
    version: 1, savedAt: 1, left: true, videoId: 'msr:697616', title: '', seconds: 42, duration: 236, playing: true,
    queue: ['aaaaaaaaaaa', 'msr:697616'], queueIndex: 1, shuffle: false, shuffleOrder: null, shufflePosition: 0, repeat: 'off', volume: 50,
    queued: ['msr:697616'], autoplayOrder: ['msr:697616'], autoplayVideoId: 'msr:697616',
  };
  const parsed = parseMusicResume(JSON.stringify(record));
  assert.deepEqual(parsed, record);
  const restored = restoreQueue([{ id: 'aaaaaaaaaaa' }, { id: 'msr:697616' }], parsed!);
  assert.equal(restored?.queueIndex, 1);
  // Still nothing but a track id reaches the player.
  assert.equal(parseMusicResume(JSON.stringify({ ...record, videoId: 'msr:../x' })), null);
});

test('favourites and playlists keep Monster Siren songs, and a file holding them round-trips', () => {
  const store: Record<string, string> = { musicFavorites: JSON.stringify(['aaaaaaaaaaa', 'msr:697616', 'junk']) };
  const storage = { getItem: (key: string) => store[key] ?? null };
  assert.deepEqual(readPlaylists(storage)[0].tracks, ['aaaaaaaaaaa', 'msr:697616']);
  const lists = addSongToPlaylists([{ id: 'mine', name: 'Mine', tracks: ['aaaaaaaaaaa'] }], ['mine'], 'msr:697616');
  assert.deepEqual(lists[0].tracks, ['aaaaaaaaaaa', 'msr:697616']);
  assert.deepEqual(parsePlaylistFile(formatPlaylistFile(lists)), lists);
  assert.throws(() => addSongToPlaylists(lists, ['mine'], 'msr:nope'), /could not be saved/);
});

function fakeEngine(name: string, log: string[]): PlaybackEngine & { stop(): void } {
  const id = (video: VideoArg) => (typeof video === 'string' ? video : video.videoId);
  let loaded = '';
  return {
    loadVideoById: (video) => { loaded = id(video); log.push(`${name}.load ${loaded}`); },
    cueVideoById: (video) => { loaded = id(video); log.push(`${name}.cue ${loaded}`); },
    playVideo: () => log.push(`${name}.play`),
    pauseVideo: () => log.push(`${name}.pause`),
    seekTo: (seconds) => log.push(`${name}.seek ${seconds}`),
    getCurrentTime: () => (name === 'audio' ? 12 : 34),
    getDuration: () => 100,
    setVolume: (volume) => log.push(`${name}.volume ${volume}`),
    getVideoData: () => ({ video_id: loaded }),
    stop: () => log.push(`${name}.stop`),
  };
}

test('the player\'s engine hands each track to its own engine and stops the other, so two songs never play at once', () => {
  const log: string[] = [];
  const engine = createTrackEngine(fakeEngine('youtube', log), fakeEngine('audio', log));
  assert.equal(engine.active(), 'youtube');
  engine.loadVideoById('aaaaaaaaaaa');
  engine.loadVideoById('msr:697616');
  assert.equal(engine.active(), 'msr');
  engine.seekTo(30, true);
  assert.equal(engine.getCurrentTime(), 12);
  assert.equal(engine.getVideoData().video_id, 'msr:697616');
  engine.loadVideoById('msr:697617');
  engine.cueVideoById({ videoId: 'bbbbbbbbbbb', startSeconds: 5 });
  assert.equal(engine.active(), 'youtube');
  engine.setVolume(40);
  assert.deepEqual(log, [
    'youtube.load aaaaaaaaaaa',
    'youtube.pause', 'audio.load msr:697616',
    'audio.seek 30',
    // A second Monster Siren song: the audio engine changes its file itself.
    'audio.load msr:697617',
    'audio.stop', 'youtube.cue bbbbbbbbbbb',
    'youtube.volume 40', 'audio.volume 40',
  ]);
  assert.deepEqual(PLAYER_STATE, { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 });
});
