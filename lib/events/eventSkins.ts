import type { Skin } from '../skins/skinTypes';
import { skinKey, type ConfirmedSkinWindows, type SkinShopRotations } from '../skins/skinAvailability';
import { getSkinsForEvent } from '../schedule/scheduleSkinMatch';

const identity = (name: string) => name.replace(/\[[^\]]*\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
/** Run-specific inventories override debut text. Fashion Review stays in its own gallery. */
export function eventSkins(name: string, skins: Skin[], names: string[], sources: { confirmed: ConfirmedSkinWindows; rotations: SkinShopRotations }): Skin[] {
  const confirmed = sources.confirmed.entries.filter(entry => identity(entry.event) === identity(name));
  const rotations = sources.rotations.entries.filter(entry => identity(entry.event) === identity(name));
  const complete = confirmed.some(entry => entry.inventoryComplete);
  const ids = new Set([
    ...confirmed.filter(entry => !/fashion review/i.test(entry.label)).flatMap(entry => entry.skinIds),
    ...(complete ? [] : rotations).flatMap(entry => entry.rotations.filter(rotation => !/fashion review/i.test(rotation.label)).flatMap(rotation => [...rotation.new, ...rotation.returning])),
  ]);
  const debut = complete || rotations.length ? [] : getSkinsForEvent(name, skins, names);
  return skins.filter(skin => ids.has(skinKey(skin)) || debut.includes(skin));
}
