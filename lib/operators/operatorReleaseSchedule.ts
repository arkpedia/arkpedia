import bannersData from '@/data/headhunting_banners.json';
import { loadAllEventYears } from '@/lib/events/loadEventsData';
import type { Operator } from './operatorTypes';

interface TimedEvent {
  name: string;
  global?: { startAt?: string | null; endAt?: string | null } | null;
}

interface ReleaseBanner {
  linked_event?: string | null;
  global_window?: { startAt?: string; endAt?: string } | null;
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

const exact = (value: string | null | undefined): string | null => (value && Number.isFinite(Date.parse(value)) ? value : null);

const eventWindows = new Map<string, { startAt: string; endAt: string | null }>();
for (const event of loadAllEventYears() as TimedEvent[]) {
  const startAt = exact(event.global?.startAt);
  if (startAt) eventWindows.set(normalize(event.name), { startAt, endAt: exact(event.global?.endAt) });
}

/**
 * Derive an operator's exact Global debut from the same official event window
 * used by countdowns. The old release date remains a proximity guard so an old
 * rate-up cannot be mistaken for a debut; it is not used as the exact instant.
 *
 * With it, until when the debut lasts: the operator's banner, or for an event's own
 * (welfare) operator the event's stages. Not the event store, which outlasts them but sells
 * only the operator's potential tokens: without the operator, the store cannot give it.
 * The roster's "Now Available" ends there. It counted two weeks from the release, and so
 * still named Ukusik, Zima the Raging Tide and Botani after Rage of The Many and People, A
 * People's stages closed (2026-09-30). availableUntil is null when no end is known.
 */
export function getScheduledOperatorDebut(
  operator: Pick<Operator, 'name' | 'characterInfo' | 'howToObtain'>,
): { startAt: string; availableUntil: string | null } | null {
  const candidates: { startAt: string; availableUntil: string | null }[] = [];
  for (const banner of bannersData as ReleaseBanner[]) {
    if (!banner.linked_event) continue;
    const featured = [...(banner.six_stars ?? []), ...(banner.five_stars ?? []), ...(banner.four_stars ?? [])];
    if (!featured.includes(operator.name)) continue;
    const event = eventWindows.get(normalize(banner.linked_event));
    if (event) candidates.push({ startAt: event.startAt, availableUntil: exact(banner.global_window?.endAt) ?? event.endAt });
  }

  const welfare = typeof operator.howToObtain === 'object' && operator.howToObtain
    ? operator.howToObtain.Welfare
    : null;
  if (typeof welfare === 'object' && welfare?.['Unlock Location']) {
    const event = eventWindows.get(normalize(welfare['Unlock Location']));
    if (event) candidates.push({ startAt: event.startAt, availableUntil: event.endAt });
  }

  const recorded = recordedReleaseDay(operator);
  if (recorded === null) return null;
  const MAX_SOURCE_DRIFT = 45 * 86_400_000;
  return candidates
    .filter(({ startAt }) => Math.abs(Date.parse(startAt) - recorded) <= MAX_SOURCE_DRIFT)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0] ?? null;
}
