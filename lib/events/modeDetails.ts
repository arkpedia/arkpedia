import type { GameEventListing } from '../home/frontPageContent';
import type { ScheduleEvent } from '../schedule/scheduleTypes';
export interface ModeDetails { title: string; description: string[]; unlock: string; rewards: string; cnLaunch: string; source: string }
const DETAILS: Record<string, ModeDetails> = {
  '[Reclamation Algorithm] Relaunch Anchor': {
    title: 'Reclamation Algorithm: Relaunch Anchor',
    description: [
      'A permanent Reclamation Algorithm theme. Explore, gather resources and develop your base through a continuing survival campaign.',
      'Earn task acceptance forms through play and redeem them at the Rhodes Island Procurement Platform.',
    ],
    unlock: 'Clear Main Theme 3-8 (CN requirement).',
    rewards: 'Mountain’s The Hardcore Rider outfit, the 再启 background, 不变生息 avatar, 演算 profile theme and 再起蓝图 interactive furniture.',
    cnLaunch: '2026/05/15',
    source: 'https://ak.hypergryph.com/news/3046',
  },
};
export const modeDetails = (name: string): ModeDetails | null => DETAILS[name] ?? null;
/** Detail routes exist for permanent launches without inventing an event end date. */
export function permanentEventListing(event: ScheduleEvent): GameEventListing | null {
  if (!event.modeId) return null;
  const launch = event.global.releaseDate ?? event.cn.releaseDate;
  if (!launch) return null;
  const start = new Date(`${launch.replaceAll('/', '-')}T00:00:00Z`);
  if (!Number.isFinite(+start)) return null;
  return { name: event.name, poster: event.poster, year: event.year, dateRange: event.global.releaseDate ?? 'Global launch unannounced', start, end: start, isPredicted: !!event.global.note || !event.global.releaseDate };
}
