import type { FacilityKind } from './baseTypes';

const otherBuildings = new Set<FacilityKind>(['powerPlant', 'factory', 'tradingPost', 'office', 'receptionRoom']);
const mlynarBuildings = new Set<FacilityKind>(['powerPlant', 'office', 'receptionRoom']);

/** Recovery for workers in another building from the Control Center: Banner of Babel, Solitary Light and Business Is
 *  Business compete, the strongest applying (gamedata_const cc.c.room1/room2/skill/sui2_1). Młynar's is +0.1 in Power
 *  Plants, the Office and the Reception Room, and +0.05 per qualifying Control Center skill everywhere. */
export function crossFacilityMoraleRelief(kind: FacilityKind, banner: number, solitaryLight: number, mlynar: { ownRooms: number; everyRoom: number } | null): number {
  if (!otherBuildings.has(kind)) return 0;
  const business = mlynar ? (mlynarBuildings.has(kind) ? mlynar.ownRooms : 0) + mlynar.everyRoom : 0;
  return Math.max(banner, solitaryLight, business);
}
