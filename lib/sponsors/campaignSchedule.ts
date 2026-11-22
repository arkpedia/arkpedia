import { eventReleaseTiming, type ReleaseTiming, type TimingEvidence } from '../time/releaseTiming';
import { isSponsorInstant, type SponsorCampaign } from './campaigns';

export interface CampaignEvent {
  id: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
}

export interface SponsorEvent {
  activityId?: string;
  name?: string;
  cn?: { dateRange?: string | null };
  global?: TimingEvidence & { endAt?: string | null; note?: string | null; releaseTiming?: ReleaseTiming };
}

export function campaignEventOptions(events: SponsorEvent[]): CampaignEvent[] {
  return events.flatMap(({ activityId, name, global, cn }) => {
    if (!activityId) return [];
    const confirmed = global && isSponsorInstant(global.startAt) && isSponsorInstant(global.endAt)
      && Date.parse(global.startAt) < Date.parse(global.endAt) && eventReleaseTiming(global, !!cn?.dateRange) === 'confirmed';
    return [{ id: activityId, name: name ?? activityId, startAt: confirmed ? global.startAt! : null, endAt: confirmed ? global.endAt! : null }];
  });
}

export function samePlacements(a: SponsorCampaign, b: SponsorCampaign) {
  return a.placements.length === b.placements.length && a.placements.every(p => b.placements.includes(p));
}

/** Resolve the incoming window and outgoing close from the same published schedule.
 * Drafts and paused successors never alter a live campaign. An unknown opening
 * keeps its predecessor eligible; unrelated campaigns continue their rotation. */
export function scheduledCampaigns(campaigns: SponsorCampaign[], events: CampaignEvent[]): SponsorCampaign[] {
  const windows = new Map(events.map(event => [event.id, event]));
  const byId = new Map(campaigns.map(c => [c.id, c]));
  const handoffs = new Map<string, string | null>();
  for (const next of campaigns) {
    const previous = next.replacesCampaignId && byId.get(next.replacesCampaignId);
    if (next.status !== 'active' || !next.eventActivityId || !previous || !samePlacements(previous, next)) continue;
    const opens = windows.get(next.eventActivityId)?.startAt ?? null;
    const current = handoffs.get(previous.id);
    if (!current || (opens && Date.parse(opens) < Date.parse(current))) handoffs.set(previous.id, opens);
  }
  return campaigns.flatMap(c => {
    let resolved = c;
    if (c.eventActivityId && c.status !== 'draft') {
      const event = windows.get(c.eventActivityId);
      if (!event?.startAt || !event.endAt) return [];
      const { eventActivityId: _event, replacesCampaignId: _previous, ...art } = c;
      resolved = { ...art, startAt: event.startAt, endAt: event.endAt };
    }
    return [handoffs.has(c.id) ? { ...resolved, endAt: handoffs.get(c.id) ?? null } : resolved];
  });
}
