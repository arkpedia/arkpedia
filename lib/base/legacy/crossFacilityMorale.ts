import type { FacilityKind } from '../baseTypes';

const otherBuildings = new Set<FacilityKind>(['powerPlant', 'factory', 'tradingPost', 'office', 'receptionRoom']);
const mlynarBuildings = new Set<FacilityKind>(['powerPlant', 'office', 'receptionRoom']);
const mlynarSkills = new Set(['Capable Assistance', 'S.W.E.E.P.', 'Snack Network', 'Cleaning Agreement', 'Substitute', 'Necessary Responsibility', 'Guarding', 'Tiny Leader', 'Self-Absorbed', 'Million Dollar Smile', 'Marigold Poetry Gathering', 'Art of Defense', 'New to the Job', 'Drip-Fed Care', 'Chief Engineer']);

/** gamedata_const cc.c.room1/room2/skill/sui2_1 define scope and highest-only comparison. */
export function crossFacilityMoraleRelief(kind: FacilityKind, banner: number, solitaryLight: number, mlynarActive: boolean, ccSkillNames: string[]): number {
  if (!otherBuildings.has(kind)) return 0;
  const mlynar = mlynarActive ? (mlynarBuildings.has(kind) ? 0.1 : 0) + 0.05 * ccSkillNames.filter(name => mlynarSkills.has(name)).length : 0;
  return Math.max(banner, solitaryLight, mlynar);
}
