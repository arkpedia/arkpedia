import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'node:crypto';
import { loadRelease, readPageProps } from '@/lib/content/release';
import { calendarFeed, type CalendarData, type CalendarServer } from '@/lib/schedule/calendarFeed';

const localUpdatedAt = new Date().toISOString();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { server = 'en', predicted = '1', birthdays = '0', download = '0' } = req.query;
  if (typeof server !== 'string' || !['en', 'jp', 'kr'].includes(server)
    || !['0', '1'].includes(String(predicted)) || Array.isArray(predicted)
    || !['0', '1'].includes(String(birthdays)) || Array.isArray(birthdays)
    || !['0', '1'].includes(String(download)) || Array.isArray(download)) {
    return res.status(400).json({ error: 'Choose a supported server and calendar options.' });
  }
  try {
    const release = await loadRelease();
    const published = release ? await readPageProps(release, '/schedule') : null;
    const data = (published as unknown as CalendarData | null)
      ?? (process.env.ARKPEDIA_WORKER === '1' ? null : await (await import('@/lib/schedule/calendarLocal')).localCalendarData());
    if (!data?.eventRows || !data.events || !data.operators) throw new Error('Schedule unavailable');
    const body = calendarFeed(data, { server: server as CalendarServer, predicted: predicted === '1', birthdays: birthdays === '1' }, release?.manifest.generatedAt ?? localUpdatedAt);
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="arkpedia-${server}.ics"`);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).end(body);
  } catch {
    // Never send a successful empty calendar: subscribers could remove all events.
    return res.status(503).json({ error: 'Calendar temporarily unavailable. Please try again later.' });
  }
}
