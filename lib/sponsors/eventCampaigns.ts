import { loadAllEventYears } from '../events/loadEventsData';
import { eventReleaseTiming, type ReleaseTiming, type TimingEvidence } from '../time/releaseTiming';
import { isSponsorInstant, type SponsorCampaignTable } from './campaigns';

interface SponsorEvent {
  activityId?: string;
  cn?: { dateRange?: string | null };
  global?: TimingEvidence & { endAt?: string | null; note?: string | null; releaseTiming?: ReleaseTiming };
}

/** Compile linked campaigns against the same Global event records used by Schedule.
 * An announcement with no confirmed opening and closing instants leaves its campaign
 * pending. The next content release picks up newly confirmed or corrected windows. */
export function resolveSponsorEvents(table: SponsorCampaignTable, events = loadAllEventYears() as SponsorEvent[]): SponsorCampaignTable {
  const campaigns = table.campaigns.flatMap(campaign => {
    const { eventActivityId, ...art } = campaign;
    if (!eventActivityId || campaign.status === 'draft') return [campaign];
    const event = events.find(row => row.activityId === eventActivityId);
    const window = event?.global;
    if (!window || !isSponsorInstant(window.startAt) || !isSponsorInstant(window.endAt)
      || Date.parse(window.startAt) >= Date.parse(window.endAt)
      || eventReleaseTiming(window, !!event?.cn?.dateRange) !== 'confirmed') return [];
    return [{ ...art, startAt: window.startAt, endAt: window.endAt }];
  });
  return { ...table, campaigns };
}
