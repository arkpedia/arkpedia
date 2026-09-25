import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { ScheduleEvent } from './scheduleTypes';

export function getAllEvents(): ScheduleEvent[] {
  return loadAllEventYears() as ScheduleEvent[];
}

/* The pure helpers live in ./scheduleDates, so browser code can use them without this module. */
export { getOperatorBirthdays, parseDateRange, type OperatorBirthday } from './scheduleDates';
