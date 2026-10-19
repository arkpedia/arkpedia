import { SERVER_TIME, serverOffsetLabel } from '@/lib/time/servers.mjs';
import { SERVER_IDS, SERVERS, type ServerId } from '@/lib/account-import/yostar';

/** A server maintenance window, from an in-game notice (data/official-bulletins.json, parsed by
 *  scripts/sync/sync-official-bulletins.mjs). `url` is the notice's own page. */
export interface MaintenanceWindow { startAt: string; endAt: string; url: string }
/** Every server's windows: the page carries all three, and shows the site's server's
 *  (lib/time/siteServer.ts). */
export type RegionalMaintenance = Record<ServerId, MaintenanceWindow[]>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');
/** The server's wall time, as its notices give it: the same on the server and in every browser. */
function serverClock(instant: string, server: ServerId) {
  const at = new Date(Date.parse(instant) + SERVER_TIME[server].offset * 3_600_000);
  return { day: `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}`, time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}` };
}

/** The windows still to come or under way at `now`, earliest first. */
export function currentMaintenance(windows: readonly MaintenanceWindow[], now: number): MaintenanceWindow[] {
  return windows.filter(window => Date.parse(window.endAt) > now).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** currentMaintenance for every server. */
export function currentRegionalMaintenance(regional: Partial<RegionalMaintenance>, now: number): RegionalMaintenance {
  return Object.fromEntries(SERVER_IDS.map(server => [server, currentMaintenance(regional[server] ?? [], now)])) as RegionalMaintenance;
}

/** One line for the home notice and the ticker, in that server's own time. */
export function maintenanceText(window: MaintenanceWindow, now: number, server: ServerId): string {
  const start = serverClock(window.startAt, server), end = serverClock(window.endAt, server), zone = `(${serverOffsetLabel(server)})`;
  const name = `${SERVERS[server].label} server maintenance`;
  if (Date.parse(window.startAt) <= now) return `${name} under way until ${end.day === start.day ? '' : `${end.day}, `}${end.time} ${zone}`;
  return `${name} ${start.day}, ${start.time}–${end.day === start.day ? '' : `${end.day}, `}${end.time} ${zone}`;
}
