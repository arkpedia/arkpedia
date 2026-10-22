import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAudioPreloader } from '../../lib/music/audioPreload';

const target = (cid: string) => ({ cid, address: `/audio/${cid}` });
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const MINUTE = 60 * 1000;
const START = Date.UTC(2026, 9, 22, 18, 34, 20);
/** A signed CDN address expiring `minutes` from `from`, as the route's redirect names it. */
const signed = (cid: string, minutes: number, from = START) =>
  `https://res01.hycdn.cn/${'0'.repeat(32)}/${Math.floor((from + minutes * MINUTE) / 1000).toString(16).toUpperCase()}/siren/audio/${cid}.wav`;
/** A followed HEAD: headers only, its url the address the redirect reached. */
function reached(url: string, status = 200): Response {
  const response = new Response(null, { status });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
/** `fetcher` answers the file requests (GET); `head` the address requests (HEAD), by default a
 *  route that redirects nowhere (as the browser checks' stub does), so no address is held. */
function fixture(fetcher?: typeof fetch, head: (input: string, init?: RequestInit) => Promise<Response> = async input => reached(input)) {
  const requests: string[] = [], heads: string[] = [], revoked: string[] = [];
  let clock = START, urls = 0;
  const files: typeof fetch = fetcher ?? (async input => { requests.push(String(input)); return new Response('complete music', { headers: { 'content-type': 'audio/wav' } }); });
  const cache = createAudioPreloader({
    fetch: (async (input, init) => {
      if (init?.method !== 'HEAD') return files(input, init);
      heads.push(String(input));
      return head(String(input), init);
    }) as typeof fetch,
    createURL: () => `blob:test-${++urls}`, revokeURL: url => revoked.push(url), now: () => clock });
  return { cache, requests, heads, revoked, advance: (ms = 16 * MINUTE) => { clock += ms; } };
}
test('prepares one full file without playing, reuses it once, and keeps its id until playback releases it', async () => {
  const { cache, requests, revoked } = fixture();
  cache.select(target('1'), false);
  assert.equal(requests.length, 0);
  cache.select(target('1'), true);
  cache.select(target('1'), true);
  await turn();
  assert.deepEqual(requests, ['/audio/1']);
  const ready = cache.take('1', '/audio/1');
  assert.ok(ready);
  assert.equal(cache.cid(ready.url + '#t=5.0'), '1');
  assert.equal(cache.take('1', '/audio/1'), null);
  cache.select(target('2'), true);
  await turn();
  assert.equal(cache.cid(ready.url), '1', 'preparing the next track does not release the playing track');
  ready.release();
  assert.deepEqual(revoked, ['blob:test-1']);
  cache.select(null, false);
  assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);
});
test('queue changes abort stale work; an ignored abort cannot replace the selected track', async () => {
  let respond: (response: Response) => void = () => {};
  let aborted = false;
  const { cache } = fixture(async (_url, init) => new Promise(resolve => {
    respond = resolve;
    init?.signal?.addEventListener('abort', () => { aborted = true; });
  }));
  cache.select(target('1'), true);
  cache.select(target('2'), false);
  assert.equal(aborted, true);
  respond(new Response('late file', { headers: { 'content-type': 'audio/wav' } }));
  await turn();
  assert.equal(cache.take('1', '/audio/1'), null);
  assert.equal(cache.take('2', '/audio/2'), null);
});
test('paused and Data saver/cleared targets stop work, while pausing keeps a complete matching file', async () => {
  const { cache, requests, revoked } = fixture();
  cache.select(target('1'), true); await turn();
  cache.select(target('1'), false);
  assert.equal(requests.length, 1);
  assert.equal(revoked.length, 0);
  cache.select(null, false);
  assert.equal(revoked.length, 1);
  assert.equal(cache.take('1', '/audio/1'), null);
});
test('in-flight, expired and different-route files never delay or replace ordinary playback', async () => {
  const { cache, advance, revoked } = fixture();
  cache.select(target('1'), true);
  assert.equal(cache.take('1', '/audio/1'), null);
  await turn();
  cache.select(target('1'), true); await turn();
  assert.equal(cache.take('1', 'https://relay.invalid/audio/1'), null);
  advance();
  assert.equal(cache.take('1', '/audio/1'), null);
  assert.equal(revoked.length, 1);
});
test('refused, partial, oversized and truncated responses fall back without retry storms or changing the current track', async () => {
  for (const response of [new Response('', { status: 403 }), new Response('partial', { status: 206, headers: { 'content-type': 'audio/wav' } }),
    new Response('large', { headers: { 'content-type': 'audio/wav', 'content-length': String(81 * 1024 * 1024) } }),
    new Response('truncated', { headers: { 'content-type': 'audio/wav', 'content-length': '100' } })]) {
    let calls = 0;
    const { cache } = fixture(async () => { calls++; return response; });
    cache.select(target('1'), true); await turn();
    cache.select(target('1'), true); await turn();
    assert.equal(calls, 1);
    assert.equal(cache.take('1', '/audio/1'), null);
  }
});

test('the upcoming song\'s signed address is asked for once, by HEAD, before its file may load, and played when no file is ready', async () => {
  const { cache, requests, heads, revoked } = fixture(undefined, async input => reached(signed(input.split('/').pop()!, 180)));
  cache.select(target('1'), false);
  cache.select(target('1'), false);
  await turn();
  cache.select(target('1'), false);
  assert.deepEqual(heads, ['/audio/1'], 'one HEAD, even while this song is paused or still loading');
  assert.deepEqual(requests, [], 'no audio is downloaded for it');
  const held = cache.take('1', '/audio/1');
  assert.ok(held);
  assert.equal(held.url, signed('1', 180));
  assert.equal(cache.cid(`${held.url}#t=5.0`), '1', 'the element\'s address is still known as this song');
  assert.equal(cache.take('1', '/audio/1'), null, 'handed out once');
  held.release();
  assert.equal(cache.cid(held.url), null);
  assert.deepEqual(revoked, [], 'an address is not a Blob URL to revoke');
});

test('a complete file is played before the address; an address near its expiry is never handed out', async () => {
  const both = fixture(undefined, async input => reached(signed(input.split('/').pop()!, 180)));
  both.cache.select(target('1'), true); await turn();
  assert.deepEqual(both.heads, ['/audio/1']);
  assert.deepEqual(both.requests, ['/audio/1']);
  assert.equal(both.cache.take('1', '/audio/1')?.url, 'blob:test-1');

  // Kept too long (a player paused two hours): the route is asked as before.
  const late = fixture(undefined, async input => reached(signed(input.split('/').pop()!, 180)));
  late.cache.select(target('1'), false); await turn();
  late.advance(111 * MINUTE);
  assert.equal(late.cache.take('1', '/audio/1'), null);

  // Given with less than the engine's hour left (and a margin): never held.
  const short = fixture(undefined, async input => reached(signed(input.split('/').pop()!, 69)));
  short.cache.select(target('1'), false); await turn();
  short.cache.select(target('1'), false); await turn();
  assert.equal(short.heads.length, 1);
  assert.equal(short.cache.take('1', '/audio/1'), null);

  // A file prepared but too old to use: the address still lasts, so it plays from there.
  const stale = fixture(undefined, async input => reached(signed(input.split('/').pop()!, 180)));
  stale.cache.select(target('1'), true); await turn();
  stale.advance(16 * MINUTE);
  assert.equal(stale.cache.take('1', '/audio/1')?.url, signed('1', 180));
  assert.deepEqual(stale.revoked, ['blob:test-1']);
});

test('a refused, unreachable or unsigned address is asked for once and never handed out', async () => {
  for (const head of [async () => reached(signed('1', 180), 502), async () => { throw new TypeError('offline'); },
    async () => reached('https://evil.example/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/6ADA815C/x.wav'), async (input: string) => reached(input)]) {
    const { cache, heads } = fixture(undefined, head);
    cache.select(target('1'), false); await turn();
    cache.select(target('1'), false); await turn();
    assert.equal(heads.length, 1);
    assert.equal(cache.take('1', '/audio/1'), null);
  }
});

test('changing or clearing the upcoming song aborts its address request, and a late answer is dropped', async () => {
  const answers: ((response: Response) => void)[] = [];
  const aborted: string[] = [];
  const { cache, heads } = fixture(undefined, (input, init) => new Promise(resolve => {
    answers.push(resolve);
    init?.signal?.addEventListener('abort', () => aborted.push(input));
  }));
  cache.select(target('1'), false);
  cache.select(target('2'), false);
  assert.deepEqual(aborted, ['/audio/1']);
  answers[0](reached(signed('1', 180)));
  await turn();
  assert.equal(cache.take('2', '/audio/2'), null, 'the first song\'s address is not the second\'s');
  cache.select(target('3'), false);
  cache.select(null, false);
  assert.deepEqual(aborted, ['/audio/1', '/audio/2', '/audio/3']);
  // Data saver (and no upcoming Monster Siren song) selects nothing: nothing is asked for.
  assert.deepEqual(heads, ['/audio/1', '/audio/2', '/audio/3']);
});
