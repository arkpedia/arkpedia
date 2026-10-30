import { readPublishedContentPageProps } from '@/lib/content/release';
export interface YouTubeChannelConfig { id: string; label: string }

/** Curated creators, from the page's verified live release; local records during export/build. */
export async function youtubeChannels(): Promise<YouTubeChannelConfig[]> {
  const published = await readPublishedContentPageProps<{ __contentTables?: { 'youtube-creators'?: { channels: YouTubeChannelConfig[] } } }>('/community');
  return published?.__contentTables?.['youtube-creators']?.channels
    ?? (await import('@/data/youtube-creators.json')).default.channels;
}

/** Recent uploads per channel, before merging and sorting by date. */
export const VIDEOS_PER_CHANNEL = 6;
