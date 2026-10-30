/**
 * The reference sheet's 2-5-2 variant ("a focus on boosting up the factories' productivity"), on the 2-5-2 max
 * right layout: Trading Posts prod1 (lv3) and prod4 (lv2); factories prod2 and prod5 (lv3), prod7, prod8 and
 * prod9 (lv2); Power Plants prod3 and prod6. Read from the user's screenshot of the sheet (2026-10-30).
 *
 * Three formations, except Trading Post 1, which "cycles between formation 1 & 2" on its own, so the whole
 * rotation repeats every six staffing changes. Fiammetta stays in a dorm and refills Shamare, Tequila and
 * Proviso in turn; Virtuosa, Czerny, Iris and Ifrit live in the dorms; Saria (Workshop) and Magallan (Training
 * Room) are there for Muelsyse's and Nasti's skills. Wisadel, the sheet's alternative to Saileach, is not in the
 * catalogue yet, so Saileach is used; "Ch'en" in the Reception Room is read as Ch'en the Dawnstreak.
 */
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { FactoryProducts, SlotAssignment } from '../../lib/base/baseTypes';
import { assignmentsOf } from './sheet-342';

export const SHEET252_FACILITIES = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
export const SHEET252_PRODUCTS: FactoryProducts = { prod2: 'Precious Metals', prod5: 'Battle Records', prod7: 'Precious Metals', prod8: 'Battle Records', prod9: 'Precious Metals' };
export const SHEET252_REFILL = ['Shamare', 'Tequila', 'Proviso'];
export const SHEET252_DORM = ['Fiammetta', 'Virtuosa', 'Czerny', 'Iris', 'Ifrit'];

/** Formation 1..3 for every room but Trading Post 1. */
export const SHEET252_FORMATIONS: Record<string, string[]>[] = [
  {
    controlCenter: ['Flametail', 'Viviana', 'Eunectes', 'Hoshiguma the Breacher', 'Swire'],
    prod4: ['Proviso', 'Vigil'],
    prod2: ['Bryophyta', 'Thorns the Lodestar', 'Gravel'], prod5: ['Wild Mane', 'Fartooth', 'Ashlock'],
    prod7: ['Aroma', 'Nasti'], prod8: ['Conviction', 'Crownslayer'], prod9: ['Weedy', 'Purestream'],
    prod3: ['Greyy the Lightningbearer'], prod6: ['Lancet-2'],
    receptionRoom: ['Sankta Miksaparato', 'Ines'], office: ['Penance'],
  },
  {
    controlCenter: ['Dusk', 'Ling', 'Eunectes', 'Flametail', 'Viviana'],
    prod4: ['Proviso', 'Ebenholz'],
    prod2: ['Bryophyta', 'Thorns the Lodestar', 'Gravel'], prod5: ['Wild Mane', 'Fartooth', 'Ashlock'],
    prod7: ['Weedy', 'Purestream'], prod8: ['Conviction', 'FEater'], prod9: ['Rosmontis', 'Waai Fu'],
    prod3: ['Greyy the Lightningbearer'], prod6: ['Lancet-2'],
    receptionRoom: ['Sankta Miksaparato', "Ch'en the Dawnstreak"], office: ['Whisperain'],
  },
  {
    controlCenter: ['Dusk', 'Ling', 'Saileach', 'Hoshiguma the Breacher', 'Swire'],
    prod4: ['Proviso', 'Ebenholz'],
    prod2: ['Nasti', 'Silence the Paradigmatic', 'Dorothy'], prod5: ['Vermeil', 'Pallas', 'Scene'],
    prod7: ['Aroma', 'Mayer'], prod8: ['FEater', 'Crownslayer'], prod9: ['Rosmontis', 'Waai Fu'],
    prod3: ['Greyy'], prod6: ['Muelsyse'],
    receptionRoom: ["Ch'en the Dawnstreak", 'Ines'], office: ['Whisperain'],
  },
];
export const SHEET252_TP1 = [['Bibeak', 'Shamare', 'Tequila'], ['Kafka', 'Shamare', 'Tequila']];
export const SHEET252_FIXED = { workshop: ['Saria'], trainingRoom: ['Magallan'] };

/** Every name the sheet uses. */
export const SHEET252_NAMES = [...new Set([...SHEET252_FORMATIONS.flatMap(f => Object.values(f).flat()), ...SHEET252_TP1.flat(), ...SHEET252_DORM, ...Object.values(SHEET252_FIXED).flat()])];

/** The sheet's rotation as six staffing changes: formation s % 3, Trading Post 1's team s % 2. Fiammetta heads the
 * first dorm, the other residents follow, and the free beds go to whoever is off shift (they are "free for all"). */
export function sheet252Shifts(roster: Record<string, { eliteLevel: SlotAssignment['eliteLevel']; level: number }>, refill: string[] = SHEET252_REFILL) {
  const dorms = SHEET252_FACILITIES.filter(f => f.kind === 'dormitory');
  const everyone = SHEET252_NAMES.filter(n => !SHEET252_DORM.includes(n) && !Object.values(SHEET252_FIXED).flat().includes(n));
  const teamsAt = (s: number): Record<string, string[]> => ({ ...SHEET252_FORMATIONS[s % 3], prod1: SHEET252_TP1[s % 2], ...SHEET252_FIXED });
  return Array.from({ length: 6 }, (_, s) => {
    const teams = teamsAt(s);
    const working = new Set(Object.values(teams).flat());
    const justWorked = new Set(Object.values(teamsAt((s + 5) % 6)).flat());
    const queue = [...SHEET252_DORM, ...everyone.filter(n => !working.has(n)).sort((x, y) => Number(justWorked.has(y)) - Number(justWorked.has(x)))];
    for (const d of dorms) teams[d.id] = queue.splice(0, d.capacity);
    return { assignments: assignmentsOf(teams, roster), factoryProducts: SHEET252_PRODUCTS, logins: 1, ...(refill.length ? { refill } : {}) };
  });
}
