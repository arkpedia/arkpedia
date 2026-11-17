/**
 * Sponsor campaigns: which sponsored artwork a page's slot shows, if any.
 *
 * The record is arkpedia-data's sponsor-campaigns.json and reaches the browser as the
 * `sponsor-campaigns` release table (lib/content/tables.mjs), so a campaign starts, is
 * swapped or ends with a data release and no deploy. Nothing here runs a third-party
 * script: a slot is one image and one link.
 */

/** Where a slot stands: the home page's panel under Events, the free space beside a page's
 *  header, and the Sponsor section of /support. */
export const SPONSOR_PLACEMENTS = ['home', 'header', 'support'] as const;
export type SponsorPlacement = typeof SPONSOR_PLACEMENTS[number];

export interface SponsorCampaign {
  id: string;
  sponsor: string;
  /** Only "active" is shown to readers; "draft" is for local development and preview builds. */
  status: 'draft' | 'active' | 'ended';
  /** The click-through link. A campaign without one is never shown to readers. */
  url: string | null;
  /** ISO instants with a timezone; endAt is exclusive. null leaves that side open. */
  startAt: string | null;
  endAt: string | null;
  placements: SponsorPlacement[];
  /** Root-relative path in arkpedia-image-assets, with the file's pixel size. */
  image: string;
  width: number;
  height: number;
  alt: string;
}

export interface SponsorCampaignTable { version: 1; campaigns: SponsorCampaign[] }

function httpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

/** An ISO instant that names its timezone: a bare date would mean a different moment per reader. */
const instant = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

const positiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/**
 * The record, or a thrown error naming every malformed campaign. Called by each page's
 * table loader, so a hand edit that cannot be shown honestly stops the release that
 * carries it instead of rendering a broken or unlabelled slot.
 */
export function checkSponsorCampaigns(value: unknown): SponsorCampaignTable {
  const table = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (table.version !== 1 || !Array.isArray(table.campaigns)) throw new Error('sponsor-campaigns.json: expected { version: 1, campaigns: [...] }');
  const errors: string[] = [];
  const ids = new Set<string>();
  const campaigns = table.campaigns.map((item, index): SponsorCampaign => {
    const c = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const label = typeof c.id === 'string' && c.id ? c.id : `campaign ${index + 1}`;
    const fail = (problem: string) => { errors.push(`${label}: ${problem}`); };
    if (typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(c.id)) fail('id must be lower-case letters, digits and hyphens');
    else if (ids.has(c.id)) fail('id is used twice');
    else ids.add(c.id);
    if (typeof c.sponsor !== 'string' || !c.sponsor.trim()) fail('sponsor is missing');
    if (c.status !== 'draft' && c.status !== 'active' && c.status !== 'ended') fail('status must be draft, active or ended');
    if (c.url !== null && !httpsUrl(c.url)) fail('url must be an https link or null');
    if (c.status === 'active' && c.url === null) fail('an active campaign needs its url');
    if (c.startAt !== null && !instant(c.startAt)) fail('startAt must be an ISO instant with a timezone, or null');
    if (c.endAt !== null && !instant(c.endAt)) fail('endAt must be an ISO instant with a timezone, or null');
    if (instant(c.startAt) && instant(c.endAt) && Date.parse(c.startAt) >= Date.parse(c.endAt)) fail('endAt must be after startAt');
    if (!Array.isArray(c.placements) || !c.placements.length || !c.placements.every(p => (SPONSOR_PLACEMENTS as readonly unknown[]).includes(p))) fail(`placements must list one or more of ${SPONSOR_PLACEMENTS.join(', ')}`);
    if (typeof c.image !== 'string' || !/^\/advertisements\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.(?:webp|png|jpg|avif)$/.test(c.image)) fail('image must be /advertisements/<sponsor>/<file>.webp (lower-case, hyphenated)');
    if (!positiveInt(c.width) || !positiveInt(c.height)) fail('width and height must be the image\'s pixel size');
    if (typeof c.alt !== 'string' || !c.alt.trim()) fail('alt is missing');
    return c as unknown as SponsorCampaign;
  });
  if (errors.length) throw new Error(`sponsor-campaigns.json cannot be shown as written:\n  ${errors.join('\n  ')}`);
  return { version: 1, campaigns };
}

const inWindow = (campaign: SponsorCampaign, nowMs: number) =>
  (campaign.startAt === null || nowMs >= Date.parse(campaign.startAt)) && (campaign.endAt === null || nowMs < Date.parse(campaign.endAt));

/** The table without the active campaigns that are outside their dates at `nowMs`: what
 *  withContentPage hands a request, so the server's HTML never holds an expired slot. */
export function currentSponsorCampaigns(table: SponsorCampaignTable, nowMs: number): SponsorCampaignTable {
  return { version: 1, campaigns: table.campaigns.filter(campaign => campaign.status !== 'active' || inWindow(campaign, nowMs)) };
}

/**
 * The campaign a placement shows at `nowMs`, or null.
 *
 * Readers get the first listed campaign that is active, linked and inside its window.
 * `drafts` (local development and preview builds only) also admits draft campaigns,
 * linked or not and whatever their dates, so the artwork can be reviewed in place.
 */
export function sponsorCampaignFor(table: SponsorCampaignTable, placement: SponsorPlacement, nowMs: number | null, drafts = false): SponsorCampaign | null {
  return table.campaigns.find(campaign => {
    if (!campaign.placements.includes(placement)) return false;
    if (campaign.status === 'draft') return drafts;
    if (campaign.status !== 'active' || !campaign.url) return false;
    if (nowMs === null) return true;
    return inWindow(campaign, nowMs);
  }) ?? null;
}
