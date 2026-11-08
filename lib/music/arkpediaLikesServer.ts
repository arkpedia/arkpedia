import type { D1Database } from '@cloudflare/workers-types';
import type { ArkpediaLikes } from './arkpediaLikes';

export const MUSIC_CHART_KEY = 'music-charts/v2/favourites.json';

/** Counts only. Each participating account contributes once per catalogue track. */
export async function collectArkpediaLikes(db: D1Database, catalogue: ReadonlySet<string>): Promise<ArkpediaLikes> {
  const { results } = await db.prepare(`SELECT favorite.value AS track, COUNT(DISTINCT save.userId) AS likes
    FROM community_account AS sharing
    JOIN cloud_save AS save ON save.userId = sharing.userId
    CROSS JOIN json_each(save.payload, '$.musicFavorites') AS favorite
    WHERE sharing.stats = 1 AND save.personalSync = 1 AND save.paused = 0 AND save.syncReviewed = 1
      AND json_type(save.payload, '$.musicFavorites') = 'array' AND favorite.type = 'text'
    GROUP BY favorite.value`).all<{ track: string; likes: number }>();
  const likes = Object.fromEntries(results.filter(row => catalogue.has(row.track)).map(row => [row.track, row.likes]));
  return { updatedAt: new Date().toISOString(), likes };
}
