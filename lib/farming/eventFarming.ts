import data from '@/data/event-farming.json';
import type { FarmingMaterial } from './farmingTypes';

/** Keep windows in the page payload so an open tab follows stage openings/closures. */
export function getEventFarmingMaterials(): FarmingMaterial[] {
  const materials = new Map<string, FarmingMaterial>();
  for (const drop of data.drops) {
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
