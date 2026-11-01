import { CROSSOVER_PAGE_MUSIC } from './crossoverPageMusic';
import { CC_MUSIC, EVENT_MUSIC, type EventMusic } from '@/lib/music-guesser/associations';
import automatic from '@/data/event-page-music.json';
import { EVENT_EXPANSION } from '@/lib/music-guesser/eventExpansion';
import type { PageMusicTable } from './pageMusic';
export function pageMusicTable(records: EventMusic[] = [...EVENT_MUSIC, ...EVENT_EXPANSION, ...automatic.events as EventMusic[]]): PageMusicTable {
  const events = records.flatMap(event => {
    const lobby = event.tracks.find(track => track.role === 'lobby');
    return lobby ? [{ names: event.names, cid: lobby.id }] : [];
  });
  return [...events,
    ...CC_MUSIC.map(cc => ({
    names: [`Contingency Contract ${cc.name}`, `Contingency Contract #${cc.number} ${cc.series === 'ccb' ? 'Battleplan' : 'Operation'} ${cc.name}`],
    cid: cc.lobby,
  })), ...CROSSOVER_PAGE_MUSIC.map(({names, song}) => ({names, videoId: song.videoId}))];
}
