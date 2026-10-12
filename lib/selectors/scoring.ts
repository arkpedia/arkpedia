import superMetaOperators from '../../config/selector-super-meta.json';

/** Recommendation inputs are release data; ownership comes only from the imported account. */
export interface SelectorCandidate {
  name: string;
  id: string;
  caster: boolean;
  supporter: boolean;
  talentReveal: boolean;
  arts: boolean;
  trueDamage: boolean;
  kukkikaze: number | null;
  community: number | null;
  mainSkills: number;
  subSkills: number;
  isModule: boolean;
  raModule: boolean;
}
export interface Recommendation {
  total: number;
  complete: boolean;
  owned: boolean;
  personalized: boolean;
  tone: 'negative' | 'middle' | 'great';
  lines: { label: string; points: number }[];
}
export interface SelectorPreferences {
  subSkills: boolean;
  arts: boolean | null;
  trueDamage: boolean | null;
  gameDestroyer: boolean | null;
  reveal: boolean | null;
}
export const DEFAULT_SELECTOR_PREFERENCES: SelectorPreferences = { subSkills: false, arts: null, trueDamage: null, gameDestroyer: null, reveal: null };
const superMetaIds = new Set(superMetaOperators.map(op => op.id));
export function isSuperMeta(candidate: SelectorCandidate) {
  return superMetaIds.has(candidate.id) || (candidate.kukkikaze !== null && candidate.kukkikaze >= 7 && candidate.kukkikaze <= 7.2);
}
/** Null keeps a coverage answer linked to the imported account instead of freezing it. */
export function selectorCoverage(roster: SelectorCandidate[], ownedNames: readonly string[] | null) {
  const names = new Set(ownedNames ?? []);
  const owned = roster.filter(op => names.has(op.name));
  return {
    arts: ownedNames !== null && owned.filter(op => op.caster || op.supporter).length <= 3,
    trueDamage: ownedNames !== null && !owned.some(op => op.trueDamage),
    gameDestroyer: ownedNames === null || owned.some(isSuperMeta)
      ? false : owned.some(op => ratingPoints(op.kukkikaze) === null) ? null : true,
    reveal: ownedNames === null || !owned.some(op => op.talentReveal),
  };
}
/** Community averages use the Power Scale's existing nearest-tenth display convention. */
export function ratingPoints(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 5.8 || value > 7.2) return null;
  const tenth = Math.round(value * 10);
  return (tenth - 63) * .25;
}
export function recommendation(candidate: SelectorCandidate, roster: SelectorCandidate[], ownedNames: readonly string[] | null, preferences: SelectorPreferences = DEFAULT_SELECTOR_PREFERENCES): Recommendation {
  const own = new Set(ownedNames ?? []);
  const gameDestroyer = isSuperMeta(candidate);
  const automatic = selectorCoverage(roster, ownedNames);
  const coverage = { arts: preferences.arts ?? automatic.arts, trueDamage: preferences.trueDamage ?? automatic.trueDamage,
    gameDestroyer: preferences.gameDestroyer ?? automatic.gameDestroyer, reveal: preferences.reveal ?? automatic.reveal };
  const lines: Recommendation['lines'] = [];
  const add = (label: string, points: number) => lines.push({ label, points: Math.round(points * 100) / 100 });
  const kukki = ratingPoints(candidate.kukkikaze), community = ratingPoints(candidate.community);
  if (kukki !== null) add(community === null ? 'Kukkikaze rating ×2 (no community rating)' : 'Kukkikaze rating', kukki * (community === null ? 2 : 1));
  if (community !== null) add(kukki === null ? 'Community rating ×2 (no Kukkikaze rating)' : 'Community rating', community * (kukki === null ? 2 : 1));
  add(`${candidate.mainSkills} main priority skill${candidate.mainSkills === 1 ? '' : 's'}`, candidate.mainSkills * .5);
  add(`${candidate.subSkills} sub priority skill${candidate.subSkills === 1 ? '' : 's'}`, preferences.subSkills ? candidate.subSkills * .1 : 0);
  if (candidate.isModule) add('Integrated Strategies module', .5);
  if (candidate.raModule) add('Reclamation Algorithm module', .5);
  if (candidate.talentReveal && coverage.reveal) add('Invisibility reveal talent', .25);
  if (candidate.arts && coverage.arts) add('Arts coverage: lacking Arts dealers', .5);
  if (candidate.trueDamage && coverage.trueDamage) add('True damage coverage: lacking True damage dealers', .5);
  if (gameDestroyer && coverage.gameDestroyer) add('Super-meta coverage: lacking a super-meta operator', 1);
  const total = Math.round(lines.reduce((sum, line) => sum + line.points, 0) * 100) / 100;
  return { total, complete: (kukki !== null || community !== null) && (!gameDestroyer || coverage.gameDestroyer !== null), owned: own.has(candidate.name), personalized: ownedNames !== null || preferences.subSkills || [preferences.arts, preferences.trueDamage, preferences.gameDestroyer, preferences.reveal].some(value => value !== null),
    tone: total < 0 ? 'negative' : total < 5 ? 'middle' : 'great', lines };
}
export const pointLabel = (points: number) => `${points > 0 ? '+' : ''}${points}`;

/** Rank the displayed total, keeping equal scores alphabetical and unscored entries last. */
export function rankByRecommendation<T extends { name: string }>(operators: readonly T[], scores?: Record<string, Recommendation>): T[] {
  if (!scores) return [...operators];
  return [...operators].sort((a, b) =>
    ((scores[b.name]?.total ?? -Infinity) - (scores[a.name]?.total ?? -Infinity))
    || a.name.localeCompare(b.name, 'en'));
}
