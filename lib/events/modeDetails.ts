import type { GameEventListing } from '../home/frontPageContent';
import type { ScheduleEvent } from '../schedule/scheduleTypes';
import DETAILS_RECORD from '@/data/mode-details.json';
export interface ModeDetails {
  title: string; description: string[]; unlock: string; rewards: string; cnLaunch: string; source: string;
  globalLaunch?: string;
  poster?: string;
  panels?: { title: string; description: string; image: string; width: number; height: number }[];
  guides?: { label: string; url: string }[];
}
/** The modes themselves are arkpedia-data's record: a new or returning mode is an
 *  editorial edit there, not a deploy. */
const DETAILS = DETAILS_RECORD.modes as Record<string, ModeDetails>;
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
