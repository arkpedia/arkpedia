import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';

function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isLocalDev()) {
    return res.status(403).json({ error: 'The dev console only works when running locally (npm run dev).' });
  }
  const passcode = process.env.DEV_CONSOLE_PASSCODE;
  if (passcode && req.headers['x-dev-passcode'] !== passcode) {
    return res.status(401).json({ error: 'Invalid passcode' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body as Partial<ScheduleEvent>;
  if (!event.name || !event.year) {
    return res.status(400).json({ error: 'Event needs at least a name and year' });
  }

  const relativeFile = `events/events_${event.year}.json`;
  const filepath = path.join(process.cwd(), 'data', relativeFile);
  if (!fs.existsSync(filepath)) {
    return res.status(400).json({
      error: `No supported event-year file for ${event.year}. Add and import ${relativeFile} before creating events for that year.`,
    });
  }
  let events: ScheduleEvent[] = [];
  try {
    events = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    return res.status(500).json({ error: `Failed to read ${relativeFile}`, detail: String(e) });
  }

  if (events.some((e) => e.name === event.name)) {
    return res.status(400).json({ error: `An event named "${event.name}" already exists.` });
  }

  const newEvent: ScheduleEvent = {
    name: event.name,
    poster: event.poster || null,
    year: event.year,
    cn: event.cn || { dateRange: null, note: null },
    global: event.global || { dateRange: null, note: null },
    tw: event.tw || { dateRange: null, note: null },
    linkedSkinNames: event.linkedSkinNames || [],
    materials: event.materials || [],
    pullsNeeded: event.pullsNeeded,
  };

  events.push(newEvent);

  try {
    fs.copyFileSync(filepath, filepath + '.bak');
    fs.writeFileSync(filepath, JSON.stringify(events, null, 2), 'utf-8');
    return res.status(200).json({ saved: true, event: newEvent, file: relativeFile });
  } catch (e) {
    return res.status(500).json({ error: `Failed to write ${relativeFile}`, detail: String(e) });
  }
}
