import test from 'node:test';
import assert from 'node:assert/strict';
import albums from '../../data/albums.json';
import type { RawAlbum } from '../../lib/music/albumsData';
import { discoverPageData, discoverForDisplay } from '../../lib/music/albumsDataServer';
import { artistFacets, artistKey, creditedArtists, creditsArtist } from '../../lib/music/artistCredits';

/*
 * Discover's Featured artists listed each song's artist credit as it stood: "Erik Castro, David
 * Lin, Obadiah Brown-Beach (Acoustic Ver.)" as one artist, BaoUner beside Bao.Uner, Hendric
 * beside Hendrick Buenck, "Uncredited" and the label as artists, in no useful order
 * (maintainer, 2026-10-14). The credits below are the catalogue's own.
 */

test('a combined credit is each of its artists', () => {
  const cases: [string, string[]][] = [
    ['Erik Castro, David Lin, Obadiah Brown-Beach (Acoustic Ver.)', ['Erik Castro', 'David Lin', 'Obadiah Brown-Beach']],
    ['Obadiah Brown-Beach and Elvin Shen', ['Obadiah Brown-Beach', 'Elvin Shen']],
    ['Sterling Maffe and Matthew Carl Earl', ['Sterling Maffe', 'Matthew Carl Earl']],
    ['Matthew Carl Earl, Sterling Maffe', ['Matthew Carl Earl', 'Sterling Maffe']],
    ['Lawrence Ku and Damien Banzigou', ['Lawrence Ku', 'Damien Banzigou']],
    ['Steven Grove, cybermiso, DOT96 and tigerlily', ['Steven Grove', 'cybermiso', 'DOT96', 'tigerlily']],
    // An Oxford "and" after the comma is no artist of its own; "+" is part of the name.
    ['星冪Elroy, 一罐鹽, and +Bliss+', ['星冪Elroy', '一罐鹽', '+Bliss+']],
    ['李化禹 and 吳瀟Mia', ['李化禹', '吳瀟Mia']],
    ['BLACK 0 / SKa2or', ['BLACK 0', 'SKa2or']],
    ['WS MUSIC / Luden', ['WS MUSIC', 'Luden']],
    // A full-width parenthesis closes like an ASCII one, and a band's own note is kept.
    ['F.L.O.A.T (白羽） / 张晶', ['F.L.O.A.T (白羽)', '张晶']],
    ['陳珩, 劉伃芳', ['陳珩', '劉伃芳']],
    ['乃工 Milkman@WS Music', ['乃工 Milkman@WS Music']],
  ];
  for (const [credit, artists] of cases) assert.deepEqual(creditedArtists(credit), artists, credit);
});

test('a band whose name holds a separator stays one act', () => {
  assert.deepEqual(creditedArtists('MYTH & ROID'), ['MYTH & ROID']);
  assert.deepEqual(creditedArtists('Yuki Hayashi, MYTH & ROID'), ['MYTH & ROID', 'Yuki Hayashi']);
});

test('two spellings of one artist are one artist', () => {
  assert.deepEqual(creditedArtists('Bao.Uner'), ['BaoUner']);
  assert.deepEqual(creditedArtists('BaoUner'), ['BaoUner']);
  assert.deepEqual(creditedArtists('Hendric Buenck'), ['Hendrick Buenck']);
  assert.deepEqual(creditedArtists('Jonathan Gabriel Zuniga, Argin Hovsepian'), ['Jonathan Zuniga', 'Argin Hovsepian']);
  assert.deepEqual(creditedArtists('AJURIKA (Akitaka Toyama)'), ['Akitaka Toyama']);
  assert.deepEqual(creditedArtists('原田萌喜'), ['Moeki Harada']);
  assert.deepEqual(creditedArtists('柳川和樹'), ['Kazuki Yanagawa']);
  assert.equal(artistKey('BLACK 0'), artistKey('Black 0'));
  // The same artist twice in one credit counts once.
  assert.deepEqual(creditedArtists('BaoUner, Bao.Uner'), ['BaoUner']);
});

test('the placeholder and the label are no artist', () => {
  for (const credit of ['Uncredited', 'Monster Siren Records', '塞壬唱片-MSR', '', null, undefined]) assert.deepEqual(creditedArtists(credit), [], String(credit));
  assert.deepEqual(creditedArtists('Monster Siren Records, Erik Castro'), ['Erik Castro']);
});

test('the list counts a song once for each of its artists, most songs first, then by name', () => {
  const facets = artistFacets([
    { artist: 'Bao.Uner' }, { artist: 'BaoUner' }, { artist: 'Sterling Maffe and Matthew Carl Earl' },
    { artist: 'Matthew Carl Earl, Sterling Maffe' }, { artist: 'Matthew Carl Earl' }, { artist: 'Uncredited' }, { artist: null },
    { artist: 'Adam Gubman' }, { artist: 'adam gubman' },
  ]);
  assert.deepEqual(facets, [
    { name: 'Matthew Carl Earl', count: 3 },
    { name: 'Adam Gubman', count: 2 },
    { name: 'BaoUner', count: 2 },
    { name: 'Sterling Maffe', count: 2 },
  ]);
});

test('picking an artist finds every song that credits them, alone or with others', () => {
  assert.ok(creditsArtist('Obadiah Brown-Beach, Matthew Carl Earl, BREAKLESS', 'Matthew Carl Earl'));
  assert.ok(creditsArtist('Bao.Uner', 'BaoUner'));
  assert.ok(!creditsArtist('Erik Castro, David Lin', 'David Westbom'));
  assert.ok(!creditsArtist(null, 'BaoUner'));
  // A link shared before the split still finds its own songs.
  assert.ok(creditsArtist('Lawrence Ku and Damien Banzigou', 'Lawrence Ku and Damien Banzigou'));
});

test('the catalogue\'s Featured artists: one entry per artist, no combinations, duplicates or non-artists, ordered', () => {
  const { songs, artists } = discoverPageData(albums as RawAlbum[]);
  assert.ok(artists.length > 50, 'the catalogue credits many artists');
  const keys = artists.map((a) => artistKey(a.name));
  assert.equal(new Set(keys).size, keys.length, 'no artist twice under two spellings');
  for (const { name } of artists) {
    assert.doesNotMatch(name, /, | and | \/ |、|\((?:[^)]*\b(?:ver|version)\b)/i, `${name} is one artist`);
    assert.ok(!['uncredited', 'monstersirenrecords', '塞壬唱片msr'].includes(artistKey(name)), `${name} is an artist`);
  }
  for (let i = 1; i < artists.length; i++) {
    const [a, b] = [artists[i - 1], artists[i]];
    assert.ok(a.count > b.count || (a.count === b.count && a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) <= 0), `${a.name} before ${b.name}`);
  }
  // Each count is the songs the artist filter then lists.
  for (const { name, count } of artists) assert.equal(songs.filter((s) => creditsArtist(s.artist, name)).length, count, name);
});

test('the deploy fixes the artists of a release compiled before the split', () => {
  const data = discoverPageData(albums as RawAlbum[]);
  const old = { ...data, artists: [{ name: 'Sterling Maffe and Matthew Carl Earl', count: 1 }] };
  assert.deepEqual(discoverForDisplay(old).artists, data.artists);
});
