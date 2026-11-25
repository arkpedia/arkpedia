export const pollNames = {
  'pull-or-skip': 'Pull or Skip',
  'favourite-skins': 'Arkpedia Drip Awards',
  'power-scale': 'Power Scale',
  'endfield-pull-or-skip': 'Pull or Skip – Endfield 1.7 & 2.0 Livestream',
} as const;
export type PollId = keyof typeof pollNames;
export type ResultsMode = 'live' | 'closed' | 'hidden';
export const placementLabels = {
  auto: 'Feature for 7 days, then archive',
  featured: 'Keep in Open now',
  archive: 'Move to Previous results',
} as const;
export type ClosedPlacement = keyof typeof placementLabels;
export interface PollSettings {
  id: PollId;
  visible: boolean;
  results: ResultsMode;
  closesAt: number | null;
  closedPlacement: ClosedPlacement;
  revision: number;
}
export interface PublicPoll { open: boolean; results: boolean; closesAt: number | null; resultsAfterClose: boolean; featured: boolean }
export type PublicPolls = Partial<Record<PollId, PublicPoll>>;
export function publicPoll(setting: PollSettings, now: number): PublicPoll {
  const open = setting.id !== 'power-scale' && (setting.closesAt === null || now < setting.closesAt);
  const recentlyClosed = setting.closesAt !== null && now - setting.closesAt < 7 * 24 * 60 * 60 * 1000;
  return {
    open: setting.visible && open,
    results: setting.visible && (setting.results === 'live' || setting.results === 'closed' && !open),
    closesAt: setting.closesAt,
    resultsAfterClose: setting.visible && open && setting.results === 'closed' && setting.closesAt !== null,
    featured: setting.visible && (open || setting.closedPlacement === 'featured' || setting.closedPlacement === 'auto' && recentlyClosed),
  };
}
// Editors already open during a rollout can still save the fields they know about.
export type PollSettingsUpdate = Omit<PollSettings, 'closedPlacement'> & { closedPlacement?: ClosedPlacement };
export function validPollSettings(value: unknown): value is PollSettingsUpdate {
  if (!value || typeof value !== 'object') return false;
  const s = value as PollSettings;
  return typeof s.id === 'string' && Object.hasOwn(pollNames, s.id) && typeof s.visible === 'boolean' && ['live','closed','hidden'].includes(s.results)
    && (s.closedPlacement === undefined || typeof s.closedPlacement === 'string' && Object.hasOwn(placementLabels, s.closedPlacement))
    && (s.closesAt === null || Number.isSafeInteger(s.closesAt) && Number.isFinite(new Date(s.closesAt).getTime()))
    && (s.id !== 'power-scale' || s.closesAt === null && s.results !== 'closed')
    && Number.isSafeInteger(s.revision) && s.revision >= 0;
}

/** Bundled, read-only site builds have no editor or persistent poll settings. */
export function defaultPollSettings(): PollSettings[] {
  return (Object.keys(pollNames) as PollId[]).map(id => ({id,visible:id !== 'endfield-pull-or-skip',results:'live',closesAt:null,closedPlacement:'auto',revision:0}));
}
