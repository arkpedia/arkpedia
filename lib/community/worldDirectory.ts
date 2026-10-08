export type WorldCategory = 'offline' | 'web' | 'youtube' | 'twitch' | 'discord' | 'cosplay' | 'art' | 'music';
export interface WorldCreator { name: string; category: 'cosplay' | 'art' | 'music'; url: string; works: { title: string; character: string; image: string; source: string }[] }
export interface WorldWebEvent { name: string; start: string; end: string; url: string; region?: string; closingTime?: string; expiresAt?: string }
export interface WorldDirectory { creators: WorldCreator[]; webEvents: WorldWebEvent[]; discord: { name: string; url: string }[] }
/** The deadline is exclusive: a campaign ending at 11:59 is open through that minute. */
export function currentWebEvents(events: WorldWebEvent[], now: number): WorldWebEvent[] {
  return events.filter(event => now >= Date.parse(event.start) && now < Date.parse(event.expiresAt ?? `${event.end}T23:59:59.999Z`));
}
export const WORLD_CATEGORIES: { value: WorldCategory; label: string }[] = [{ value: 'offline', label: 'Offline Events' }, { value: 'web', label: 'Web Events' }, { value: 'youtube', label: 'YouTube' }, { value: 'twitch', label: 'Twitch' }, { value: 'discord', label: 'Discord' }, { value: 'cosplay', label: 'Cosplayers' }, { value: 'art', label: 'Fan-artists' }, { value: 'music', label: 'Fan Musicians' }];
