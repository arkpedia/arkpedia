import { readPublishedContentPageProps } from '../content/release';
import { campaignEventOptions, type CampaignEvent, type SponsorEvent } from '../sponsors/campaignSchedule';
import { regionalEvents, type RegionalSchedules } from '../time/regional';
import type { ScheduleEvent } from '../schedule/scheduleTypes';

let lastPublished: CampaignEvent[] = [];

/** Read the live content release, so a corrected Global announcement needs no Worker deploy. */
export async function publishedCampaignEvents() {
  const page = await readPublishedContentPageProps<{
    events: (ScheduleEvent & SponsorEvent)[];
    __contentTables?: { 'regional-schedules'?: RegionalSchedules };
  }>('/schedule').catch(() => null);
  if (page) {
    lastPublished = campaignEventOptions(regionalEvents(page.events, page.__contentTables?.['regional-schedules']?.servers.en, 'en'));
    return lastPublished;
  }
  if (process.env.NODE_ENV === 'production' && process.env.ARKPEDIA_CONTENT_DISABLED !== '1') return lastPublished;
  const { loadAllEventYears } = await import('../events/loadEventsData');
  return campaignEventOptions(loadAllEventYears() as SponsorEvent[]);
}
