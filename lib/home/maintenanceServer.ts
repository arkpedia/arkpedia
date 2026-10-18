import fs from 'fs';
import path from 'path';
import type { MaintenanceWindow } from './maintenance';

const RECENT = 3;

type Notice = { group?: string; url?: string; maintenance?: { startAt: string; endAt: string } | null };

/** The latest RECENT maintenance windows Global's in-game SYSTEM notices announced, from the
 *  content run's data/official-bulletins.json, earliest first. The export has no clock (a page
 *  picks by the request's, in finalize: currentMaintenance), so it keeps the few newest rather
 *  than the ones not over. The application's own checkout has no copy of the file (the content
 *  run hydrates it from arkpedia-data), and then there are none. */
export function readMaintenanceWindows(): MaintenanceWindow[] {
  const file = path.join(process.cwd(), 'data', 'official-bulletins.json');
  if (!fs.existsSync(file)) return [];
  const notices: Notice[] = JSON.parse(fs.readFileSync(file, 'utf8'))?.regions?.en?.notices ?? [];
  const seen = new Set<string>();
  return notices.flatMap(notice => {
    const window = notice.group === 'SYSTEM' && notice.url ? notice.maintenance : null;
    if (!window || seen.has(`${window.startAt}/${window.endAt}`)) return [];
    seen.add(`${window.startAt}/${window.endAt}`);
    return [{ startAt: window.startAt, endAt: window.endAt, url: notice.url as string }];
  }).sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(-RECENT);
}
