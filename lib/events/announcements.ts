import announcements from '@/config/event-announcements.json';
import type { TableRewardGroup } from './tableRewards';

export interface TicketDetails {
  source: string;
  description: string;
  note?: string;
  operators: string[];
}
interface Supplement { groups: TableRewardGroup[]; tickets: Record<string, TicketDetails> }
const supplements = announcements.events as unknown as Record<string, Supplement>;

/** Reviewed stream previews survive content hydration (config belongs to the app). The
 * event's own Global table/announcement groups supersede their preview, without counting
 * the same sign-in or paid pack twice. Independent early login gifts stay with the event. */
export function announcedRewards(name: string, groups: TableRewardGroup[]) {
  const supplement = supplements[name];
  if (!supplement) return { groups, tickets: {} as Record<string, TicketDetails> };
  const earlyTitles = new Set(supplement.groups.filter(g => g.region === 'Global').map(g => g.title));
  const hasGlobal = (kind: string) => groups.some(g => g.kind === kind && g.region !== 'CN' && !g.region?.includes('preview') && !earlyTitles.has(g.title));
  const additions = supplement.groups.filter(g => {
    if (groups.some(existing => existing.kind === g.kind && existing.title === g.title)) return false;
    if (g.region?.includes('preview') && g.kind !== 'notice' && g.title !== 'A letter from Kal’tsit - Esperanta' && hasGlobal(g.kind)) return false;
    return true;
  });
  const replaced = new Set(additions.filter(g => g.region?.includes('preview')).map(g => g.kind));
  return {
    groups: [...groups.filter(g => !(g.region === 'CN' && replaced.has(g.kind))), ...additions],
    tickets: supplement.tickets,
  };
}
