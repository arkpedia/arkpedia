import { getAllSongsFull } from '@/lib/music/albumsData';
import type { Operator } from './operatorTypes';
/** Only explicit album character credits establish an operator EP. */
export function operatorEP(operator: Pick<Operator, 'name' | 'aliases' | 'ep'>) {
  const names = new Set([operator.name, ...(operator.aliases ?? [])]);
  const main = typeof operator.ep === 'object' && operator.ep ? operator.ep.Main : operator.ep;
  const songs = getAllSongsFull().filter(song => song.characters.some(name => names.has(name)) && !/\(Instrumental\)$/i.test(song.title));
  const song = songs.find(song => song.title === main || song.altTitle === main) ?? songs[0];
  return song ? { id: song.videoId, title: song.altTitle || song.title, copyright: song.copyright } : null;
}
