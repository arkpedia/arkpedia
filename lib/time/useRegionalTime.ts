import { useSiteServer } from './siteServer';
import { useReleaseTable } from '@/lib/content/context';
import type { RegionalSchedules } from './regional';

/** The site's server (lib/time/siteServer.ts: the nav's choice, else the account's) and its
 *  schedule; snapshots travel with the page release. `globalSchedule` is Global's, for a list
 *  JP and KR build on Global's own (lib/time/regional.ts: regionalSkinWindows). */
export function useRegionalTime() {
  const server = useSiteServer();
  const schedules = useReleaseTable<RegionalSchedules>('regional-schedules');
  return { server, schedule: schedules.servers[server], globalSchedule: schedules.servers.en };
}
