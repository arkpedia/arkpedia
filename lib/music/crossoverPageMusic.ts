import type { MusicCatalogueSong } from './musicCatalogue';

/** Reviewed lobby recordings outside Monster Siren's catalogue. YouTube embeds only;
 * no audio is extracted or copied. Keep copyrighted so stream-safe mode excludes them.
 * Usage: https://www.monsterhunterwiki.org/wiki/Crossovers/Arknights#Trivia
 * Recordings: https://www.youtube.com/watch?v=p1fEV6QbCww
 *             https://www.youtube.com/watch?v=ADn4S1ajMAI
 */
export const CROSSOVER_PAGE_MUSIC: { names: string[]; song: MusicCatalogueSong }[] = [
  { names: ['A Flurry to the Flame', 'Leaves Chasing Fire'], song: {
    id: 'p1fEV6QbCww', videoId: 'p1fEV6QbCww', title: 'Proof of a Hero',
    album: 'Monster Hunter', copyright: true,
  } },
  { names: ['Thunder in the Azure Dream'], song: {
    id: 'ADn4S1ajMAI', videoId: 'ADn4S1ajMAI', title: 'Proof of a Hero — Rise Version',
    album: 'Monster Hunter Rise', copyright: true,
  } },
];

/** Older content releases do not list these recordings yet. Preserve their existing
 * metadata when they do; the supplement must never duplicate a video in the queue. */
export function withCrossoverPageMusic(songs: MusicCatalogueSong[]): MusicCatalogueSong[] {
  const ids = new Set(songs.map(song => song.id));
  return [...songs, ...CROSSOVER_PAGE_MUSIC.filter(entry => !ids.has(entry.song.id)).map(entry => entry.song)];
}
