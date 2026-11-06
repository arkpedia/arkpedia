import { parseChannelFeed, type YouTubeVideo } from './youtube';
import type { LinkBucket } from './audioLinkMemo';

const FRESH_MS = 15 * 60 * 1000;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const PREFIX = 'youtube-feeds/v1/';
interface Snapshot { xml: string; checkedAt: number }

/** The existing page-cache bucket shares successful public feeds across isolates.
 * Empty/error responses never replace a successful snapshot. */
export function createChannelFeedReader({ fetcher = (...args) => fetch(...args), now = Date.now }: {
  fetcher?: typeof fetch;
  now?: () => number;
} = {}) {
  const memory = new Map<string, Snapshot>();
  const pending = new Map<string, Promise<YouTubeVideo[]>>();
  return async (channelId: string, label: string, bucket: LinkBucket | null): Promise<YouTubeVideo[]> => {
    const key = `${channelId}:${label}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      const usable = (snapshot: Snapshot | undefined | null): snapshot is Snapshot => !!snapshot
        && typeof snapshot.xml === 'string' && Number.isFinite(snapshot.checkedAt)
        && snapshot.checkedAt <= now() && now() - snapshot.checkedAt < KEEP_MS;
      let cached = memory.get(channelId);
      if (!usable(cached) && bucket) {
        try {
          const saved = await bucket.get(PREFIX + channelId);
          cached = saved ? JSON.parse(await saved.text()) as Snapshot : undefined;
          if (usable(cached)) memory.set(channelId, cached);
        } catch { /* Try the live feed when storage is unavailable. */ }
      }
      if (usable(cached) && now() - cached.checkedAt < FRESH_MS) return parseChannelFeed(cached.xml, label);
      try {
        const response = await fetcher(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
          cache: 'no-store', signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('YouTube feed unavailable');
        const xml = await response.text();
        const videos = parseChannelFeed(xml, label);
        if (!videos.length) throw new Error('YouTube feed is empty');
        const snapshot = { xml, checkedAt: now() };
        memory.set(channelId, snapshot);
        if (memory.size > 64) memory.delete(memory.keys().next().value!);
        if (bucket) await bucket.put(PREFIX + channelId, JSON.stringify(snapshot)).catch(() => {});
        return videos;
      } catch {
        if (usable(cached)) return parseChannelFeed(cached.xml, label);
        return [];
      }
    })().finally(() => { pending.delete(key); });
    pending.set(key, task);
    return task;
  };
}
