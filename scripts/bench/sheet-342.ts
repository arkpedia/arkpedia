/**
 * The reference spreadsheet's 3-4-2 base ("342 Max-Right"), three formations, as placements.
 * The teams are read from the sheet's CSV export; the sheet's own per-room numbers sit beside
 * them so the calculator can be checked against the sheet and the optimizer measured against it.
 *
 * Rooms in the 3-4-2 layout (accountOptimizer's '3-4-2'): Trading Posts prod1 (lv3), prod4 and
 * prod8 (lv2); Factories prod2 and prod5 (lv3), prod7 and prod9 (lv2); Power Plants prod3, prod6.
 */
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { BaseAssignments, FactoryProducts, SlotAssignment } from '../../lib/base/baseTypes';

export const SHEET_SPOTS = { ...presetSpots('2-5-2-right'), prod8: 'tradingPost' as const };
export const SHEET_LEVELS = presetLevels('2-5-2-right');
export const SHEET_FACILITIES = getFacilities(SHEET_SPOTS, SHEET_LEVELS);

export interface SheetFormation {
  name: string;
  teams: Record<string, string[]>;
  /** The product each factory makes while this formation works. */
  products: FactoryProducts;
  /** The sheet's per-room daily figure (LMD for Trading Posts, EXP or gold for factories). */
  sheet: Record<string, number>;
}

const TP = { A: 'prod4', B: 'prod1', C: 'prod8' }; // the sheet's lv2 / lv3 / lv2 Trading Posts
const FAC = { flex: 'prod2', gold3: 'prod5', gold2: 'prod7', flex2: 'prod9' };

const support = (cc: string[], office: string[], dorm: string[]) => ({ controlCenter: cc, office, dormitory1: dorm });

/** Formation 1..3, EXP-flex variant: the lv3 flex factory makes EXP, the lv2 flex factory gold. */
export const FORMATIONS: SheetFormation[] = [
  {
    name: 'Formation 1',
    teams: {
      ...support(['Dusk', 'Ling', 'Chongyue', 'Saileach', 'Swire'], ['Mulberry'], ['Fiammetta', 'Senshi', 'Iris', 'Czerny']),
      trainingRoom: ['Ulpianus'],
      [TP.A]: ['Proviso', 'Mr. Nothing'], [TP.B]: ['Shamare', 'Bibeak', 'Tequila'], [TP.C]: ['Vigil', 'Underflow'],
      [FAC.flex]: ['Vermeil', 'Scene', 'Pallas'], [FAC.gold3]: ['Bryophyta', 'Thorns the Lodestar', 'Gravel'],
      [FAC.gold2]: ['Dorothy', 'Silence the Paradigmatic'], [FAC.flex2]: ['Rosmontis', 'Marcille'],
      prod3: ['Muelsyse', 'Goldenglow'], prod6: [],
    },
    products: { prod2: 'Battle Records', prod5: 'Precious Metals', prod7: 'Precious Metals', prod9: 'Precious Metals' },
    sheet: { [TP.A]: 35138.03, [TP.B]: 25479.45, [TP.C]: 19504.42, [FAC.flex]: 16720, [FAC.gold3]: 41.6, [FAC.gold2]: 43.4, [FAC.flex2]: 32.8 },
  },
  {
    name: 'Formation 2',
    teams: {
      ...support(['Dusk', 'Ling', 'Chongyue', 'Saileach', 'Eunectes'], ['Mulberry'], ['Fiammetta', 'Senshi', 'Iris', 'Czerny']),
      [TP.A]: ['Proviso', 'Mr. Nothing'], [TP.B]: ['Shamare', 'Bibeak', 'Tequila'], [TP.C]: ['Lemuen', 'Exusiai'],
      [FAC.flex]: ['Vermeil', 'Scene', 'Pallas'], [FAC.gold3]: ['Dorothy', 'Silence the Paradigmatic', 'Waai Fu'],
      [FAC.gold2]: ['Weedy', 'Purestream'], [FAC.flex2]: ['Bubble', 'Vulcan'],
      prod3: ['Greyy the Lightningbearer', 'Lancet-2'], prod6: [],
    },
    products: { prod2: 'Battle Records', prod5: 'Precious Metals', prod7: 'Precious Metals', prod9: 'Precious Metals' },
    sheet: { [TP.A]: 33836.62, [TP.B]: 24587.67, [TP.C]: 18785.84, [FAC.flex]: 18560, [FAC.gold3]: 46.4, [FAC.gold2]: 44.0, [FAC.flex2]: 33.4 },
  },
  {
    name: 'Formation 3',
    teams: {
      ...support(['Flametail', 'Viviana', 'Hoshiguma the Breacher', 'Swire', 'Eunectes'], ['Penance'], ['Fiammetta']),
      [TP.A]: ['Proviso', 'Vigil'], [TP.B]: ['Shamare', 'Bibeak', 'Tequila'], [TP.C]: ['Lemuen', 'Exusiai'],
      [FAC.flex]: ['Fartooth', 'Ashlock', 'Wild Mane'], [FAC.gold3]: ['Bryophyta', 'Thorns the Lodestar', 'Gravel'],
      [FAC.gold2]: ['Weedy', 'Purestream'], [FAC.flex2]: ['Bubble', 'Vulcan'],
      prod3: ['Greyy the Lightningbearer', 'Lancet-2'], prod6: [],
    },
    products: { prod2: 'Battle Records', prod5: 'Precious Metals', prod7: 'Precious Metals', prod9: 'Precious Metals' },
    sheet: { [TP.A]: 27701.41, [TP.B]: 25479.45, [TP.C]: 19504.42 },
  },
];

export const everyoneMaxed = (operators: { name: string; rarity?: number | null }[]): Record<string, { eliteLevel: 'Base' | 'Elite 1' | 'Elite 2'; level: number }> =>
  Object.fromEntries(operators.map(o => [o.name, (o.rarity ?? 0) >= 3 ? { eliteLevel: 'Elite 2' as const, level: 90 } : { eliteLevel: 'Base' as const, level: 30 }]));

/** The sheet lists only the operators that matter in each room; every other bed is free for anyone, and an
 * occupied bed still counts for dorm head-count skills (Mr. Nothing's Worldly Plight, +1 per occupant). Fill
 * each empty bed with someone from the other formations who is off shift in this one. Dorms hold 5 at every level. */
export function withFreeBeds(index: number): Record<string, string[]> {
  const teams = FORMATIONS[index].teams;
  const busy = new Set(Object.values(teams).flat());
  const spare = [...new Set(FORMATIONS.flatMap(f => Object.values(f.teams).flat()))].filter(n => !busy.has(n));
  const out: Record<string, string[]> = { ...teams };
  for (const d of SHEET_FACILITIES.filter(f => f.kind === 'dormitory')) out[d.id] = [...(out[d.id] ?? []), ...spare.splice(0, d.capacity - (out[d.id]?.length ?? 0))];
  return out;
}

/** The sheet's own rotation: its three formations in turn, every free bed filled, Fiammetta refilling `refill`. */
export function sheetShifts(refill: string[], roster: Record<string, { eliteLevel: SlotAssignment['eliteLevel']; level: number }>) {
  return FORMATIONS.map((f, i) => ({ assignments: assignmentsOf(withFreeBeds(i), roster), factoryProducts: f.products, logins: 1, ...(refill.length ? { refill } : {}) }));
}
/** Kukki's note: Fiammetta refills the Trading Post core in turn. */
export const SHEET_REFILL = ['Shamare', 'Bibeak', 'Tequila', 'Proviso', 'Mr. Nothing'];

export function assignmentsOf(teams: Record<string, string[]>, roster: Record<string, { eliteLevel: SlotAssignment['eliteLevel']; level: number }>): BaseAssignments {
  return Object.fromEntries(Object.entries(teams).map(([room, names]) => [room, names.map(n => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level }))]));
}
