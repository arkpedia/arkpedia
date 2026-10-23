export type WorldCategory = 'offline' | 'web' | 'youtube' | 'twitch' | 'discord' | 'cosplay' | 'art' | 'music';
export interface WorldCreator { name: string; category: 'cosplay' | 'art' | 'music'; url: string; works: { title: string; character: string; image: string; source: string }[] }
export interface WorldWebEvent { name: string; start: string; end: string; url: string; region?: string; closingTime?: string; expiresAt?: string; opensAt?: string; image?: string; sourceUrl?: string; windowSource?: string;
  /** Runs on social media or a community board (X, YouTube, Naver Cafe) rather than on its own campaign page: the card labels it "Social". */
  kind?: 'social' }
export interface WorldDirectory { creators: WorldCreator[]; webEvents: WorldWebEvent[]; discord: { name: string; url: string }[] }
/** The deadline is exclusive: a campaign ending at 11:59 is open through that minute. */
export function currentWebEvents(events: WorldWebEvent[], now: number): WorldWebEvent[] {
  return events.filter(event => now >= Date.parse(event.opensAt ?? event.start) && now < Date.parse(event.expiresAt ?? `${event.end}T23:59:59.999Z`));
}
/** The server a web event is for, by the region its record names ("Japan (JP)": sync-community-web-events.mjs
 *  REGIONS), or null for one that names none, which every server shows. The site shows the site
 *  server's own campaigns (pages/community-hub.tsx). */
export function webEventServer(event: Pick<WorldWebEvent, 'region'>): 'en' | 'jp' | 'kr' | null {
  const code = event.region?.match(/\((EN|JP|KR)\)\s*$/)?.[1];
  return code ? (code.toLowerCase() as 'en' | 'jp' | 'kr') : null;
}
/** Verified release records take precedence; editorial seeds cover older releases. */
export function mergeWebEvents(seeds: WorldWebEvent[], discovered: WorldWebEvent[]): WorldWebEvent[] {
  const events = new Map<string, WorldWebEvent>();
  for (const event of [...seeds, ...discovered]) events.set(event.url, { ...events.get(event.url), ...event });
  return [...events.values()];
}
export const WORLD_CATEGORIES: { value: WorldCategory; label: string }[] = [{ value: 'offline', label: 'Offline Events' }, { value: 'web', label: 'Web Events' }, { value: 'youtube', label: 'YouTube' }, { value: 'twitch', label: 'Twitch' }, { value: 'discord', label: 'Discord' }, { value: 'cosplay', label: 'Cosplayers' }, { value: 'art', label: 'Fan-artists' }, { value: 'music', label: 'Fan Musicians' }];
