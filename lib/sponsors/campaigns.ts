import { isRotationSlot, rotationTurns, type RotationTurn, type RotationSlot } from './rotation';

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

export type SponsorSlot = SponsorPlacement | 'mobile-menu';

export interface SponsorArtwork {
  /** Root-relative path in arkpedia-image-assets and its original pixel size. */
  image: string;
  width: number;
  height: number;
  alt: string;
}

export interface SponsorCampaign extends SponsorArtwork {
  id: string;
  sponsor: string;
  /** Only "active" is shown to readers; "draft" is for local development and preview builds. */
  status: 'draft' | 'active' | 'ended';
  /** The click-through link: an https address, or a path on this site for one of Arkpedia's
   *  own banners (not an advertisement, so it carries no "Ad" tag). A campaign without one
   *  is never shown to readers. */
  url: string | null;
  /** ISO instants with a timezone; endAt is exclusive. null leaves that side open. */
  startAt: string | null;
  endAt: string | null;
  placements: SponsorPlacement[];
  /** The confirmed Global event window supplies both dates during content preparation. */
  eventActivityId?: string;
  /** An armed event campaign keeps this campaign running until the confirmed handoff. */
  replacesCampaignId?: string;
  /** Explicit null leaves the homepage empty until its artwork is ready. Older records used their primary image. */
  mainArtwork?: SponsorArtwork | null;
  /** A header campaign can use separate artwork in the mobile drawer. */
  mobileArtwork?: SponsorArtwork;
}

export interface SponsorCampaignTable {
  version: 1;
  campaigns: SponsorCampaign[];
  rotations?: Partial<Record<RotationSlot, RotationTurn[]>>;
  /** The server's time for the first render. Release exports carry no clock. */
  now?: number;
}

/** A path on this site, for Arkpedia's own banners: "/music/discover". Never "//host". */
export const sitePath = (value: unknown): value is string => typeof value === 'string' && /^\/(?!\/)[A-Za-z0-9\-._~/?=&%#]*$/.test(value);

function httpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

/** An ISO instant that names its timezone: a bare date would mean a different moment per reader. */
export const isSponsorInstant = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

const positiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function checkArtwork(value: unknown, fail: (problem: string) => void) {
  const art = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof art.image !== 'string' || (!/^\/api\/sponsor-art\/[a-f0-9-]{36}$/.test(art.image) && !/^\/advertisements\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.(?:webp|png|jpg|avif)$/.test(art.image))) fail('image must be /advertisements/<sponsor>/<file>.webp (lower-case, hyphenated)');
  if (!positiveInt(art.width) || !positiveInt(art.height)) fail('width and height must be the image\'s pixel size');
  if (typeof art.alt !== 'string' || !art.alt.trim()) fail('alt is missing');
}

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
    if (c.url !== null && !httpsUrl(c.url) && !sitePath(c.url)) fail('url must be an https link, a path on this site (/music/discover) or null');
    if (c.status === 'active' && c.url === null) fail('an active campaign needs its url');
    if (c.startAt !== null && !isSponsorInstant(c.startAt)) fail('startAt must be an ISO instant with a timezone, or null');
    if (c.endAt !== null && !isSponsorInstant(c.endAt)) fail('endAt must be an ISO instant with a timezone, or null');
    if (isSponsorInstant(c.startAt) && isSponsorInstant(c.endAt) && Date.parse(c.startAt) >= Date.parse(c.endAt)) fail('endAt must be after startAt');
    if (!Array.isArray(c.placements) || !c.placements.length || !c.placements.every(p => (SPONSOR_PLACEMENTS as readonly unknown[]).includes(p))) fail(`placements must list one or more of ${SPONSOR_PLACEMENTS.join(', ')}`);
    checkArtwork(c, fail);
    if (c.mainArtwork != null) checkArtwork(c.mainArtwork, problem => fail(`mainArtwork: ${problem}`));
    if (c.mobileArtwork !== undefined) {
      if (!Array.isArray(c.placements) || !c.placements.includes('header')) fail('mobileArtwork requires the header placement');
      checkArtwork(c.mobileArtwork, problem => fail(`mobileArtwork: ${problem}`));
    }
    if (c.eventActivityId !== undefined) {
      if (typeof c.eventActivityId !== 'string' || !/^[a-z0-9_]+$/.test(c.eventActivityId)) fail('eventActivityId must identify a game activity');
      if (c.startAt !== null || c.endAt !== null) fail('an event campaign takes its dates from the event');
    }
    if (c.replacesCampaignId !== undefined && (!c.eventActivityId || typeof c.replacesCampaignId !== 'string'
      || !/^[a-z0-9][a-z0-9-]*$/.test(c.replacesCampaignId) || c.replacesCampaignId === c.id)) {
      fail('choose another campaign to replace at the Global event opening');
    }
    return c as unknown as SponsorCampaign;
  });
  if (errors.length) throw new Error(`sponsor-campaigns.json cannot be shown as written:\n  ${errors.join('\n  ')}`);
  return { version: 1, campaigns };
}

const inWindow = (campaign: SponsorCampaign, nowMs: number) =>
  (campaign.startAt === null || nowMs >= Date.parse(campaign.startAt)) && (campaign.endAt === null || nowMs < Date.parse(campaign.endAt));

/**
 * The campaigns a placement shows at `nowMs`, in the record's order.
 *
 * Readers get every listed campaign that is active, linked and inside its window; a
 * placement with more than one takes turns (components/ui/SponsoredSlot). `drafts` (local
 * development and preview builds only) also admits draft campaigns, linked or not and
 * whatever their dates, so the artwork can be reviewed in place.
 */
export function sponsorCampaignsFor(table: SponsorCampaignTable, slot: SponsorSlot, nowMs: number | null, drafts = false): SponsorCampaign[] {
  const mobile = slot === 'mobile-menu';
  const placement = mobile ? 'header' : slot;
  const eligible = table.campaigns.filter(campaign => {
    if (!campaign.placements.includes(placement) || (slot === 'home' && campaign.mainArtwork === null)) return false;
    if (campaign.status === 'draft') return drafts;
    if (campaign.status !== 'active' || !campaign.url || campaign.eventActivityId) return false;
    return nowMs === null || inWindow(campaign, nowMs);
  });
  const turns = isRotationSlot(slot) && table.rotations?.[slot];
  let ordered = eligible;
  if (turns && turns.length) {
    const byId = new Map(eligible.map(c => [c.id, c]));
    ordered = rotationTurns([...byId.keys()], turns).filter(turn => turn.enabled).map(turn => byId.get(turn.id)!);
  }
  return ordered.map(campaign => {
    const art = slot === 'home' ? campaign.mainArtwork : (mobile || slot === 'support') ? campaign.mobileArtwork : undefined;
    if (!art) return campaign;
    const { image, width, height, alt } = art;
    return { ...campaign, image, width, height, alt };
  });
}

/** The first campaign a placement shows at `nowMs`, or null. */
export function sponsorCampaignFor(table: SponsorCampaignTable, placement: SponsorSlot, nowMs: number | null, drafts = false): SponsorCampaign | null {
  return sponsorCampaignsFor(table, placement, nowMs, drafts)[0] ?? null;
}

/** Older releases split the same event into independent home, header and Support records.
 * Normalize their authored shapes before any admin override or event-window selection. */
export function unifiedLootBarCampaigns(table: SponsorCampaignTable): SponsorCampaignTable {
  const main = table.campaigns.find(c => c.id === 'lootbar-violet-orchid-main');
  const grouped = table.campaigns.some(c => c.id === 'lootbar-violet-orchid');
  const campaigns = table.campaigns.flatMap((c): SponsorCampaign[] => {
    if (grouped && (c.id === 'lootbar-violet-orchid-main' || c.id === 'lootbar-top-up')) return [];
    if (c.mainArtwork !== undefined || !['lootbar-violet-orchid', 'lootbar-kirin-yato', 'lootbar-aphrissa'].includes(c.id)) return [c];
    const art = c.id === 'lootbar-violet-orchid' ? main : undefined;
    return [{ ...c, placements: [...SPONSOR_PLACEMENTS], mainArtwork: art
      ? { image: art.image, width: art.width, height: art.height, alt: art.alt } : null }];
  });
  return { ...table, campaigns };
}

/** Older published tables already contain Violet's event closing. Bridge both of
 * its placements to the confirmed Kirin opening even when reading those tables. */
export function applyLootBarHandoff(table: SponsorCampaignTable): SponsorCampaignTable {
  const kirin = table.campaigns.find(c => c.id === 'lootbar-kirin-yato' && c.status !== 'draft' && !c.eventActivityId);
  return { ...table, campaigns: table.campaigns.map(c =>
    c.id === 'lootbar-violet-orchid' || c.id === 'lootbar-violet-orchid-main'
      ? { ...c, endAt: kirin?.startAt ?? null } : c) };
}
