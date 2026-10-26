import { mergeMissingModeLaunches } from './modeReleases';
import type { EventRow, EventRowView } from './eventRows';
import { publishedArt } from '@/lib/art/publishedArt';
import { eventSkins } from '../events/eventSkins';
import { getAllSkins } from '../skins/skins';
import confirmed from '@/data/skin-availability-windows.json';
import rotations from '@/data/skin-shop-rotations.json';
import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { scheduleModeRelease } from './modeReleases';
import { PREDICTED_GAP_DAYS } from '@/lib/home/frontPageContent';
import { ScheduleEvent } from './scheduleTypes';

export function getAllEvents(): ScheduleEvent[] {
  const events = loadAllEventYears() as ScheduleEvent[];
  const skins = getAllSkins(), names = events.map(event => event.name);
  return events.map(event => ({ ...scheduleModeRelease(event, PREDICTED_GAP_DAYS), linkedSkinNames: event.linkedSkinNames ?? eventSkins(event.name, skins, names, { confirmed, rotations }).map(skin => skin.name) }));
}

/* The pure helpers live in ./scheduleDates, so browser code can use them without this module. */

/** Compatibility for a release exported before a new permanent-mode launch existed.
 * Only absent mode IDs can be added; existing release windows and timed events win. */
export function fillMissingModeLaunches<P extends { events: ScheduleEvent[]; eventRows: (EventRow | EventRowView)[] }>(props: P): P {
  const launches = getAllEvents().filter(event => event.modeId).map(event => ({ ...event, poster: publishedArt(event.poster) }));
  return mergeMissingModeLaunches(props, launches);
}
