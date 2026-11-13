import { refreshDailyStatistics } from './statistics-schedule.mjs';
import { syncPatreon } from '../../lib/patreon/sync.mjs';

/** A provider outage must not skip the other daily refresh. */
export async function refreshDailyServices(env, { statistics = refreshDailyStatistics, patreon = syncPatreon } = {}) {
  const results = await Promise.allSettled([statistics(env), patreon(env)]);
  const failures = results.flatMap((result, i) => result.status === 'rejected' ? [`${i === 0 ? 'Statistics' : 'Patreon'}: ${result.reason instanceof Error ? result.reason.message : 'refresh failed'}`] : []);
  if (failures.length) throw Error(failures.join('; '));
}
