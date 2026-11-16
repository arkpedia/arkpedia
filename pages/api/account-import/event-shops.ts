import type { NextApiRequest, NextApiResponse } from 'next';
import { isServerId } from '@/lib/account-import/yostar';
import { activeEventShopRequests } from '@/lib/account-import/eventShopSchedule';
import { readPublishedContentPageProps } from '@/lib/content/release';
import type { PullEventReward } from '@/lib/pulls/pulls';
import type { RegionalSchedules } from '@/lib/time/regional';

type ShopSchedule = { scheduledEvents: PullEventReward[]; __contentTables?: { 'regional-schedules'?: RegionalSchedules } };

/** Public shop identifiers only, from the same content release as the planner.
 * Account credentials never leave the browser-to-provider relay connection. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const { server } = req.query;
  if (!isServerId(server) || Object.keys(req.query).some(key => key !== 'server')) return res.status(400).end();
  try {
    let schedule = await readPublishedContentPageProps<ShopSchedule>('/pulls');
    if (!schedule && process.env.ARKPEDIA_WORKER !== '1') {
      const [{ getPullEventSchedule }, { bundledBacklogSources }, { regionalTable }] = await Promise.all([
        import('@/lib/pulls/schedule'), import('@/lib/pulls/sources'), import('@/lib/time/regionalServer'),
      ]);
      schedule = { scheduledEvents: getPullEventSchedule(bundledBacklogSources()), __contentTables: { 'regional-schedules': await regionalTable('/pulls') } };
    }
    if (!schedule) throw new Error('Schedule unavailable');
    return res.status(200).json({ shops: activeEventShopRequests(schedule.scheduledEvents, schedule.__contentTables?.['regional-schedules']?.servers[server], Date.now()) });
  } catch { return res.status(503).json({ error: 'Event shop schedule temporarily unavailable' }); }
}
