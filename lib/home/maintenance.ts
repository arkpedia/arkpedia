import { SERVER_TIME, serverOffsetLabel } from '@/lib/time/servers.mjs';

/** A Global server maintenance window, from an in-game SYSTEM notice (data/official-bulletins.json,
 *  parsed by scripts/sync/sync-official-bulletins.mjs). `url` is the notice's own page. */
export interface MaintenanceWindow { startAt: string; endAt: string; url: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');
/** Global server wall time, as the game's notices give it: the same on the server and in every browser. */
function serverClock(instant: string) {
  const at = new Date(Date.parse(instant) + SERVER_TIME.en.offset * 3_600_000);
  return { day: `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}`, time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}` };
}

/** The windows still to come or under way at `now`, earliest first. */
export function currentMaintenance(windows: readonly MaintenanceWindow[], now: number): MaintenanceWindow[] {
  return windows.filter(window => Date.parse(window.endAt) > now).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** One line for the home notice and the ticker. */
export function maintenanceText(window: MaintenanceWindow, now: number): string {
  const start = serverClock(window.startAt), end = serverClock(window.endAt), zone = `(${serverOffsetLabel('en')})`;
  if (Date.parse(window.startAt) <= now) return `Global server maintenance under way until ${end.day === start.day ? '' : `${end.day}, `}${end.time} ${zone}`;
  return `Global server maintenance ${start.day}, ${start.time}–${end.day === start.day ? '' : `${end.day}, `}${end.time} ${zone}`;
}
