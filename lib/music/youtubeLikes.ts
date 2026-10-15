/** Counts belong to the linked YouTube upload, never to a combined song or artist score. */
export interface YouTubeLikes {
  updatedAt: string;
  likes: Record<string, number>;
}

export const YOUTUBE_LIKES_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/;

export function validYouTubeLikes(value: unknown, now: number): value is YouTubeLikes {
  const data = value as YouTubeLikes | null;
  if (!data || typeof data.updatedAt !== 'string' || !data.likes || typeof data.likes !== 'object' || Array.isArray(data.likes)) return false;
  const time = Date.parse(data.updatedAt);
  return Number.isFinite(time) && time <= now && now - time < YOUTUBE_LIKES_MAX_AGE
    && Object.entries(data.likes).every(([id, count]) => YOUTUBE_VIDEO_ID.test(id) && Number.isSafeInteger(count) && count >= 0);
}

/** Stable ties keep search relevance/catalogue order; missing counts follow a real zero. */
export function byYouTubeLikes<T>(songs: readonly T[], likes: Readonly<Record<string, number>>, idOf: (song: T) => string): T[] {
  return [...songs].sort((a, b) => (likes[idOf(b)] ?? -1) - (likes[idOf(a)] ?? -1));
}

/** A song listed on two albums appears once in the chart, using its first listing. */
export function mostLikedSongs<T extends { videoId: string }>(songs: readonly T[], likes: Readonly<Record<string, number>>): T[] {
  const seen = new Set<string>();
  return byYouTubeLikes(songs.filter(song => {
    if (likes[song.videoId] === undefined || seen.has(song.videoId)) return false;
    seen.add(song.videoId);
    return true;
  }), likes, song => song.videoId);
}
