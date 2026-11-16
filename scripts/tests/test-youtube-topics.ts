import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { classifyVideoTopic, videoTopicRequest, VIDEO_TOPIC_CRITERIA } from '../sync/jev-video-classifier';
import { applyVideoTopicAssignments, TOPIC_POLICY_VERSION } from '../../lib/music/youtubeTopicAssignments';
import { discoveryVideoTopic, videoTopic, VIDEO_TOPICS } from '../../lib/music/youtubeDiscovery';
import { rankDiscoveryVideos, EMPTY_VIDEO_CONTEXT } from '../../lib/music/youtubeRelevance';
import { recordFiles } from '../content/records.mjs';
import type { YouTubeVideo } from '../../lib/music/youtube';
import type { VideoTopic } from '../../lib/music/youtubeDiscovery';

const video: YouTubeVideo = { videoId: 'fixture0001', title: 'Violet Mizutsune Orchid, Zinogre S Catapult, Rhodes Island Recon [Arknights]',
  description: '0:00 Violet Mizutsune Orchid\n1:38 Zinogre S Catapult\n2:37 Rhodes Island Recon', channelLabel: 'Tsalthsu',
  publishedAt: '', thumbnail: '', url: '', liveStatus: 'none', isLivestream: false };
const answer = (topic: VideoTopic = 'operators', probability = 1, confidence = 1) => ({ model: 'jev-test', answers: { topic: {
  type: 'choice', choice: topic, confidence,
  probabilities: Object.fromEntries(VIDEO_TOPICS.map(({ value }) => [value, value === topic ? probability : (1 - probability) / 8])),
} } });
const mockFetch = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status });

test('JEV request uses the closed taxonomy, bounded public metadata, and the documented authenticated endpoint', async () => {
  const long = { ...video, description: 'a'.repeat(3000) };
  const subjects = [{ name: 'Rhodes Island Recon', kind: 'operator' as const }];
  const request = videoTopicRequest(long, subjects);
  assert.equal(request.state.video.description.length, 2000);
  assert.deepEqual(Object.keys(VIDEO_TOPIC_CRITERIA).sort(), VIDEO_TOPICS.map(t => t.value).sort());
  const entry = await classifyVideoTopic(long, { apiKey: 'test-only', subjects, now: 0, fetcher: async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only');
    assert.deepEqual(JSON.parse(init?.body as string), request);
    return new Response(JSON.stringify(answer()));
  } });
  assert.equal(entry.topic, 'operators');
  assert.equal(entry.model, 'jev-test');
  assert.equal(entry.checkedAt, '1970-01-01T00:00:00.000Z');
});

test('accepted classifications reach grouping and survive feed/archive deduplication without changing relevance', async () => {
  const entry = await classifyVideoTopic(video, { apiKey: 'test', fetcher: mockFetch(answer()) });
  const [classified] = applyVideoTopicAssignments([video], { [video.videoId]: entry });
  assert.equal(discoveryVideoTopic(classified), 'operators');
  const merged = rankDiscoveryVideos([video, classified], EMPTY_VIDEO_CONTEXT, Date.now());
  assert.equal(discoveryVideoTopic(merged[0]), 'operators');
  assert.equal(merged.length, 1);
  assert.equal(discoveryVideoTopic({ ...classified, topicHint: 'operators', classifiedTopic: 'media' }), 'operators');
  for (const changed of [{ ...video, title: 'Arknights official trailer' }, { ...video, description: 'New description' }]) {
    const merged = rankDiscoveryVideos([changed, classified], EMPTY_VIDEO_CONTEXT, Date.now());
    assert.equal(merged[0].classifiedTopic, undefined, 'old archive metadata cannot restore a rejected cache entry');
    assert.equal(discoveryVideoTopic(merged[0]), videoTopic(changed.title));
    assert.ok(!Object.hasOwn(merged[0], 'classifiedTopic'), 'server props contain no undefined classification field');
  }
});

test('uncertain answers, missing classifications, metadata edits and policy changes use rules', async () => {
  const entry = await classifyVideoTopic(video, { apiKey: 'test', fetcher: mockFetch(answer()) });
  for (const changed of [{ ...video, title: 'Arknights official trailer' }, { ...video, description: 'changed' }, { ...video, channelLabel: 'changed' }]) {
    const [result] = applyVideoTopicAssignments([changed], { [video.videoId]: entry });
    assert.equal(result.classifiedTopic, undefined);
    assert.equal(discoveryVideoTopic(result), videoTopic(changed.title));
  }
  assert.equal(applyVideoTopicAssignments([video], { [video.videoId]: { ...entry, policyVersion: TOPIC_POLICY_VERSION + 1 } })[0].classifiedTopic, undefined);
  for (const [probability, confidence] of [[0.7, 1], [1, 0.4]]) {
    const uncertain = await classifyVideoTopic(video, { apiKey: 'test', fetcher: mockFetch(answer('operators', probability, confidence)) });
    assert.equal(uncertain.topic, null);
    assert.equal(discoveryVideoTopic(applyVideoTopicAssignments([video], { [video.videoId]: uncertain })[0]), 'other');
  }
  assert.equal(applyVideoTopicAssignments([{ ...video, classifiedTopic: 'skins' }], {})[0].classifiedTopic, undefined);
});

test('provider failures and malformed answers are errors rather than cached categories', async () => {
  await assert.rejects(classifyVideoTopic(video, { apiKey: 'test', fetcher: mockFetch({}, 429) }), /HTTP 429/);
  await assert.rejects(classifyVideoTopic(video, { apiKey: 'test', fetcher: async () => { throw new Error('timeout'); } }), /timeout/);
  for (const body of [{}, { model: 'jev', answers: { topic: { type: 'choice', choice: 'invented', confidence: 1, probabilities: { invented: 1 } } } }, answer('operators', 1, NaN), answer('operators', 1.5)]) {
    await assert.rejects(classifyVideoTopic(video, { apiKey: 'test', fetcher: mockFetch(body) }), /invalid topic answer/);
  }
});

test('the content workflow classifies with the secret, preserves cache, and publishes categories as content records', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  assert.match(workflow, /TYPESAFE_API_KEY: \$\{\{ secrets\.TYPESAFE_API_KEY \}\}/);
  assert.match(workflow, /node --import tsx scripts\/sync\/sync-youtube-topics\.ts/);
  assert.match(workflow, /\.cache\/youtube-discovery\/topics\.json/);
  const root = fs.mkdtempSync('/tmp/youtube-topics-record-');
  try {
    fs.mkdirSync(`${root}/data`);
    fs.writeFileSync(`${root}/data/youtube-video-topics.json`, '{}');
    assert.ok(recordFiles(root).includes('data/youtube-video-topics.json'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rule fallback recognizes reported reviews and trailers without changing outfit priority', () => {
  assert.equal(videoTopic('Should You Get and Build Orchid alter? | Orchid alter Review [Arknights]'), 'operators');
  assert.equal(videoTopic('Arknights Official Trailer - Thunder in the Azure Dream'), 'media');
  assert.equal(videoTopic('Arknights Official Teaser Trailer - Thunder in the Azure Dream'), 'media');
  assert.equal(videoTopic('【Arknights】Summoning on Viviana & Pozemka Banner'), 'gameplay');
});
