import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { matchUploads, normalizeTitle, parseFeed } from '../lib/youtube-uploads.mjs';

// The Monster Siren import that fills these videoIds in lives in arkpedia-data's importer
// (its scripts/sync/sync-albums.mjs, whose own test lives beside it); the app runs the same
// matching for the guide and official video syncs.

/** A channel feed in YouTube's own shape, newest first. */
const feed = (uploads: [string, string][]) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>塞壬唱片-MSR</title>
${uploads.map(([videoId, title]) => ` <entry>
  <id>yt:video:${videoId}</id>
  <yt:videoId>${videoId}</yt:videoId>
  <yt:channelId>UCzow4LPT9IunlkFdt4Y0-FQ</yt:channelId>
  <title>${title}</title>
  <published>2026-09-28T16:00:00+00:00</published>
 </entry>`).join('\n')}
</feed>`;
type Song = { songId: string; songName: string; videoId: string; albumName: string; albumAltName?: string; albumSize: number };
const song = (songId: string, songName: string, extra: Partial<Song> = {}): Song => ({ songId, songName, videoId: '', albumName: 'Some OST', albumSize: 5, ...extra });

test('an upload title is matched the way the distributor writes it: Traditional Chinese, ASCII punctuation, its own case and "Instrumental Version"', () => {
  assert.equal(normalizeTitle('水槍生死鬥'), normalizeTitle('水枪生死斗'));
  assert.equal(normalizeTitle('毛茸茸大決戰!'), normalizeTitle('毛茸茸大决战！'));
  assert.equal(normalizeTitle('Every Road Is a Yes (Instrumental Version)'), normalizeTitle('Every Road is a Yes (Instrumental)'));
  assert.equal(normalizeTitle('Yanking（Instrumental）'), normalizeTitle('Yanking (Instrumental)'));
  assert.notEqual(normalizeTitle('Summer Calling (Instrumental Version)'), normalizeTitle('Summer Calling'));
  assert.deepEqual(parseFeed(feed([['aaaaaaaaaaa', 'Rock &amp; Roll &#39;Night&#x27;']])), [{ videoId: 'aaaaaaaaaaa', title: "Rock & Roll 'Night'" }]);
});

test('a match is unique both ways, and a video already in the catalogue is never given to another song', () => {
  const uploads = [{ videoId: 'vvvvvvvvvv1', title: '連煩惱也融入天空' }];
  const wanted = new Set(['1']);
  assert.deepEqual(matchUploads({ songs: [song('1', '连烦恼也融入天空')], wanted, uploads }).map((m: { videoId: string }) => m.videoId), ['vvvvvvvvvv1']);
  // Two uploads that could be the song: neither.
  assert.deepEqual(matchUploads({ songs: [song('1', '连烦恼也融入天空')], wanted, uploads: [...uploads, { videoId: 'vvvvvvvvvv2', title: '連煩惱也融入天空' }] }), []);
  // Another song in the catalogue has the same name (an older track, already on YouTube): the upload could be either.
  assert.deepEqual(matchUploads({ songs: [song('1', '连烦恼也融入天空'), song('2', '連煩惱也融入天空', { videoId: 'oldoldold01' })], wanted, uploads }), []);
  // The upload is already another song's.
  assert.deepEqual(matchUploads({ songs: [song('1', '连烦恼也融入天空'), song('2', 'Other', { videoId: 'vvvvvvvvvv1' })], wanted, uploads }), []);
  // Only the wanted songs take a videoId.
  assert.deepEqual(matchUploads({ songs: [song('1', '连烦恼也融入天空')], wanted: new Set(), uploads }), []);
});

test('the "<album>: <song> (Original Soundtrack)" form matches only the one song of a single-track album of that name', () => {
  const uploads = [{ videoId: 'chBNJdaKaPA', title: '月行水上: 凡常恩典 (Original Soundtrack)' }];
  const wanted = new Set(['1']);
  assert.equal(matchUploads({ songs: [song('1', '凡常恩典', { albumName: '月行水上', albumSize: 1 })], wanted, uploads }).length, 1);
  // Its album's OST suffix is not part of the name the upload uses.
  assert.equal(matchUploads({ songs: [song('1', 'Rondo in the Clouds', { albumName: '逐影集趣ost', albumSize: 1 })], wanted,
    uploads: [{ videoId: 'rrrrrrrrrrr', title: '逐影集趣: Rondo in the Clouds (Original Soundtrack)' }] }).length, 1);
  assert.deepEqual(matchUploads({ songs: [song('1', '凡常恩典', { albumName: '别的专辑', albumSize: 1 })], wanted, uploads }), [], 'another album');
  assert.deepEqual(matchUploads({ songs: [song('1', '凡常恩典', { albumName: '月行水上', albumSize: 2 })], wanted, uploads }), [], 'an album of two');
});

