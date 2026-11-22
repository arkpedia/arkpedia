import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { checkSponsorCampaigns, type SponsorArtwork, type SponsorCampaign } from '@/lib/sponsors/campaigns';

export interface CampaignEdit {
  id: string;
  revision: number;
  followsRelease: boolean;
  campaign: SponsorCampaign | null;
}

export interface CampaignRevision {
  revision: number;
  actor: string;
  updatedAt: string;
  changes: string[];
  campaign: SponsorCampaign | null;
}

export interface CampaignHistoryPage {
  versions: CampaignRevision[];
  nextBefore: number | null;
}

function sameArtwork(a?: SponsorArtwork, b?: SponsorArtwork) {
  return a?.image === b?.image && a?.width === b?.width && a?.height === b?.height && a?.alt === b?.alt;
}

function revisionChanges(current: SponsorCampaign | null, previous: SponsorCampaign | null, timingChanged: boolean) {
  if (!current || !previous) return [];
  const changes: string[] = [];
  if (!sameArtwork(current.mainArtwork ?? undefined, previous.mainArtwork ?? undefined)) changes.push('Main artwork');
  if (!sameArtwork(current, previous)) changes.push('Page artwork');
  if (!sameArtwork(current.mobileArtwork, previous.mobileArtwork)) changes.push('Mobile artwork');
  if (current.url !== previous.url) changes.push('Destination');
  if (current.status !== previous.status) changes.push('Status');
  if (timingChanged || current.startAt !== previous.startAt || current.endAt !== previous.endAt ||
      current.eventActivityId !== previous.eventActivityId || current.replacesCampaignId !== previous.replacesCampaignId) changes.push('Timing');
  if (current.sponsor !== previous.sponsor) changes.push('Sponsor name');
  if (current.placements.join() !== previous.placements.join()) changes.push('Placements');
  return changes;
}

export async function campaignHistory(db: D1Database, id: string, before?: number): Promise<CampaignHistoryPage> {
  const limit = 20;
  const { results } = await db.prepare(`SELECT revision, actor, updated_at, follows_release, campaign_json
    FROM campaign_editor_revisions WHERE campaign_id = ? AND revision < ?
    ORDER BY revision DESC LIMIT ?`).bind(id, before ?? Number.MAX_SAFE_INTEGER, limit + 1)
    .all<{ revision: number; actor: string; updated_at: string; follows_release: number; campaign_json: string | null }>();
  const snapshots = results.map(row => row.campaign_json ? JSON.parse(row.campaign_json) as SponsorCampaign : null);
  const versions = results.slice(0, limit).map((row, index) => ({
    revision: row.revision, actor: row.actor, updatedAt: row.updated_at,
    campaign: snapshots[index], changes: revisionChanges(snapshots[index], snapshots[index + 1] ?? null,
      row.follows_release !== results[index + 1]?.follows_release),
  }));
  return { versions, nextBefore: results.length > limit ? versions[limit - 1].revision : null };
}

export interface RecentCampaignChange {
  id: string;
  sponsor: string;
  revision: number;
  actor: string;
  updatedAt: string;
  cleared: boolean;
  changes: string[];
}

const latestCampaignRevisions = `(SELECT campaign_id, MAX(revision) AS revision
  FROM campaign_editor_revisions GROUP BY campaign_id)`;

export async function recentCampaignChanges(db: D1Database): Promise<RecentCampaignChange[]> {
  const { results } = await db.prepare(`SELECT r.*, p.campaign_json AS previous_json, p.follows_release AS previous_timing
    FROM campaign_editor_revisions r JOIN ${latestCampaignRevisions} latest USING (campaign_id, revision)
    LEFT JOIN campaign_editor_revisions p ON p.campaign_id = r.campaign_id AND p.revision = r.revision - 1
    ORDER BY r.updated_at DESC, r.campaign_id`).all<{
    campaign_id: string; revision: number; actor: string; updated_at: string;
    follows_release: number; previous_timing: number | null; campaign_json: string | null; previous_json: string | null;
  }>();
  return results.map(row => {
    const current: SponsorCampaign | null = row.campaign_json ? JSON.parse(row.campaign_json) : null;
    const previous: SponsorCampaign | null = row.previous_json ? JSON.parse(row.previous_json) : null;
    return {
      id: row.campaign_id, sponsor: current?.sponsor ?? previous?.sponsor ?? '', revision: row.revision,
      actor: row.actor, updatedAt: row.updated_at, cleared: !current,
      changes: revisionChanges(current, previous, row.follows_release !== row.previous_timing),
    };
  });
}

export async function campaignEdits(db: D1Database): Promise<CampaignEdit[]> {
  const { results } = await db.prepare(`SELECT r.* FROM campaign_editor_revisions r JOIN
    ${latestCampaignRevisions} latest
    USING (campaign_id, revision) ORDER BY r.updated_at DESC, r.campaign_id`).all<{
    campaign_id: string; revision: number; follows_release: number; campaign_json: string | null;
  }>();
  return results.map(row => ({
    id: row.campaign_id, revision: row.revision, followsRelease: !!row.follows_release,
    campaign: row.campaign_json ? JSON.parse(row.campaign_json) as SponsorCampaign : null,
  }));
}

export function mergeCampaigns(base: SponsorCampaign[], edits: CampaignEdit[]) {
  const byId = new Map(base.map(c => [c.id, c]));
  const added: SponsorCampaign[] = [];
  for (const { id, followsRelease, campaign } of edits) {
    if (!campaign) continue;
    const source = byId.get(id);
    if (followsRelease) {
      if (source) byId.set(id, { ...campaign, startAt: source.startAt, endAt: source.endAt });
    } else if (source) byId.set(id, campaign);
    else added.push(campaign);
  }
  return [...added, ...byId.values()];
}

export class InvalidEdit extends Error {}
export class EditConflict extends Error {}

function storeImage(db: D1Database, encoded: unknown, writes: D1PreparedStatement[]) {
  if (typeof encoded !== 'string' || encoded.length > 819200) throw new InvalidEdit('Choose artwork under 600 KiB.');
  const bytes = Buffer.from(encoded, 'base64');
  const mime = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
    : bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) ? 'image/jpeg'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!mime || bytes.toString('base64') !== encoded) throw new InvalidEdit('Choose a PNG, JPEG or WebP image.');
  const id = crypto.randomUUID();
  writes.push(db.prepare('INSERT INTO campaign_editor_art VALUES (?, ?, ?)').bind(id, mime, Uint8Array.from(bytes).buffer));
  return '/api/sponsor-art/' + id;
}

export async function saveCampaign(db: D1Database, actor: string, body: {
  id: string; revision: number; campaign: SponsorCampaign | null; followsRelease: boolean;
  mainUpload?: string; desktopUpload?: string; mobileUpload?: string;
}) {
  if (!body || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(body.id ?? '') || !Number.isSafeInteger(body.revision)
    || body.revision < 0 || typeof body.followsRelease !== 'boolean') throw new InvalidEdit('Invalid campaign change.');
  const writes: D1PreparedStatement[] = [];
  let campaign = body.campaign;
  if (campaign !== null) {
    if (!campaign || campaign.id !== body.id || (campaign.eventActivityId && body.followsRelease)) throw new InvalidEdit('Invalid campaign.');
    if (body.mainUpload && campaign.mainArtwork) campaign.mainArtwork.image = storeImage(db, body.mainUpload, writes);
    if (body.desktopUpload) campaign.image = storeImage(db, body.desktopUpload, writes);
    if (body.mobileUpload && campaign.mobileArtwork) campaign.mobileArtwork.image = storeImage(db, body.mobileUpload, writes);
    if (!campaign.image && campaign.placements?.length === 1 && campaign.placements[0] === 'home' && campaign.mainArtwork) {
      const { image, width, height, alt } = campaign.mainArtwork;
      campaign = { ...campaign, image, width, height, alt };
    }
    try { campaign = checkSponsorCampaigns({ version: 1, campaigns: [campaign] }).campaigns[0]; }
    catch (error) { throw new InvalidEdit(error instanceof Error ? error.message : 'Invalid campaign.'); }
  }
  const revision = body.revision + 1;
  writes.push(db.prepare(`INSERT INTO campaign_editor_revisions
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(body.id, revision, actor, new Date().toISOString(), Number(body.followsRelease),
      campaign ? JSON.stringify(campaign) : null));
  // A stale writer must roll back artwork too. The primary key rejects competing revisions.
  const current = await db.prepare('SELECT MAX(revision) AS version FROM campaign_editor_revisions WHERE campaign_id = ?')
    .bind(body.id).first<number>('version');
  if ((current ?? 0) !== body.revision) throw new EditConflict();
  try { await db.batch(writes); } catch (error) {
    if (String(error).includes('UNIQUE constraint')) throw new EditConflict();
    throw error;
  }
}

let readerEdits: { db: D1Database; until: number; edits: Promise<CampaignEdit[]> } | undefined;
export function invalidateCampaignEdits() { readerEdits = undefined; }
export function cachedCampaignEdits(db: D1Database) {
  if (readerEdits?.db === db && readerEdits.until > Date.now()) return readerEdits.edits;
  const edits = campaignEdits(db).catch(error => {
    if (readerEdits?.edits === edits) readerEdits = undefined;
    throw error;
  });
  readerEdits = { db, edits, until: Date.now() + 15000 };
  return edits;
}
