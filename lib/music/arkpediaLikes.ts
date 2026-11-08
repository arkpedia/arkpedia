import { isStoredTrackId } from './trackId';

export interface ArkpediaLikes {
  updatedAt: string | null;
  likes: Record<string, number>;
}

export const NO_PUBLISHED_LIKES: ArkpediaLikes = { updatedAt: null, likes: {} };

export function validArkpediaLikes(value: unknown): value is ArkpediaLikes {
  const data = value as ArkpediaLikes | null;
  if (!data || !data.likes || typeof data.likes !== 'object' || Array.isArray(data.likes)) return false;
  const entries = Object.entries(data.likes);
  if (data.updatedAt === null) return !entries.length;
  return typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt))
    && entries.every(([id, count]) => isStoredTrackId(id) && Number.isSafeInteger(count) && count > 0);
}

export function byArkpediaLikes<T>(songs: readonly T[], likes: Record<string, number>, idOf: (song: T) => string) {
  return [...songs].sort((a, b) => (likes[idOf(b)] ?? 0) - (likes[idOf(a)] ?? 0));
}

export function mostLikedTracks<T>(songs: readonly T[], likes: Record<string, number>, idOf: (song: T) => string) {
  const seen = new Set<string>();
  return byArkpediaLikes(songs.filter(song => {
    const id = idOf(song);
    if (!likes[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  }), likes, idOf);
}
