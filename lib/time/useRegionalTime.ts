import { useSiteServer } from './siteServer';
import { useReleaseTable } from '@/lib/content/context';
import type { RegionalSchedules } from './regional';

/** The site's server (lib/time/siteServer.ts: the nav's choice, else the account's) and its
 *  schedule; snapshots travel with the page release. */
export function useRegionalTime() {
  const server = useSiteServer();
  const schedules = useReleaseTable<RegionalSchedules>('regional-schedules');
  return { server, schedule: schedules.servers[server] };
}
