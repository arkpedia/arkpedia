import { publicRotations } from '../sponsors/rotation';
import { withSiteTables } from '@/lib/content/server';
import { contentUrl } from '@/lib/content/urls';
import type { ContentRelease } from '@/lib/content/types';
import { readSponsorSource } from '../content/release';
import { checkSponsorCampaigns, unifiedLootBarCampaigns, type SponsorCampaignTable } from '@/lib/sponsors/campaigns';
import { dashboardDatabase, dashboardEnv } from './access';
import { publishedCampaignEvents } from './publishedCampaignEvents';
import { scheduledCampaigns } from '../sponsors/campaignSchedule';
import { readCampaignSettings, mergeCampaigns } from './campaignStore';

async function campaignCatalog(forEditor = false) {
  const props = await withSiteTables({}, false) as {
    __contentRelease?: ContentRelease; __contentTables: { 'sponsor-campaigns': SponsorCampaignTable };
  };
  const base = props.__contentTables['sponsor-campaigns'];
  const db = dashboardDatabase(dashboardEnv());
  const { edits, plans } = db ? await readCampaignSettings(db) : { edits: [], plans: {} };
  const merged = mergeCampaigns(base.campaigns, edits);
  const events = forEditor || merged.some(c => c.eventActivityId && c.status === 'active') ? await publishedCampaignEvents() : [];
  return { base, edits, events, plans, campaigns: scheduledCampaigns(merged, events), release: props.__contentRelease };
}

export async function editorCatalog() {
  const { base, edits, events, campaigns, release } = await campaignCatalog(true);
  const source = release ? await readSponsorSource(release.release) : (await import('../../data/sponsor-campaigns.json')).default;
  const definitions = unifiedLootBarCampaigns(checkSponsorCampaigns(source)).campaigns;
  const publishedIds = new Set(base.campaigns.map(c => c.id));
  // Only the private catalogue includes these definitions. An artwork override
  // following the release becomes eligible when its original ID is published.
  const editorBase = [...base.campaigns, ...definitions.filter(c => c.eventActivityId && !publishedIds.has(c.id))];
  const now = Date.now();
  const groups: Record<string, string> = Object.create(null);
  for (const c of mergeCampaigns(editorBase, edits)) {
    const effective = campaigns.find(row => row.id === c.id);
    if (c.status === 'draft') groups[c.id] = 'Drafts';
    else if (c.status === 'ended') groups[c.id] = 'Paused';
    else if (!effective) groups[c.id] = 'Waiting for Global dates';
    else if (effective.endAt && Date.parse(effective.endAt) <= now) groups[c.id] = 'Ended';
    else if (effective.startAt && Date.parse(effective.startAt) > now) groups[c.id] = 'Up next';
    else groups[c.id] = 'Live now';
  }
  return { base: editorBase, edits, events, groups, release: release ?? null };
}

function publicTable({ campaigns, release, plans }: Awaited<ReturnType<typeof campaignCatalog>>, includeDrafts: boolean): SponsorCampaignTable {
  const visible = campaigns.filter(c => c.status === 'active' || (includeDrafts && c.status === 'draft'));
  return { version: 1, now: Date.now(), rotations: publicRotations(visible, plans), campaigns: visible
    .map(c => ({ ...c, image: contentUrl(c.image, release),
      ...(c.mainArtwork && { mainArtwork: { ...c.mainArtwork, image: contentUrl(c.mainArtwork.image, release) } }),
      ...(c.mobileArtwork && { mobileArtwork: { ...c.mobileArtwork, image: contentUrl(c.mobileArtwork.image, release) } }) })) };
}

export async function rotationCatalog() {
  const catalog = await campaignCatalog();
  return { table: publicTable(catalog, false), plans: catalog.plans };
}

async function buildReaderCampaigns() {
  const includeDrafts = process.env.NODE_ENV !== 'production' || process.env.ARKPEDIA_PREVIEW === '1';
  return publicTable(await campaignCatalog(), includeDrafts);
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
