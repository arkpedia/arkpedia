import { eventTitle } from '@/lib/events/eventName.mjs';

/** Page themes have no queue of their own. Only reviewed lobby recordings qualify. */
export type PageMusicTable = { names: string[]; cid?: string; videoId?: string }[];
export function eventMusicId(name: string, table: PageMusicTable): string | null {
  const key = (value: string) => eventTitle(value).replace(/\s*(?:[-–:]\s*)?\(?rerun\)?$/i, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const match = table.find(event => event.names.some(alias => key(alias) === key(name)));
  return match?.videoId ?? match?.cid ?? null;
}

// Default “Vision” menu, m_sys_void: https://arknights.wiki.gg/wiki/Soundtrack/BGM/Interface
export const HOME_MUSIC_CID = '232202';
export const MAIN_AUDIO_START = 'arkpedia:main-audio-start';
