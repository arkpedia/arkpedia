import { loadAllEventYears } from '../events/loadEventsData';
import type { SponsorCampaignTable } from './campaigns';
import { campaignEventOptions, scheduledCampaigns, type SponsorEvent } from './campaignSchedule';

export function resolveSponsorEvents(table: SponsorCampaignTable, events = loadAllEventYears() as SponsorEvent[]): SponsorCampaignTable {
  return { ...table, campaigns: scheduledCampaigns(table.campaigns, campaignEventOptions(events)) };
}
