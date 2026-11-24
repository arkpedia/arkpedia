export const pollNames = {
  'pull-or-skip': 'Pull or Skip',
  'favourite-skins': 'Arkpedia Drip Awards',
  'power-scale': 'Power Scale',
  'endfield-pull-or-skip': 'Pull or Skip · Endfield',
} as const;
export type PollId = keyof typeof pollNames;
export type ResultsMode = 'live' | 'closed' | 'hidden';
export interface PollSettings {
  id: PollId;
  visible: boolean;
  results: ResultsMode;
  closesAt: number | null;
  revision: number;
}
export interface PublicPoll { open: boolean; results: boolean; closesAt: number | null }
export type PublicPolls = Partial<Record<PollId, PublicPoll>>;
export function publicPoll(setting: PollSettings, now: number): PublicPoll {
  const open = setting.id !== 'power-scale' && (setting.closesAt === null || now < setting.closesAt);
  return { open: open && setting.visible, results: setting.visible && (setting.results === 'live' || setting.results === 'closed' && !open), closesAt: setting.closesAt };
}
export function validPollSettings(value: unknown): value is PollSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as PollSettings;
  return typeof s.id === 'string' && Object.hasOwn(pollNames, s.id) && typeof s.visible === 'boolean' && ['live','closed','hidden'].includes(s.results)
    && (s.closesAt === null || Number.isSafeInteger(s.closesAt) && Number.isFinite(new Date(s.closesAt).getTime()))
    && (s.id !== 'power-scale' || s.closesAt === null && s.results !== 'closed')
    && Number.isSafeInteger(s.revision) && s.revision >= 0;
}

/** Bundled, read-only site builds have no editor or persistent poll settings. */
export function defaultPollSettings(): PollSettings[] {
  return (Object.keys(pollNames) as PollId[]).map(id => ({id,visible:id !== 'endfield-pull-or-skip',results:'live',closesAt:null,revision:0}));
}
