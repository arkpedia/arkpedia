import assert from 'node:assert/strict';
import test from 'node:test';
import { createSongIndex, normalizeSearch, withinEdits, type SearchableSong } from '../../lib/music/songSearch';

const songs: (SearchableSong & { id: string })[] = [
  { id: 'synth', title: 'Synthetech', altTitle: 'Synthetech', artist: 'BaoUner', album: 'Arknights OST 1', albumOriginal: '明日方舟OST1' },
  { id: 'letter', title: '酸橙色信笺', altTitle: 'Letter in Orange', artist: 'DAZBEE', album: 'Letter in Orange' },
  { id: 'escape', title: '逃亡part2', altTitle: 'Escape part2', artist: 'BaoUner', album: 'Arknights OST 1', albumOriginal: '明日方舟OST1' },
  { id: 'play', title: 'Play Time', artist: 'Someone', album: 'Ambience Synesthesia', extra: ['Sora'] },
  { id: 'playful', title: 'Playful Morning', artist: 'Other', album: 'Café Album' },
  { id: 'orange', title: 'Orange Sky', artist: 'Synthwave Band', album: 'Skies' },
];
const index = createSongIndex(songs, song => song);
const ids = (query: string) => index.search(query).map(song => song.id);

test('text is folded: case, accents, full width and punctuation', () => {
  assert.equal(normalizeSearch('Café — ＯＳＴ・１!'), 'cafe ost 1');
  assert.equal(normalizeSearch('  明日方舟OST1 '), '明日方舟ost1');
  assert.deepEqual(ids('cafe album'), ['playful']);
  assert.deepEqual(ids('ＬＥＴＴＥＲ'), ['letter']);
});

test('edits are bounded: one from four letters, two from eight, none below', () => {
  assert.ok(withinEdits('synthtech', 'synthetech', 1));
  assert.ok(withinEdits('sytnhetech', 'synthetech', 1), 'a swap of neighbours is one edit');
  assert.ok(!withinEdits('abcd', 'wxyz', 1));
  assert.deepEqual(ids('synthtech'), ['synth'], 'one missing letter still finds the title');
  assert.deepEqual(ids('lettr'), ['letter']);
  assert.deepEqual(ids('ost'), ['synth', 'escape'], 'three letters: no typo tolerance, plain substring only');
});

test('every word must match somewhere, in any order, across title, album and artist', () => {
  assert.deepEqual(ids('baouner escape'), ['escape']);
  assert.deepEqual(ids('escape baouner'), ['escape']);
  assert.deepEqual(ids('orange dazbee'), ['letter']);
  assert.deepEqual(ids('escape nobody'), []);
});

test('Chinese and English names both find a song and its album', () => {
  assert.deepEqual(ids('酸橙'), ['letter']);
  assert.deepEqual(ids('Letter in Orange'), ['letter']);
  assert.deepEqual(ids('明日方舟'), ['synth', 'escape'], 'the album\'s own name');
  assert.deepEqual(ids('arknights ost 1'), ['synth', 'escape'], 'the album\'s English name');
  assert.deepEqual(ids('sora'), ['play'], 'extras (characters, story) are searched last');
});

test('ranking: exact title, then title prefix, then title words, then album, then artist, then typos', () => {
  assert.deepEqual(ids('play time'), ['play'], 'an exact title');
  assert.deepEqual(ids('play'), ['play', 'playful'], 'prefixes keep the list order between them');
  assert.deepEqual(ids('orange'), ['orange', 'letter'], 'a title starting with the word beats one containing it');
  assert.deepEqual(ids('synth'), ['synth', 'orange'], 'a title beats an artist');
  assert.deepEqual(ids('skies'), ['orange'], 'album only');
  const typoVsAlbum = createSongIndex([
    { id: 'typo', title: 'Sinthetech' },
    { id: 'album', title: 'Other', album: 'Synthetech Hits' },
  ], song => song);
  assert.deepEqual(typoVsAlbum.search('synthetech').map(song => song.id), ['album', 'typo'], 'an album hit beats a title typo');
});

test('an empty query keeps every song in order, and matches() filters without reordering', () => {
  assert.deepEqual(ids('  '), songs.map(song => song.id));
  const matches = index.matches('orange');
  assert.deepEqual(songs.filter(matches).map(song => song.id), ['letter', 'orange'], 'the queue keeps its play order');
});

test('fast enough to run on every keystroke over the whole catalogue', () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ title: `Song number ${i} ${i % 7 ? 'blue' : 'red'} sky`, album: `Album ${i % 40}`, artist: `Artist ${i % 90}` }));
  const big = createSongIndex(many, song => song);
  const started = performance.now();
  for (const query of ['s', 'so', 'son', 'song', 'songg', 'song nu', 'song numbr 42']) big.search(query);
  assert.ok(performance.now() - started < 400, `${Math.round(performance.now() - started)}ms for 7 keystrokes over 1,000 songs`);
});
