import { withSiteTables } from '@/lib/content/server';
import { contentUrl } from '@/lib/content/urls';
import type { ContentRelease } from '@/lib/content/types';
import type { SponsorCampaignTable } from '@/lib/sponsors/campaigns';
import { dashboardDatabase, dashboardEnv } from './access';
import { publishedCampaignEvents } from './publishedCampaignEvents';
import { scheduledCampaigns } from '../sponsors/campaignSchedule';
import { campaignEdits, mergeCampaigns } from './campaignStore';

async function campaignCatalog(forEditor = false) {
  const props = await withSiteTables({}, false) as {
    __contentRelease?: ContentRelease; __contentTables: { 'sponsor-campaigns': SponsorCampaignTable };
  };
  const base = props.__contentTables['sponsor-campaigns'];
  const db = dashboardDatabase(dashboardEnv());
  const edits = db ? await campaignEdits(db) : [];
  const merged = mergeCampaigns(base.campaigns, edits);
  const events = forEditor || merged.some(c => c.eventActivityId && c.status === 'active') ? await publishedCampaignEvents() : [];
  return { base, edits, events, campaigns: scheduledCampaigns(merged, events), release: props.__contentRelease };
}

export async function editorCatalog() {
  const { base, edits, events, campaigns } = await campaignCatalog(true);
  const now = Date.now();
  const groups: Record<string, string> = Object.create(null);
  for (const c of mergeCampaigns(base.campaigns, edits)) {
    const effective = campaigns.find(row => row.id === c.id);
    if (c.status === 'draft') groups[c.id] = 'Drafts';
    else if (c.status === 'ended') groups[c.id] = 'Paused';
    else if (!effective) groups[c.id] = 'Waiting for Global dates';
    else if (effective.endAt && Date.parse(effective.endAt) <= now) groups[c.id] = 'Ended';
    else if (effective.startAt && Date.parse(effective.startAt) > now) groups[c.id] = 'Up next';
    else groups[c.id] = 'Live now';
  }
  return { base: base.campaigns, edits, events, groups };
}

async function buildReaderCampaigns() {
  const { campaigns, release } = await campaignCatalog();
  const includeDrafts = process.env.NODE_ENV !== 'production' || process.env.ARKPEDIA_PREVIEW === '1';
  return { version: 1, now: Date.now(), campaigns: campaigns
    .filter(c => c.status === 'active' || (includeDrafts && c.status === 'draft'))
    .map(c => ({ ...c, image: contentUrl(c.image, release),
      ...(c.mobileArtwork && { mobileArtwork: { ...c.mobileArtwork, image: contentUrl(c.mobileArtwork.image, release) } }) })) };
}

let cache: { until: number; value: ReturnType<typeof buildReaderCampaigns> } | undefined;
export function expireReaderCampaigns() { cache = undefined; }
export function readerCampaigns() {
  if (cache && cache.until > Date.now()) return cache.value;
  const value = buildReaderCampaigns().catch(error => {
    if (cache?.value === value) cache = undefined;
    throw error;
  });
  cache = { until: Date.now() + 15000, value };
  return value;
}
