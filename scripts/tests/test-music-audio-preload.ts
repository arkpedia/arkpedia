import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAudioPreloader } from '../../lib/music/audioPreload';

const target = (cid: string) => ({ cid, address: `/audio/${cid}` });
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(fetcher?: typeof fetch) {
  const requests: string[] = [], revoked: string[] = [];
  let clock = 1000, urls = 0;
  const cache = createAudioPreloader({ fetch: fetcher ?? (async input => { requests.push(String(input)); return new Response('complete music', { headers: { 'content-type': 'audio/wav' } }); }),
    createURL: () => `blob:test-${++urls}`, revokeURL: url => revoked.push(url), now: () => clock });
  return { cache, requests, revoked, advance: () => { clock += 16 * 60 * 1000; } };
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
