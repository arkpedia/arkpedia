import { ScheduleEvent } from '../schedule/scheduleTypes';
import { Skin } from './skinTypes';
import { parseDateRange } from '../schedule/scheduleDates';
import { getSkinsForEvent } from '../schedule/scheduleSkinMatch';

/** Resolves an event to its skins -- prefers the explicit linkedSkinNames
 * (set on manually-added future events with no real skin data yet), and
 * falls back to the automatic release-text matching once real skin data
 * exists. */
export function getSkinsForScheduleEvent(event: ScheduleEvent, skins: Skin[], allEvents: ScheduleEvent[]): Skin[] {
  if (event.linkedSkinNames && event.linkedSkinNames.length > 0) {
    const byName = new Map(skins.map((s) => [s.name, s]));
    return event.linkedSkinNames.map((n) => byName.get(n)).filter((s): s is Skin => !!s);
  }
  return getSkinsForEvent(event.name, skins, allEvents.map((e) => e.name));
}

/** Events whose Global date range includes today. */
export function getOngoingEvents(events: ScheduleEvent[], asOf: Date = new Date()): ScheduleEvent[] {
  return events.filter((e) => {
    const range = parseDateRange(e.global.dateRange);
    if (!range) return false;
    return asOf >= range.start && asOf <= range.end;
  });
}
