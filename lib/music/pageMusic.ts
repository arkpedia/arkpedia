import { eventTitle } from '@/lib/events/eventName.mjs';

/** Page themes have no queue of their own. Only reviewed lobby recordings qualify. */
export type PageMusicTable = { names: string[]; cid: string }[];
export function eventMusicCid(name: string, table: PageMusicTable): string | null {
  const key = (value: string) => eventTitle(value).replace(/\s*(?:[-–:]\s*)?\(?rerun\)?$/i, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return table.find(event => event.names.some(alias => key(alias) === key(name)))?.cid ?? null;
}
// Default “Vision” menu, m_sys_void: https://arknights.wiki.gg/wiki/Soundtrack/BGM/Interface
export const HOME_MUSIC_CID = '232202';
export const AUDIO_MANUAL_KEY = 'arkpedia:audio-manual-visit';
export const GREETING_VISIT_KEY = 'arkpedia:greeting-visit';
export function visitFlag(key: string): boolean {
  try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
}
export function markVisit(key: string): void {
  try { sessionStorage.setItem(key, '1'); } catch { /* in-memory owner still protects this document */ }
}
