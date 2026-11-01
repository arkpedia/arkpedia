import { CROSSOVER_PAGE_MUSIC } from './crossoverPageMusic';
import { CC_MUSIC, EVENT_MUSIC, type EventMusic } from '@/lib/music-guesser/associations';
import { readPageMusicSource, type PageRecording } from './pageRecordingsServer';
import { EVENT_EXPANSION } from '@/lib/music-guesser/eventExpansion';
import type { PageMusicTable } from './pageMusic';

/** Older snapshots predate automatic associations. At request time the Worker reads
 * the published page table; a fallback without local source records keeps curated music. */
export function automaticPageMusic(file?: string): EventMusic[] {
  return readPageMusicSource(file).events;
}

export function pageMusicTable(records: EventMusic[] = [...EVENT_MUSIC, ...EVENT_EXPANSION, ...automaticPageMusic()], recordings: PageRecording[] = readPageMusicSource().recordings ?? []): PageMusicTable {
  const events = records.flatMap(event => {
    const lobby = event.tracks.find(track => track.role === 'lobby');
    return lobby ? [{ names: event.names, cid: lobby.id }] : [];
  });
  return [...events,
    ...CC_MUSIC.map(cc => ({
    names: [`Contingency Contract ${cc.name}`, `Contingency Contract #${cc.number} ${cc.series === 'ccb' ? 'Battleplan' : 'Operation'} ${cc.name}`],
    cid: cc.lobby,
  })), ...CROSSOVER_PAGE_MUSIC.map(({names, song}) => ({names, videoId: song.videoId})),
  ...recordings.map(({ names, videoId }) => ({ names, videoId }))];
}
