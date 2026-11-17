import registry from '@/config/official-broadcast-sources.json';
import type { BroadcastGame, BroadcastRegion } from './officialBroadcasts';
export type BroadcastSource = { id: string; game: BroadcastGame; region: BroadcastRegion; platform: 'youtube'; channelId?: string; seedVideoIds?: string[] }
  | { id: string; game: BroadcastGame; region: BroadcastRegion; platform: 'bilibili'; uid: number; roomId: number };
export const OFFICIAL_BROADCAST_SOURCES = registry.sources as BroadcastSource[];
export const MAX_BROADCAST_YOUTUBE_SOURCES = 4;
export const MAX_BROADCAST_VIDEOS_PER_SOURCE = 12;
