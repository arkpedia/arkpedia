import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCanonicalVideoTopic } from '../sync/canonical-video-topics';
import { applyVideoTopicAssignments, videoTopicInputHash, TOPIC_POLICY_VERSION, type VideoTopicAssignment } from '../../lib/music/youtubeTopicAssignments';
import { discoveryVideoTopic } from '../../lib/music/youtubeDiscovery';
import { getAllOperators } from '../../lib/operators/operators';
import type { YouTubeVideo } from '../../lib/music/youtube';
import labels from './fixtures/youtube-topic-labels.json';

const example = labels[2];
const video: YouTubeVideo = { videoId: 'p5c-vT4eop4', title: example.title, channelLabel: example.channelLabel,
  description: example.description, publishedAt: '', thumbnail: '', url: '', isLivestream: false, liveStatus: 'none' };
const names = ['Violet Mizutsune Orchid', 'Zinogre S Catapult', 'Rhodes Island Recon'];
const abstention = (video: YouTubeVideo): VideoTopicAssignment => ({ inputHash: videoTopicInputHash(video),
  policyVersion: TOPIC_POLICY_VERSION, topic: null, confidence: 0.73, probability: 0.76,
  model: 'jev-1.14.0', requestedModel: 'jev-latest', checkedAt: '2026-11-16T12:23:48.202Z' });

test('the real production abstention is resolved from full canonical names and reaches grouping', () => {
  const before = abstention(video);
  const resolved = resolveCanonicalVideoTopic(video, before, getAllOperators().map(operator => operator.name));
  assert.equal(resolved.topic, 'operators');
  assert.equal(resolved.model, 'catalogue-v1', 'do not label a catalogue decision as a confident model answer');
  assert.deepEqual(resolved.fallbackFrom, { model: before.model, confidence: 0.73, probability: 0.76 });
  assert.equal(discoveryVideoTopic(applyVideoTopicAssignments([video], { [video.videoId]: resolved })[0]), 'operators');
  assert.equal(resolveCanonicalVideoTopic(video, resolved, names), resolved, 'future updates retain the successful result unchanged');
});

test('catalogue fallback requires multiple distinct complete names, with branding only', () => {
  for (const title of ['Violet Mizutsune Orchid', 'Violet Mizutsune Orchid, Violet Mizutsune Orchid',
    'Violet Mizutsune Orchid, Unknown operator', 'Orchid, Catapult', 'Violet Mizutsune Orchid, Zinogre S Catapult animation',
    '[Guide] Violet Mizutsune Orchid, Zinogre S Catapult']) {
    const candidate = { ...video, title };
    assert.equal(resolveCanonicalVideoTopic(candidate, abstention(candidate), names).topic, null, title);
  }
  for (const title of ['【Arknights】Violet Mizutsune Orchid, Zinogre S Catapult',
    'Violet Mizutsune Orchid & Zinogre S Catapult | Arknights']) {
    const candidate = { ...video, title };
    assert.equal(resolveCanonicalVideoTopic(candidate, abstention(candidate), names).topic, 'operators', title);
  }
});

test('explicit genres, accepted model answers, changed metadata and old policies retain their normal handling', () => {
  for (const description of ['Arknights voice lines compilation', 'Arknights skin comparison', 'Arknights AFK guide']) {
    const candidate = { ...video, description };
    assert.equal(resolveCanonicalVideoTopic(candidate, abstention(candidate), names).topic, null);
  }
  const accepted = { ...abstention(video), topic: 'media' as const };
  assert.equal(resolveCanonicalVideoTopic(video, accepted, names), accepted);
  const stale = abstention(video);
  assert.equal(resolveCanonicalVideoTopic({ ...video, description: 'changed' }, stale, names), stale);
  const oldPolicy = { ...stale, policyVersion: 0 };
  assert.equal(resolveCanonicalVideoTopic(video, oldPolicy, names), oldPolicy);
});
