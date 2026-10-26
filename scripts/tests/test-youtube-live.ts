import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrichWithLiveStatus, type YouTubeVideo } from '../../lib/music/youtube';

test('YouTube live enrichment sends credentials in a header, never the URL or returned data', async () => {
  const original = globalThis.fetch;
  const videos: YouTubeVideo[] = Array.from({length:51}, (_, i) => ({videoId:`video-${i}`,title:'Video',channelLabel:'Channel',publishedAt:'2026-10-25',thumbnail:'',url:'',isLivestream:false,liveStatus:'none'}));
  const sizes: number[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.has('key'), false);
    assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'), 'private-test-key');
    const ids = url.searchParams.get('id')!.split(','); sizes.push(ids.length);
    return Response.json({items:ids.map(id => ({id,snippet:{liveBroadcastContent:'live'},liveStreamingDetails:{}}))});
  };
  try {
    const enriched = await enrichWithLiveStatus(videos, 'private-test-key');
    assert.deepEqual(sizes, [50,1]);
    assert.ok(enriched.every(video => video.liveStatus === 'live' && video.isLivestream));
    assert.equal(JSON.stringify(enriched).includes('private-test-key'), false);
  } finally { globalThis.fetch = original; }
});
