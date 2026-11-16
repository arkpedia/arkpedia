import fs from 'node:fs';
import { readPublishedContentPageProps } from '@/lib/content/release';
import type { VideoTopicAssignments } from './youtubeTopicAssignments';

export const VIDEO_TOPICS_RECORD = 'data/youtube-video-topics.json';
export function readLocalVideoTopics(): VideoTopicAssignments {
  if (process.env.ARKPEDIA_WORKER === '1' || process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE) return {};
  try {
    const saved = JSON.parse(fs.readFileSync(VIDEO_TOPICS_RECORD, 'utf8'));
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  }
  catch { return {}; }
}
export async function loadVideoTopics(): Promise<VideoTopicAssignments> {
  if (process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE) return {};
  const published = await readPublishedContentPageProps<{ videoTopics?: VideoTopicAssignments }>('/community');
  return published?.videoTopics ?? readLocalVideoTopics();
}
