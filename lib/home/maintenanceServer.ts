import fs from 'fs';
import path from 'path';
import { SERVER_IDS } from '@/lib/account-import/yostar';
import type { MaintenanceWindow, RegionalMaintenance } from './maintenance';

const RECENT = 3;

type Notice = { url?: string; maintenance?: { startAt: string; endAt: string } | null };

/** Each server's latest RECENT maintenance windows, as its in-game notices announced them, from
 *  the content run's data/official-bulletins.json, earliest first. Only a notice the run read as
 *  a maintenance (sync-official-bulletins.mjs maybeMaintenance) carries a window. The export has
 *  no clock (a page picks by the request's, in finalize: currentRegionalMaintenance), so it keeps
 *  the few newest rather than the ones not over. The application's own checkout has no copy of
 *  the file (the content run hydrates it from arkpedia-data), and then there are none. */
export function readMaintenanceWindows(): RegionalMaintenance {
  const file = path.join(process.cwd(), 'data', 'official-bulletins.json');
  const regions = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'))?.regions ?? {} : {};
  return Object.fromEntries(SERVER_IDS.map(server => {
    const notices: Notice[] = regions[server]?.notices ?? [];
    const seen = new Set<string>();
    const windows: MaintenanceWindow[] = notices.flatMap(notice => {
      const window = notice.url ? notice.maintenance : null;
      if (!window || seen.has(`${window.startAt}/${window.endAt}`)) return [];
      seen.add(`${window.startAt}/${window.endAt}`);
      return [{ startAt: window.startAt, endAt: window.endAt, url: notice.url as string }];
    }).sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(-RECENT);
    return [server, windows];
  })) as RegionalMaintenance;
}
