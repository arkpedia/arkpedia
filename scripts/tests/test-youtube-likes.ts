import test from 'node:test';
import assert from 'node:assert/strict';
import { byYouTubeLikes, mostLikedSongs, validYouTubeLikes, YOUTUBE_LIKES_MAX_AGE } from '../../lib/music/youtubeLikes';
import { createYouTubeLikesLoader } from '../../lib/music/youtubeLikesServer';

const START = Date.parse('2026-10-15T00:00:00Z');
const id = (n: number) => String(n).padStart(11, '0');
const reply = (items: unknown[]) => new Response(JSON.stringify({ items }), { status: 200 });
const item = (n: number, count?: string) => ({ id: id(n), statistics: count === undefined ? {} : { likeCount: count } });

test('likes order preserves ties and input, puts missing counts after zero, and deduplicates the chart', () => {
  const songs = [{ videoId: id(1) }, { videoId: id(2) }, { videoId: id(3) }, { videoId: id(4) }, { videoId: id(2) }];
  const counts = { [id(1)]: 0, [id(2)]: 15, [id(3)]: 15 };
  assert.deepEqual(byYouTubeLikes(songs, counts, s => s.videoId).map(s => s.videoId), [id(2), id(3), id(2), id(1), id(4)]);
  assert.deepEqual(mostLikedSongs(songs, counts).map(s => s.videoId), [id(2), id(3), id(1)]);
  assert.equal(songs[0].videoId, id(1));
});

test('client rejects malformed, expired and future data while accepting a real zero', () => {
  const data = { updatedAt: new Date(START).toISOString(), likes: { [id(1)]: 0 } };
  assert.equal(validYouTubeLikes(data, START), true);
  assert.equal(validYouTubeLikes(data, START + YOUTUBE_LIKES_MAX_AGE), false);
  assert.equal(validYouTubeLikes(data, START - 1), false);
  for (const likes of [[], null, { bad: 1 }, { [id(1)]: -1 }, { [id(1)]: '10' }, { [id(1)]: 1.5 }]) {
    assert.equal(validYouTubeLikes({ ...data, likes }, START), false);
  }
});

test('batches unique catalogue IDs, keeps the key out of URLs, and coalesces concurrent loads', async () => {
  const requests: URL[] = [];
  const load = createYouTubeLikesLoader({
    videoIds: async () => [...Array.from({ length: 103 }, (_, i) => id(i)), id(0), 'msr:123', 'invalid'],
    apiKey: () => 'private-test-key', now: () => START,
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      assert.equal(url.searchParams.has('key'), false);
      assert.equal((init?.headers as Record<string, string>)['X-Goog-Api-Key'], 'private-test-key');
      const ids = url.searchParams.get('id')!.split(',');
      return reply(ids.map(videoId => ({ id: videoId, statistics: { likeCount: '12' } })));
    },
  });
  const results = await Promise.all([load(), load(), load()]);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(url => url.searchParams.get('id')!.split(',').length), [50, 50, 3]);
  assert.equal(Object.keys(results[0].likes).length, 103);
  assert.equal(results[0], results[1]);
  assert.equal(JSON.stringify(results).includes('private-test-key'), false);
});

test('unavailable, hidden, unexpected and invalid counts stay unknown, not zero', async () => {
  const load = createYouTubeLikesLoader({
    videoIds: async () => [1, 2, 3, 4, 5].map(id), apiKey: () => 'key', now: () => START,
    fetcher: async () => reply([item(1, '0'), item(2), item(3, '-1'), item(4, '9007199254740992'), item(99, '100')]),
  });
  assert.deepEqual((await load()).likes, { [id(1)]: 0 });
});

test('daily refresh replaces deleted videos; failures keep the last whole snapshot and retry after five minutes', async () => {
  let time = START;
  let fail = false;
  let calls = 0;
  const load = createYouTubeLikesLoader({
    videoIds: async () => [id(1), id(2)], apiKey: () => 'key', now: () => time,
    fetcher: async () => { calls++; return fail ? new Response('', { status: 403 }) : reply(calls === 1 ? [item(1, '10'), item(2, '20')] : [item(2, '30')]); },
  });
  const first = await load();
  time += 23 * 60 * 60 * 1000;
  assert.equal(await load(), first);
  assert.equal(calls, 1);
  time += 60 * 60 * 1000;
  fail = true;
  assert.equal(await load(), first);
  assert.equal(await load(), first);
  assert.equal(calls, 2);
  time += 5 * 60 * 1000;
  fail = false;
  const next = await load();
  assert.deepEqual(next.likes, { [id(2)]: 30 });
  assert.notEqual(next.updatedAt, first.updatedAt);
  time += YOUTUBE_LIKES_MAX_AGE;
  fail = true;
  await assert.rejects(load(), /unavailable/);
});

test('a failed batch never publishes partial results, and failures are throttled and redacted', async () => {
  let calls = 0;
  const load = createYouTubeLikesLoader({
    videoIds: async () => Array.from({ length: 51 }, (_, i) => id(i)), apiKey: () => 'private-test-key', now: () => START,
    fetcher: async () => { if (++calls === 2) throw new Error('sensitive upstream failure: private-test-key'); return reply([item(0, '50')]); },
  });
  await assert.rejects(load(), { message: 'YouTube likes are unavailable' });
  await assert.rejects(load(), { message: 'YouTube likes are unavailable' });
  assert.equal(calls, 2);
});

test('a missing key uses no quota and does not load the catalogue', async () => {
  const load = createYouTubeLikesLoader({
    videoIds: async () => { throw new Error('Should not run'); }, apiKey: () => undefined,
    fetcher: async () => { throw new Error('Should not run'); }, now: () => START,
  });
  await assert.rejects(load(), { message: 'YouTube likes are unavailable' });
});
