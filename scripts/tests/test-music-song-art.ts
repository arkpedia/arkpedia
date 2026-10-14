import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monsterSirenImage, monsterSirenSongArt } from '../../lib/music/monsterSirenArt';
import { MSR_LABEL, artistLine, imageType, sessionArtwork, youtubeThumbnail } from '../../lib/music/songArt';

/*
 * The lock screen's artwork and the player's fallback art (lib/music/songArt.ts), and what
 * pages/api/music-art passes on from Monster Siren (lib/music/monsterSirenArt.ts). The browser
 * side is music-player-polish.spec.ts.
 */

const ICON = 'https://raw.githubusercontent.com/arkpedia/arkpedia-image-assets/0000000000000000000000000000000000000000/essential-icons/Arkpedia.webp';
const BASE = 'https://www.arkpedia.net/music';

test('the artwork list is never empty, leads with Monster Siren\'s JPEG and gives every entry its size and type', () => {
  assert.deepEqual(sessionArtwork({ icon: ICON, base: BASE }), [{ src: ICON, sizes: '256x256', type: 'image/webp' }]);
  const all = sessionArtwork({
    msrCover: 'https://web.hycdn.cn/siren/pic/20261010/abc.jpg',
    cover: 'https://raw.githubusercontent.com/arkpedia/arkpedia-image-assets/0000000000000000000000000000000000000000/album-covers/%E6%98%A8%E6%97%A5%E6%B5%B7OST_cover.webp',
    youtube: youtubeThumbnail('abcdefghijk'),
    icon: ICON,
    base: BASE,
  });
  assert.deepEqual(all.map(entry => entry.type), ['image/jpeg', 'image/webp', 'image/jpeg', 'image/webp']);
  assert.deepEqual(all.map(entry => entry.sizes), ['500x500', '500x500', '480x360', '256x256']);
  assert.equal(all[2].src, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
  for (const entry of all) assert.match(entry.src, /^https:\/\/[\x21-\x7e]+$/);
});

test('an address is made absolute and a Chinese file name percent-encoded, once', () => {
  const [cover] = sessionArtwork({ cover: '/album-covers/昨日海OST_cover.webp', icon: ICON, base: BASE });
  assert.equal(cover.src, `https://www.arkpedia.net/album-covers/${encodeURIComponent('昨日海OST_cover.webp')}`);
  const [again] = sessionArtwork({ cover: cover.src, icon: ICON, base: BASE });
  assert.equal(again.src, cover.src, 'an encoded address is not encoded twice');
  // The same address twice is listed once.
  assert.equal(sessionArtwork({ cover: ICON, icon: ICON, base: BASE }).length, 1);
});

test('the image type follows the extension; a Monster Siren id has no YouTube thumbnail', () => {
  assert.equal(imageType('https://a.example/x.JPG?v=2'), 'image/jpeg');
  assert.equal(imageType('https://a.example/x.png'), 'image/png');
  assert.equal(imageType('https://a.example/x.webp#y'), 'image/webp');
  assert.equal(youtubeThumbnail('msr:306864'), null);
  assert.equal(youtubeThumbnail(''), null);
});

test('the label\'s own credit is said in English, once', () => {
  assert.equal(artistLine(['塞壬唱片-MSR']), MSR_LABEL);
  assert.equal(artistLine(['塞壬唱片-MSR', 'Test Vocalist', 'Monster Siren Records']), `${MSR_LABEL}, Test Vocalist`);
  assert.equal(artistLine([]), null);
  assert.equal(artistLine(undefined), null);
});

type Answer = { ok: boolean; json: () => Promise<unknown> };
const answer = (body: unknown, ok = true): Answer => ({ ok, json: async () => body });
function fetcher(routes: Record<string, Answer | Error>) {
  const asked: string[] = [];
  return {
    asked,
    fetch: async (url: string) => {
      asked.push(url);
      const route = routes[url];
      if (!route) throw new Error(`unexpected ${url}`);
      if (route instanceof Error) throw route;
      return route;
    },
  };
}
const SONG = 'https://monster-siren.hypergryph.com/api/song/306864';
const ALBUM = 'https://monster-siren.hypergryph.com/api/album/8913/data';

test('Monster Siren\'s song and album answers become the cover, artists and album name', async () => {
  const { fetch, asked } = fetcher({
    [SONG]: answer({ code: 0, data: { cid: '306864', albumCid: '8913', artists: ['塞壬唱片-MSR', '  ', 7] } }),
    [ALBUM]: answer({ code: 0, data: { cid: '8913', name: '昨日海OST', coverUrl: 'https://web.hycdn.cn/siren/pic/20261010/ab.jpg' } }),
  });
  assert.deepEqual(await monsterSirenSongArt('306864', fetch), { cover: 'https://web.hycdn.cn/siren/pic/20261010/ab.jpg', artists: ['塞壬唱片-MSR'], albumName: '昨日海OST' });
  assert.deepEqual(asked, [SONG, ALBUM]);
});

test('nothing Monster Siren does not vouch for is passed on', async () => {
  // Another song's answer, or a failed one: refused.
  await assert.rejects(monsterSirenSongArt('306864', fetcher({ [SONG]: answer({ code: 0, data: { cid: '1' } }) }).fetch));
  await assert.rejects(monsterSirenSongArt('306864', fetcher({ [SONG]: answer({ code: 1, data: { cid: '306864' } }) }).fetch));
  await assert.rejects(monsterSirenSongArt('306864', fetcher({ [SONG]: answer({}, false) }).fetch));
  await assert.rejects(monsterSirenSongArt('../1', fetcher({}).fetch));
  // An album id that is not digits is never put in an address; the artists still stand.
  const odd = fetcher({ [SONG]: answer({ code: 0, data: { cid: '306864', albumCid: '../x', artists: ['A'] } }) });
  assert.deepEqual(await monsterSirenSongArt('306864', odd.fetch), { cover: null, artists: ['A'], albumName: null });
  assert.deepEqual(odd.asked, [SONG]);
  // A cover off Monster Siren's hosts, or not https, is dropped; so is another album's answer.
  for (const coverUrl of ['http://web.hycdn.cn/a.jpg', 'https://evil.example/a.jpg', 'https://hycdn.cn.evil.example/a.jpg', 'javascript:alert(1)']) {
    const { fetch } = fetcher({
      [SONG]: answer({ code: 0, data: { cid: '306864', albumCid: '8913', artists: [] } }),
      [ALBUM]: answer({ code: 0, data: { cid: '8913', name: 'X', coverUrl } }),
    });
    assert.equal((await monsterSirenSongArt('306864', fetch)).cover, null, coverUrl);
  }
  const other = fetcher({
    [SONG]: answer({ code: 0, data: { cid: '306864', albumCid: '8913', artists: [] } }),
    [ALBUM]: answer({ code: 0, data: { cid: '1', name: 'X', coverUrl: 'https://web.hycdn.cn/a.jpg' } }),
  });
  assert.deepEqual(await monsterSirenSongArt('306864', other.fetch), { cover: null, artists: [], albumName: null });
  // An album that cannot be read leaves the song's own answer.
  const down = fetcher({ [SONG]: answer({ code: 0, data: { cid: '306864', albumCid: '8913', artists: ['A'] } }), [ALBUM]: new Error('timeout') });
  assert.deepEqual(await monsterSirenSongArt('306864', down.fetch), { cover: null, artists: ['A'], albumName: null });
  assert.equal(monsterSirenImage('https://web.hycdn.cn/a.jpg'), 'https://web.hycdn.cn/a.jpg');
  assert.equal(monsterSirenImage('https://monster-siren.hypergryph.com/a.jpg'), 'https://monster-siren.hypergryph.com/a.jpg');
  assert.equal(monsterSirenImage('https://user:pw@web.hycdn.cn/a.jpg'), null);
});
