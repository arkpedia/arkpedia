import bannersData from '@/data/headhunting_banners.json';
import { loadAllEventYears } from '@/lib/events/loadEventsData';
import type { Operator } from './operatorTypes';

interface TimedEvent {
  name: string;
  global?: { startAt?: string | null } | null;
}

interface ReleaseBanner {
  linked_event?: string | null;
  six_stars?: string[];
  five_stars?: string[];
  four_stars?: string[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/\brerun\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function recordedReleaseDay(operator: Pick<Operator, 'characterInfo'>): number | null {
  const raw = operator.characterInfo?.['Release Date']?.trim();
  const match = raw?.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  const value = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(value) ? value : null;
}

const exactEventStarts = new Map<string, string>();
for (const event of loadAllEventYears() as TimedEvent[]) {
  if (event.global?.startAt && Number.isFinite(Date.parse(event.global.startAt))) {
    exactEventStarts.set(normalize(event.name), event.global.startAt);
  }
}

/**
 * Derive an operator's exact Global debut from the same official event window
 * used by countdowns. The old release date remains a proximity guard so an old
 * rate-up cannot be mistaken for a debut; it is not used as the exact instant.
 */
export function getScheduledOperatorRelease(
  operator: Pick<Operator, 'name' | 'characterInfo' | 'howToObtain'>,
): string | null {
  const candidates: string[] = [];
  for (const banner of bannersData as ReleaseBanner[]) {
    if (!banner.linked_event) continue;
    const featured = [...(banner.six_stars ?? []), ...(banner.five_stars ?? []), ...(banner.four_stars ?? [])];
    if (!featured.includes(operator.name)) continue;
    const startAt = exactEventStarts.get(normalize(banner.linked_event));
    if (startAt) candidates.push(startAt);
  }

  const welfare = typeof operator.howToObtain === 'object' && operator.howToObtain
    ? operator.howToObtain.Welfare
    : null;
  if (typeof welfare === 'object' && welfare?.['Unlock Location']) {
    const startAt = exactEventStarts.get(normalize(welfare['Unlock Location']));
    if (startAt) candidates.push(startAt);
  }

  const recorded = recordedReleaseDay(operator);
  if (recorded === null) return null;
  const MAX_SOURCE_DRIFT = 45 * 86_400_000;
  return candidates
    .filter((startAt) => Math.abs(Date.parse(startAt) - recorded) <= MAX_SOURCE_DRIFT)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}
