import type { GameEvent } from '@/lib/home/frontPageContent';
import { parseInstant, type GameServer } from '@/lib/time/servers.mjs';
import { eventReleaseTiming, preferRegionalWindow, sourcedTiming, type ReleaseTiming, type TimingEvidence } from '@/lib/time/releaseTiming';
import { BROADCAST_REGIONS, type OfficialBroadcast } from './officialBroadcasts';

export interface EventStartCard {
  title: string;
  artwork: string | null;
  instant: number;
  schedule: string;
  timing: ReleaseTiming;
}

export type ClockFormat = '12h' | '24h';

const SERVER_LABELS = { en: 'Global', jp: 'JP', kr: 'KR', cn: 'CN' };

export function gameEventStartCard(event: GameEvent, server: GameServer, regionalWindow?: TimingEvidence): EventStartCard {
  const regional = regionalWindow && preferRegionalWindow(event, regionalWindow, server) ? parseInstant(regionalWindow.startAt) : null;
  const exact = regional ?? parseInstant(event.startAt);
  const timing = regional && regionalWindow ? sourcedTiming(regionalWindow) : event.releaseTiming ?? eventReleaseTiming(event, false);
  return {
    title: event.name.replace(/^\[[^\]]+\]\s*/, ''),
    artwork: event.poster,
    instant: (exact ?? event.start).getTime(),
    schedule: `${SERVER_LABELS[regional ? server : 'en']} event`,
    timing: !exact && timing === 'confirmed' ? 'estimated' : timing,
  };
}

export function broadcastStartCard(broadcast: OfficialBroadcast): EventStartCard {
  return {
    title: broadcast.title,
    artwork: broadcast.thumbnail,
    instant: Date.parse(broadcast.startsAt),
    schedule: `${broadcast.game === 'endfield' ? 'Endfield' : 'Arknights'} ${BROADCAST_REGIONS[broadcast.region]} broadcast`,
    timing: 'confirmed',
  };
}

// Each location keeps its own IANA zone. Places share a row only when their
// clocks agree on the event's date, including during DST transitions.
const PLACES = [
  ['Hawaii', 'Pacific/Honolulu'],
  ['California & Washington', 'America/Los_Angeles'],
  ['Arizona (Phoenix)', 'America/Phoenix'],
  ['Mexico City', 'America/Mexico_City'],
  ['Central US', 'America/Chicago'],
  ['Colombia', 'America/Bogota'], ['Peru', 'America/Lima'], ['Quito', 'America/Guayaquil'],
  ['Toronto', 'America/Toronto'], ['New York', 'America/New_York'], ['Venezuela', 'America/Caracas'],
  ['Santiago', 'America/Santiago'], ['São Paulo', 'America/Sao_Paulo'],
  ['Argentina', 'America/Argentina/Buenos_Aires'], ['Uruguay', 'America/Montevideo'],
  ['UK', 'Europe/London'], ['Ireland', 'Europe/Dublin'], ['Portugal & Madeira', 'Europe/Lisbon'],
  ['Germany', 'Europe/Berlin'], ['Austria', 'Europe/Vienna'], ['France', 'Europe/Paris'],
  ['Netherlands', 'Europe/Amsterdam'], ['Sweden', 'Europe/Stockholm'], ['Hungary', 'Europe/Budapest'],
  ['Italy', 'Europe/Rome'], ['Mainland Spain', 'Europe/Madrid'], ['Norway', 'Europe/Oslo'],
  ['Serbia', 'Europe/Belgrade'], ['Belgium', 'Europe/Brussels'], ['Denmark', 'Europe/Copenhagen'],
  ['Switzerland', 'Europe/Zurich'], ['Poland', 'Europe/Warsaw'], ['South Africa', 'Africa/Johannesburg'],
  ['Ukraine', 'Europe/Kyiv'], ['Romania', 'Europe/Bucharest'], ['Finland', 'Europe/Helsinki'],
  ['Greece', 'Europe/Athens'], ['Bulgaria', 'Europe/Sofia'], ['Egypt', 'Africa/Cairo'],
  ['Jordan', 'Asia/Amman'], ['Saudi Arabia', 'Asia/Riyadh'], ['Türkiye', 'Europe/Istanbul'],
  ['Moscow', 'Europe/Moscow'], ['Uzbekistan', 'Asia/Tashkent'], ['Maldives', 'Indian/Maldives'],
  ['India', 'Asia/Kolkata'], ['Vietnam', 'Asia/Ho_Chi_Minh'], ['Thailand', 'Asia/Bangkok'],
  ['Laos', 'Asia/Vientiane'], ['Jakarta', 'Asia/Jakarta'], ['Singapore', 'Asia/Singapore'],
  ['Malaysia', 'Asia/Kuala_Lumpur'], ['Philippines', 'Asia/Manila'], ['Beijing', 'Asia/Shanghai'],
  ['Perth', 'Australia/Perth'], ['South Korea', 'Asia/Seoul'], ['Japan', 'Asia/Tokyo'],
  ['Adelaide', 'Australia/Adelaide'], ['Brisbane', 'Australia/Brisbane'], ['Sydney', 'Australia/Sydney'],
  ['Wellington', 'Pacific/Auckland'],
] as const;

export interface EventStartRow { key: string; time: string; date: string; places: string[] }

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const utcDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function formatClock(hour: string, minute: string, format: ClockFormat): string {
  if (format === '24h') return `${hour}:${minute}`;
  const hour24 = Number(hour);
  return `${hour24 % 12 || 12}:${minute} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

export function startCardCaption({ schedule, timing, instant }: EventStartCard, format: ClockFormat): string {
  const [hour, minute] = new Date(instant).toISOString().slice(11, 16).split(':');
  const start = timing === 'confirmed' ? 'Start' : timing === 'datamined' ? 'Datamined start' : timing === 'cn-estimate' ? 'Estimated start (CN-based)' : 'Estimated start';
  return `${schedule} · ${start} · ${utcDate.format(instant)}, ${formatClock(hour, minute, format)} UTC`;
}

export function eventStartRows(instant: number, format: ClockFormat): EventStartRow[] {
  const rows = new Map<string, EventStartRow>();
  for (const [place, timeZone] of PLACES) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(instant);
    const { year, month, day, hour, minute } = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const key = `${year}-${month}-${day}T${hour}:${minute}`;
    const row = rows.get(key);
    if (row) row.places.push(place);
    else rows.set(key, {
      key,
      time: formatClock(hour, minute, format),
      date: shortDate.format(Date.UTC(Number(year), Number(month) - 1, Number(day))),
      places: [place],
    });
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}
