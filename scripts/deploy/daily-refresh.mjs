import { DAILY_STATISTICS_TARGETS, refreshDailyStatistics } from './statistics-schedule.mjs';
import { syncPatreon } from '../../lib/patreon/sync.mjs';

const COOLDOWN_MS = 20_000;

/** Isolate each job's failure and leave D1 time to recover before the next job. */
export async function refreshDailyServices(env, {
  statistics = refreshDailyStatistics,
  patreon = syncPatreon,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const failures = [];
  for (const target of DAILY_STATISTICS_TARGETS) {
    try { await statistics(env, target, wait); }
    catch (error) { failures.push(`Statistics (${target}): ${error instanceof Error ? error.message : 'refresh failed'}`); }
    await wait(COOLDOWN_MS);
  }

  try { await patreon(env); }
  catch (error) { failures.push(`Patreon: ${error instanceof Error ? error.message : 'refresh failed'}`); }

  if (failures.length) throw Error(failures.join('; '));
}
