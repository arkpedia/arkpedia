import { SERVER_TIME } from '@/lib/time/servers.mjs';
export function packDay(iso: string): string {
  return Number.isNaN(Date.parse(iso)) ? iso : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: SERVER_TIME.en.timeZone });
}

