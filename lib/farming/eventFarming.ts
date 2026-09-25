import type { FarmingMaterial } from './farmingTypes';

/** One row of data/event-farming.json's drops. */
export interface EventFarmingDrop { material: string; stage: string; startAt: string; endAt: string }

/** Keep windows in the page payload so an open tab follows stage openings/closures.
 *  `drops` is the release's data/event-farming.json, handed in by the page's data builder:
 *  required, so browser code that uses this module never compiles the table in. */
export function getEventFarmingMaterials(drops: readonly EventFarmingDrop[]): FarmingMaterial[] {
  const materials = new Map<string, FarmingMaterial>();
  for (const drop of drops) {
    const material = materials.get(drop.material) ?? {
      name: drop.material, icon: `/material-icons/${drop.material.replace(/[\\/*?:"<>|]/g, '').trim()}.webp`, stages: [],
    };
    material.stages.push({ label: drop.stage, kind: 'eventActive', startAt: drop.startAt, endAt: drop.endAt });
    materials.set(drop.material, material);
  }
  return [...materials.values()];
}

export function activeEventFarming(materials: FarmingMaterial[], now: number): FarmingMaterial[] {
  return materials.flatMap(material => {
    const stages = material.stages.filter(stage => stage.startAt && stage.endAt
      && Date.parse(stage.startAt) <= now && now < Date.parse(stage.endAt));
    return stages.length ? [{ ...material, stages }] : [];
  });
}
