import { createHash } from 'node:crypto';
import { VIDEO_TOPICS, type VideoTopic } from './youtubeDiscovery';
import type { YouTubeVideo } from './youtube';

export const TOPIC_POLICY_VERSION = 2;
export const TOPIC_MIN_PROBABILITY = 0.8;
export const TOPIC_MIN_CONFIDENCE = 0.6;
export interface VideoTopicAssignment {
  inputHash: string;
  policyVersion: number;
  topic: VideoTopic | null;
  confidence: number;
  probability: number;
  model: string;
  requestedModel: string;
  checkedAt: string;
}
export type VideoTopicAssignments = Record<string, VideoTopicAssignment>;

/** Use the same bounded public metadata for requests and cache invalidation. */
export const videoTopicState = (video: YouTubeVideo) => ({
  title: video.title, creator: video.channelLabel, description: (video.description ?? '').slice(0, 2000),
});
export const videoTopicInputHash = (video: YouTubeVideo) => createHash('sha256')
  .update(JSON.stringify(videoTopicState(video))).digest('hex');
export const isVideoTopic = (value: unknown): value is VideoTopic => VIDEO_TOPICS.some(topic => topic.value === value);

/** Old/changed metadata and uncertain answers use the normal rules. Editorial
 * associations remain authoritative. No model calls happen in a reader request. */
export function applyVideoTopicAssignments(videos: YouTubeVideo[], assignments: VideoTopicAssignments): YouTubeVideo[] {
  return videos.map(({ classifiedTopic: _previous, ...video }) => {
    const entry = assignments[video.videoId];
    // The v1 catalogue proof is independent of the model's Guides/gameplay split.
    // Preserve it for this one-version migration, with all metadata/quality checks.
    const legacyCatalogue = entry?.policyVersion === 1 && entry.policyVersion + 1 === TOPIC_POLICY_VERSION
      && entry.model === 'catalogue-v1' && entry.topic === 'operators';
    return entry && (entry.policyVersion === TOPIC_POLICY_VERSION || legacyCatalogue) && entry.inputHash === videoTopicInputHash(video)
      && isVideoTopic(entry.topic) && entry.probability >= TOPIC_MIN_PROBABILITY && entry.confidence >= TOPIC_MIN_CONFIDENCE
      ? { ...video, classifiedTopic: entry.topic } : video;
  });
}
