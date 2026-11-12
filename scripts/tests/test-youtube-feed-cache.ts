import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChannelFeedReader } from '../../lib/music/youtubeFeedCache';
import type { LinkBucket } from '../../lib/music/audioLinkMemo';

const xml = '<feed><entry><yt:videoId>fixture0001</yt:videoId><title>Arknights guide</title><published>2026-11-05T12:00:00Z</published></entry></feed>';
const channel = 'channel-fixture';

test('temporary errors and empty feeds retain successful uploads, including on a cold isolate', async () => {
  let now = Date.parse('2026-11-06T12:00:00Z');
  let calls = 0;
  let response = () => new Response(xml);
  const fetcher = (async () => { calls++; return response(); }) as typeof fetch;
  const stored = new Map<string, string>();
  const bucket: LinkBucket = { get: async key => stored.has(key) ? { text: async () => stored.get(key)! } : null,
    put: async (key, value) => { stored.set(key, value); } };
  const read = createChannelFeedReader({ fetcher, now: () => now });
  assert.equal((await read(channel, 'Creator', bucket))[0].videoId, 'fixture0001');
  const successfulSnapshot = [...stored.values()][0];
  await read(channel, 'Creator', bucket);
  assert.equal(calls, 1, 'fresh snapshots avoid repeated upstream reads');
  now += 16 * 60000;
  response = () => new Response('not found', { status: 404 });
  assert.equal((await read(channel, 'Creator', bucket))[0].videoId, 'fixture0001');
  const coldRead = createChannelFeedReader({ fetcher, now: () => now });
  assert.equal((await coldRead(channel, 'Renamed creator', bucket))[0].channelLabel, 'Renamed creator');
  response = () => new Response('<feed></feed>');
  assert.equal((await coldRead(channel, 'Creator', bucket)).length, 1);
  assert.equal([...stored.values()][0], successfulSnapshot, 'failures never overwrite the durable copy');
  now += 31 * 86400000;
  assert.deepEqual(await coldRead(channel, 'Creator', bucket), [], 'expired snapshots are not reused indefinitely');
});

test('a failed channel and corrupt storage do not block successful channels', async () => {
  const read = createChannelFeedReader({ fetcher: (async input => String(input).includes('bad')
    ? Promise.reject(new Error('offline')) : new Response(xml)) as typeof fetch });
  const corrupt: LinkBucket = { get: async () => ({ text: async () => 'invalid json' }), put: async () => { throw new Error('storage offline'); } };
  assert.deepEqual(await read('bad', 'Bad', corrupt), []);
  assert.equal((await read('good', 'Good', corrupt)).length, 1);
});
