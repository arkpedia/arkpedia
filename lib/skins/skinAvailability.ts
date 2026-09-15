import { Skin } from './skinTypes';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { getSkinsForEvent } from '@/lib/schedule//scheduleSkinMatch';
import { parseDateRange } from '@/lib/schedule//schedule';

export interface SkinCountdown {
  date: Date;
  /** When the window closes, so the page can print the range rather than a
   *  bare start date. */
  endDate: Date | null;
  eventName: string;
  isFashionReview: boolean;
  /** The window is open right now, rather than being counted down to. */
  live: boolean;
}

/** For every skin, finds the next UPCOMING event (relative to `asOf`)
 * where it'll actually be available to buy -- a countdown, not a
 * historical record. Two independent sources feed into this, and the
 * EARLIER of the two wins when both apply:
 *
 * 1. The skin's own future release: if its `release` text matches an
 *    event (reusing the existing scheduleSkinMatch.ts logic, inverted
 *    here) whose Global date hasn't happened yet, that's a countdown
 *    target.
 * 2. Fashion Review: if the skin has ever been added to Fashion Review
 *    (fashionReviewDate is set, regardless of whether THAT date is in
 *    the past or future), it'll be available again at the next
 *    upcoming Celebration/Carnival/Festival event that hosts Fashion
 *    Review at all -- per the cascading rule, it never leaves rotation
 *    once added. So even a skin that debuted in 2022 still gets a
 *    countdown to whatever Fashion-Review-hosting event comes next.
 *
 * Skins with neither an upcoming direct release nor any Fashion Review
 * history at all have no entry -- there's genuinely nothing upcoming
 * to count down to. */
export function computeSkinCountdowns(skins: Skin[], events: ScheduleEvent[], asOf: Date = new Date()): Map<string, SkinCountdown> {
  const result = new Map<string, SkinCountdown>();
  /* Every event name, so a skin that names its event exactly is not also claimed by
     an event whose name merely starts with the same words. Without this, skins from
     a Stronghold Protocol run that closed in May read as buyable during Stronghold
     Protocol Alliance 2nd Half, and every Contingency Contract season collapsed onto
     the next. */
  const eventNames = events.map((e) => e.name);

  // Find the single next upcoming Fashion-Review-hosting event once,
  // rather than re-scanning events for every Fashion Review skin.
  const upcomingFashionReviewEvents = events
    .filter((e) => e.hasFashionReview)
    .map((e) => ({ event: e, range: parseDateRange(e.global.dateRange) }))
    .filter((x): x is { event: ScheduleEvent; range: { start: Date; end: Date } } => x.range !== null && x.range.start > asOf)
    .sort((a, b) => a.range.start.getTime() - b.range.start.getTime());
  const nextFashionReviewEvent = upcomingFashionReviewEvents[0] || null;

  // Source 0: what is buyable RIGHT NOW. This used to be skipped entirely --
  // the map only ever answered "what is coming", so a skin whose event was
  // open today looked identical to one with no availability at all. A live
  // window always wins: nothing upcoming is more useful than "you can buy
  // this today".
  for (const event of events) {
    const range = parseDateRange(event.global.dateRange);
    if (!range || range.start > asOf || range.end < asOf) continue;
    for (const skin of getSkinsForEvent(event.name, skins, eventNames)) {
      const existing = result.get(skin.name);
      if (!existing || !existing.live || range.end < (existing.endDate ?? range.end)) {
        result.set(skin.name, { date: range.start, endDate: range.end, eventName: event.name, isFashionReview: false, live: true });
      }
    }
  }

  // Source 1: each skin's own upcoming direct release, via the
  // existing event -> skins matching, inverted into skin -> event.
  for (const event of events) {
    const range = parseDateRange(event.global.dateRange);
    if (!range || range.start <= asOf) continue; // only upcoming events count for a countdown
    const matchedSkins = getSkinsForEvent(event.name, skins, eventNames);
    for (const skin of matchedSkins) {
      const existing = result.get(skin.name);
      if (existing?.live) continue; // already buyable; a future date would bury that
      if (!existing || range.start < existing.date) {
        result.set(skin.name, { date: range.start, endDate: range.end, eventName: event.name, isFashionReview: false, live: false });
      }
    }
  }

  // Source 2: Fashion Review skins -- countdown to the next upcoming
  // Fashion-Review-hosting event, regardless of how long ago the skin
  // itself first entered rotation.
  if (nextFashionReviewEvent) {
    for (const skin of skins) {
      if (!skin.fashionReviewDate) continue;
      const existing = result.get(skin.name);
      if (existing?.live) continue; // buyable now beats any future rotation
      if (existing && existing.date <= nextFashionReviewEvent.range.start) continue; // the direct release is sooner or equal
      result.set(skin.name, {
        date: nextFashionReviewEvent.range.start,
        endDate: nextFashionReviewEvent.range.end,
        eventName: nextFashionReviewEvent.event.name,
        isFashionReview: true,
        live: false,
      });
    }
  }

  return result;
}