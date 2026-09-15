import type { SongChoice } from './game';

// These names are already reviewed in the event connections. Keep each alias
// with its own character, rather than copying all characters from an event.
const CHARACTER_ALIASES: Record<string, string[]> = {
  Necrass: ['Eblana', 'Eblana Dublinn'],
  Virtuosa: ['Arturia', 'Arturia Giallo'],
  Penance: ['Lavinia', 'Lavinia Falcone'],
  'Texas the Omertosa': ['Texas alter', 'Texalter'],
  'Specter the Unchained': ['Specter alter', 'Spalter', 'Laurentina'],
  'Reed the Flame Shadow': ['Reed alter'],
  'Executor the Ex Foedere': ['Executor alter', 'Federico', 'Federico Giallo'],
  'Jessica the Liberated': ['Jessica alter', 'Jessicalter'],
  'Nearl the Radiant Knight': ['Nearl alter', 'NTR Knight', 'Margaret Nearl'],
};

/** Only explicitly labelled operator EPs qualify. An event album's banner
 * characters do not turn its lobby/boss tracks into character EPs. */
export function characterEp(
  album: { albumCategory: string[]; characters: string[] },
  song: { songId: string; songName: string; songAltName?: string },
): SongChoice['ep'] {
  if (!album.albumCategory.includes('Operator EP') || !album.characters.length) return undefined;
  const characters = [...new Set(album.characters.flatMap((name) => [name, ...(CHARACTER_ALIASES[name] || [])]))];
  const instrumental = [song.songName, song.songAltName || ''].some((title) => /\binstrument(?:al)?\b/i.test(title.normalize('NFKC')));
  // Intro: Resonance is a separate track in Virtuosa's Revealing EP.
  const variant = instrumental ? 'instrumental' : song.songId === '306813' ? 'intro' : undefined;
  return variant ? { characters, variant } : { characters };
}
