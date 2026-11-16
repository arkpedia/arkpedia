import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { classifyVideoThumbnail, downloadTopicThumbnail, thumbnailDimensions, thumbnailTopicRequest, THUMBNAIL_MAX_BYTES } from '../sync/jev-thumbnail-classifier';
import { videoTopicRequest } from '../sync/jev-video-classifier';
import { VIDEO_TOPICS } from '../../lib/music/youtubeDiscovery';
import type { YouTubeVideo } from '../../lib/music/youtube';

const video: YouTubeVideo = { videoId: 'abcdefghijk', title: 'An Arknights showcase', channelLabel: 'Public creator', description: 'Public description',
  publishedAt: '', thumbnail: '', url: '', isLivestream: false, liveStatus: 'none' };
// SOF-only header fixtures exercise bounds; a mocked transport never uploads them.
const jpeg = (width = 480, height = 360) => new Uint8Array([255,216,255,192,0,8,8,height >> 8,height & 255,width >> 8,width & 255,1,255,217]);
const thumbnail = () => { const bytes = jpeg(); return { bytes, width: 480, height: 360, sha256: createHash('sha256').update(bytes).digest('hex'), url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' }; };
const answer = (probability = 1) => ({ model: 'jev-test', answers: { topic: { type: 'choice', choice: 'operators', confidence: .9,
  probabilities: Object.fromEntries(VIDEO_TOPICS.map(({value}) => [value, value === 'operators' ? probability : (1 - probability) / 8])) } } });

test('image state uses one reference and preserves the production taxonomy/public metadata', () => {
  const metadata = videoTopicRequest(video), request = thumbnailTopicRequest(metadata, 'unique-reference');
  assert.deepEqual(request.state.video, metadata.state.video);
  assert.deepEqual(request.questions.topic.criteria, metadata.questions.topic.criteria);
  assert.equal(request.state.thumbnail, 'unique-reference');
  assert.deepEqual(request.assets, { 'unique-reference': { type: 'image', part: 'thumbnail' } });
  assert.equal(JSON.stringify(request).split('unique-reference').length - 1, 2, 'one asset key plus one use in state');
});

test('experimental transport sends documented multipart/header and keeps response thresholds', async () => {
  let captured: unknown;
  const result = await classifyVideoThumbnail(video, thumbnail(), { apiKey: 'test-only', now: 0,
    observeRequest: request => { captured = request; }, fetcher: async (url, init) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer test-only');
      assert.equal(headers.get('TypeSafe-Danger-Zone-Images'), 'true');
      assert.equal(headers.has('Content-Type'), false, 'fetch supplies the multipart boundary');
      assert.ok(init?.body instanceof FormData);
      assert.deepEqual([...init.body.keys()], ['request', 'thumbnail']);
      const request = init.body.get('request') as Blob, image = init.body.get('thumbnail') as Blob;
      assert.equal(request.type, 'application/json');
      assert.deepEqual(JSON.parse(await request.text()), captured);
      assert.equal(image.type, 'image/jpeg');
      assert.deepEqual(new Uint8Array(await image.arrayBuffer()), jpeg());
      return new Response(JSON.stringify(answer(.76)));
    } });
  assert.equal(result.topic, null, 'images do not lower the production acceptance threshold');
  assert.equal(result.model, 'jev-test');
  await assert.rejects(classifyVideoThumbnail(video, thumbnail(), { apiKey: 'test', fetcher: async () => new Response('{}') }), /invalid topic answer/);
  await assert.rejects(classifyVideoThumbnail(video, { ...thumbnail(), sha256: 'changed' }, { apiKey: 'test', fetcher: async () => { throw Error('must not send'); } }), /metadata does not match/);
});

test('thumbnail fetch is restricted to canonical public IDs, bounded bytes and JPEG dimensions', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'); assert.equal(init?.redirect, 'error');
    return new Response(jpeg(), { headers: { 'Content-Type': 'image/jpeg' } });
  };
  const loaded = await downloadTopicThumbnail(video.videoId, fetcher);
  assert.deepEqual({ ...loaded, bytes: [...loaded.bytes] }, { ...thumbnail(), bytes: [...jpeg()] });
  await assert.rejects(downloadTopicThumbnail('https://other.invalid/private', fetcher), /YouTube video ID/);
  await assert.rejects(downloadTopicThumbnail('abcdefghijk\n', fetcher), /YouTube video ID/);
  assert.equal(calls, 1);
  await assert.rejects(downloadTopicThumbnail(video.videoId, async () => new Response(jpeg(), {headers:{'Content-Type':'text/html'}})), /unavailable/);
  await assert.rejects(downloadTopicThumbnail(video.videoId, async () => new Response(new Uint8Array(THUMBNAIL_MAX_BYTES + 1), {headers:{'Content-Type':'image/jpeg'}})), /byte limit/);
  for (const bytes of [jpeg(279,360), jpeg(480,180), jpeg(1569,360), new Uint8Array([255,216]), new Uint8Array([1,2,3])]) {
    assert.throws(() => thumbnailDimensions(bytes));
  }
});
