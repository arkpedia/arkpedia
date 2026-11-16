import catalogue from '@/config/event-entrances.json';
import { eventTitle, isRerun } from './eventName.mjs';
import { pinAssetUrl } from '@/lib/assets/revisions';

export type EventEntrance = (typeof catalogue.entries)[number];
const titleKey = (name: string) => eventTitle(name).replace(/\s+Rerun$/i, '').normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
export function eventEntrance(name: string, server: string): EventEntrance | null {
  const title = titleKey(name);
  // These readers share the Global event catalogue. Pack provenance (including
  // reviewed CN fallbacks) is independent of the reader's reset-clock choice.
  const region = server === 'jp' || server === 'kr' ? 'en' : server;
  return catalogue.entries.find(e => e.server === region && e.rerun === isRerun(name) && [e.title, ...(e.aliases ?? [])].some(alias => titleKey(alias) === title)) ?? null;
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
