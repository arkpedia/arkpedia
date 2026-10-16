import { useAccount } from '@/lib/account/accountStore';
import { useReleaseTable } from '@/lib/content/context';
import type { RegionalSchedules } from './regional';

/** Account server is the sole regional preference; snapshots travel with the page release. */
export function useRegionalTime() {
  const server = useAccount()?.server ?? 'en';
  const schedules = useReleaseTable<RegionalSchedules>('regional-schedules');
  return { server, schedule: schedules.servers[server] };
}
