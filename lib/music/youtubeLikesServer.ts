import { YOUTUBE_LIKES_MAX_AGE, YOUTUBE_VIDEO_ID, type YouTubeLikes } from './youtubeLikes';

const DAY = 24 * 60 * 60 * 1000;
const RETRY = 5 * 60 * 1000;

/** A fixed catalogue only: callers cannot spend quota looking up arbitrary video IDs.
 * One request per 50 uploads, at most four in flight, one shared refresh per server process.
 * The API route also caches at Vercel's edge. No key or upstream error reaches the browser. */
export function createYouTubeLikesLoader({
  videoIds, apiKey, fetcher = fetch, now = Date.now,
}: {
  videoIds: () => Promise<string[]>;
  apiKey: () => string | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  let cached: YouTubeLikes | undefined;
  let retryAt = 0;
  let pending: Promise<YouTubeLikes> | undefined;

  async function refresh(): Promise<YouTubeLikes> {
    const key = apiKey();
    if (!key) throw new Error('YouTube likes are unavailable');
    const ids = [...new Set(await videoIds())].filter(id => YOUTUBE_VIDEO_ID.test(id));
    if (!ids.length) throw new Error('YouTube catalogue is unavailable');
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
    const likes: Record<string, number> = {};
    const signal = AbortSignal.timeout(20_000);
    for (let i = 0; i < batches.length; i += 4) {
      await Promise.all(batches.slice(i, i + 4).map(async batch => {
        const url = new URL('https://www.googleapis.com/youtube/v3/videos');
        url.search = new URLSearchParams({ part: 'statistics', id: batch.join(','), fields: 'items(id,statistics(likeCount))' }).toString();
        const response = await fetcher(url, { headers: { 'X-Goog-Api-Key': key }, signal });
        if (!response.ok) throw new Error('YouTube likes are unavailable');
        const body = await response.json();
        if (!Array.isArray(body?.items)) throw new Error('YouTube likes are unavailable');
        for (const item of body.items) {
          const raw = item?.statistics?.likeCount;
          if (!batch.includes(item?.id) || typeof raw !== 'string' || !/^\d+$/.test(raw)) continue;
          const count = Number(raw);
          if (Number.isSafeInteger(count)) likes[item.id] = count;
        }
      }));
    }
    return { updatedAt: new Date(now()).toISOString(), likes };
  }

  return async (): Promise<YouTubeLikes> => {
    if (cached && now() - Date.parse(cached.updatedAt) >= YOUTUBE_LIKES_MAX_AGE) cached = undefined;
    if (now() < retryAt) {
      if (cached) return cached;
      throw new Error('YouTube likes are unavailable');
    }
    if (!pending) {
      pending = refresh().then(result => {
        cached = result;
        retryAt = now() + DAY;
        return result;
      }).catch(() => {
        retryAt = now() + RETRY;
        if (cached) return cached;
        throw new Error('YouTube likes are unavailable');
      }).finally(() => { pending = undefined; });
    }
    return pending;
  };
}
