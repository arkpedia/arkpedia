import { EVENT_MUSIC } from '@/lib/music-guesser/associations';
import { EVENT_EXPANSION } from '@/lib/music-guesser/eventExpansion';
import type { PageMusicTable } from './pageMusic';
export function pageMusicTable(): PageMusicTable {
  return [...EVENT_MUSIC, ...EVENT_EXPANSION].flatMap(event => {
    const lobby = event.tracks.find(track => track.role === 'lobby');
    return lobby ? [{ names: event.names, cid: lobby.id }] : [];
  });
}
