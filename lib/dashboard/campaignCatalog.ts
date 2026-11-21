import { withSiteTables } from '@/lib/content/server';
import { contentUrl } from '@/lib/content/urls';
import type { ContentRelease } from '@/lib/content/types';
import type { SponsorCampaignTable } from '@/lib/sponsors/campaigns';
import { dashboardDatabase, dashboardEnv } from './access';
import { campaignEdits, mergeCampaigns } from './campaignStore';

export async function campaignCatalog() {
  const props = await withSiteTables({}, false) as {
    __contentRelease?: ContentRelease; __contentTables: { 'sponsor-campaigns': SponsorCampaignTable };
  };
  const base = props.__contentTables['sponsor-campaigns'];
  const db = dashboardDatabase(dashboardEnv());
  const edits = db ? await campaignEdits(db) : [];
  return { base, edits, campaigns: mergeCampaigns(base.campaigns, edits), release: props.__contentRelease };
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
