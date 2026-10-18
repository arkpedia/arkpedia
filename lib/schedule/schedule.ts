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
