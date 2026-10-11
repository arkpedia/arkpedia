/** Recommendation inputs are release data; ownership comes only from the imported account. */
export interface SelectorCandidate {
  name: string;
  id: string;
  caster: boolean;
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
/** Community averages use the Power Scale's existing nearest-tenth display convention. */
export function ratingPoints(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 5.8 || value > 7.2) return null;
  const tenth = Math.round(value * 10);
  return tenth <= 62 ? -1 : tenth <= 65 ? 0 : tenth <= 68 ? 1 : 2;
}
export function recommendation(candidate: SelectorCandidate, roster: SelectorCandidate[], ownedNames: readonly string[] | null): Recommendation {
  const own = new Set(ownedNames ?? []);
  const owned = roster.filter(op => own.has(op.name));
  const gameDestroyer = candidate.kukkikaze !== null && candidate.kukkikaze >= 7 && candidate.kukkikaze <= 7.2;
  const knownOwnedRatings = owned.every(op => op.id === candidate.id || ratingPoints(op.kukkikaze) !== null);
  const lines: Recommendation['lines'] = [];
  const add = (label: string, points: number) => lines.push({ label, points });
  const kukki = ratingPoints(candidate.kukkikaze), community = ratingPoints(candidate.community);
  if (kukki !== null) add(community === null ? 'Kukkikaze rating ×2 (no community rating)' : 'Kukkikaze rating', kukki * (community === null ? 2 : 1));
  if (community !== null) add(kukki === null ? 'Community rating ×2 (no Kukkikaze rating)' : 'Community rating', community * (kukki === null ? 2 : 1));
  add(`${candidate.mainSkills} main priority skill${candidate.mainSkills === 1 ? '' : 's'}`, candidate.mainSkills);
  add(`${candidate.subSkills} sub priority skill${candidate.subSkills === 1 ? '' : 's'}`, candidate.subSkills * .25);
  if (candidate.isModule) add('Integrated Strategies module', .5);
  if (candidate.raModule) add('Reclamation Algorithm module', .5);
  if (ownedNames !== null) {
    if (candidate.arts && owned.filter(op => op.caster).length <= 3) add('Arts coverage: 3 or fewer owned 6★ Casters', 1);
    if (candidate.trueDamage && !owned.some(op => op.trueDamage)) add('True damage coverage: no owned 6★ dealer', 1);
    if (gameDestroyer && knownOwnedRatings
      && !owned.some(op => op.id !== candidate.id && op.kukkikaze !== null && op.kukkikaze >= 7 && op.kukkikaze <= 7.2)) add('Game-Destroyer: no other owned 7.0–7.2 operator', 1);
  }
  const total = lines.reduce((sum, line) => sum + line.points, 0);
  return { total, complete: (kukki !== null || community !== null) && (ownedNames === null || !gameDestroyer || knownOwnedRatings), owned: own.has(candidate.name), personalized: ownedNames !== null,
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
