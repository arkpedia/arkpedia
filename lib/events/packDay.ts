import { SERVER_TIME } from '@/lib/time/servers.mjs';
export function packDay(iso: string, { exclusiveEnd = false }: { exclusiveEnd?: boolean } = {}): string {
  return Number.isNaN(Date.parse(iso)) ? iso : new Date(Date.parse(iso) - (exclusiveEnd ? 1 : 0)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: SERVER_TIME.en.timeZone });
}

