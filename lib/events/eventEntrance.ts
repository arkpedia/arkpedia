import catalogue from '@/config/event-entrances.json';
import { eventTitle, isRerun } from './eventName.mjs';
import { pinAssetUrl } from '@/lib/assets/revisions';

export type EventEntrance = (typeof catalogue.entries)[number];
export function eventEntrance(name: string, server: string): EventEntrance | null {
  const title = eventTitle(name).replace(/\s+Rerun$/i, '').normalize('NFKC').toLowerCase();
  return catalogue.entries.find(e => e.server === server && e.rerun === isRerun(name) && e.title.normalize('NFKC').toLowerCase() === title) ?? null;
}
export function entranceForUrl(href: string, origin: string, server: string): EventEntrance | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/events/')) return null;
    return eventEntrance(decodeURIComponent(url.pathname.slice('/events/'.length)), server);
  } catch { return null; }
}
export function entranceAsset(entry: EventEntrance, file: string): string {
  return pinAssetUrl(`${catalogue.baseUrl}${entry.folder}/${file}`);
}
