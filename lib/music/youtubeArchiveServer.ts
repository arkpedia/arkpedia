import fs from 'node:fs';
import path from 'node:path';
import { readPublishedContentPageProps } from '@/lib/content/release';
import type { YouTubeVideo } from './youtube';

export const YOUTUBE_ARCHIVE_FILE = '.cache/youtube-discovery/archive.json';
export const YOUTUBE_ARCHIVE_RECORD = 'data/youtube-discovery.json';

/** Public video metadata is a content record so archive-only updates have a new release input. */
export function readLocalVideoArchive(): YouTubeVideo[] {
  if (process.env.ARKPEDIA_WORKER === '1' || process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE) return [];
  try {
    const saved = JSON.parse(fs.readFileSync(process.env.ARKPEDIA_YOUTUBE_ARCHIVE_FILE ?? path.join(process.cwd(), YOUTUBE_ARCHIVE_RECORD), 'utf8')) as { videos?: YouTubeVideo[] };
    return Array.isArray(saved.videos) ? saved.videos : [];
  } catch { return []; }
}

/** The daily content preparation publishes the archive with World. Worker
 * requests read that release; local previews read the producer's content record. */
export async function loadVideoArchive(): Promise<YouTubeVideo[]> {
  if (process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE) return [];
  const published = await readPublishedContentPageProps<{ videoArchive?: YouTubeVideo[] }>('/community');
  return published?.videoArchive ?? readLocalVideoArchive();
}
