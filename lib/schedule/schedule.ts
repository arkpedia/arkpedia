import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { scheduleModeRelease } from './modeReleases';
import { PREDICTED_GAP_DAYS } from '@/lib/home/frontPageContent';
import { ScheduleEvent } from './scheduleTypes';

export function getAllEvents(): ScheduleEvent[] {
  return (loadAllEventYears() as ScheduleEvent[]).map(event => scheduleModeRelease(event, PREDICTED_GAP_DAYS));
}

/* The pure helpers live in ./scheduleDates, so browser code can use them without this module. */
export { getOperatorBirthdays, parseDateRange, type OperatorBirthday } from './scheduleDates';
