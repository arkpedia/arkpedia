import { YOUTUBE_CHANNELS, type YouTubeChannelConfig } from '@/lib/music/youtubeConfig';

export interface CommunityCreator extends YouTubeChannelConfig {
  slug: string;
  youtubeUrl: string;
}

export function creatorSlug(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The configured channel list is already Arkpedia's reviewed creator roster. */
export const COMMUNITY_CREATORS: CommunityCreator[] = YOUTUBE_CHANNELS
  .filter((channel) => channel.label !== 'Arknights Official - Yostar')
  .map((channel) => ({
    ...channel,
    slug: creatorSlug(channel.label),
    youtubeUrl: `https://www.youtube.com/channel/${channel.id}`,
  }));

export function getCommunityCreator(slug: string): CommunityCreator | undefined {
  return COMMUNITY_CREATORS.find((creator) => creator.slug === slug);
}
