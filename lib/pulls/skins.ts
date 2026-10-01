import { pullArtworkUrl } from './artwork';
import { parsePrices } from '../skins/skinPrice';
import type { Skin } from '../skins/skinTypes';

/** skinId: the game's id for the outfit, which an imported account owns it by (lib/account).
 *  Absent in a release exported before it was added. */
export interface PlannedSkin { id: string; name: string; operator: string; image: string | null; op: number; releaseDate?: string; skinId?: string }
/** Share the catalogue's actual prices and resolved artwork. Free, certificate,
 * redemption and unknown-price outfits are not OP purchases. */
export function pullSkinCatalogue(skins: readonly Skin[], releaseDates: ReadonlyMap<string, string> = new Map()): PlannedSkin[] {
  return skins.flatMap(skin => {
    const price = parsePrices(skin.howToObtain).find(p => p.currency === 'Originite Prime');
    return price && price.amount > 0 && skin.model ? [{ id: `${skin.model} / ${skin.name}`, name: skin.name, operator: skin.model, image: pullArtworkUrl(skin.image), op: price.amount, releaseDate: releaseDates.get(`${skin.model} / ${skin.name}`) ?? '', ...(skin.skinId ? { skinId: skin.skinId } : {}) }] : [];
  }).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.operator.localeCompare(b.operator) || a.name.localeCompare(b.name));
}
export function skinReservation(ids: readonly string[], catalogue: readonly PlannedSkin[], extra: number) {
  const chosen = new Set(ids);
  const skins = catalogue.filter(skin => chosen.has(skin.id));
  const cost = skins.reduce((sum, skin) => sum + skin.op, 0);
  const missing = [...chosen].filter(id => !catalogue.some(skin => skin.id === id));
  return { skins, cost, reserved: cost + extra, missing };
}

/** Reserve unknown-date purchases up front; check dated selections cumulatively
 * at their earliest known shop closing date, never counting the same skin twice. */
export function skinPurchasePlan(skins: PlannedSkin[], collections: import('./skinCollections').SkinCollection[], extra: number) {
  const windows = new Map<string, { collection: import('./skinCollections').SkinCollection; end: string; cost: number; reserved: number }>();
  const unscheduled: PlannedSkin[] = [];
  for (const skin of skins) {
    const collection = collections.filter(value => value.skinIds.includes(skin.id)).sort((a, b) => a.end.localeCompare(b.end))[0];
    if (!collection) { unscheduled.push(skin); continue; }
    const row = windows.get(collection.id) ?? { collection, end: collection.end, cost: 0, reserved: 0 };
    row.cost += skin.op;
    windows.set(collection.id, row);
  }
  let reserved = extra + unscheduled.reduce((sum, skin) => sum + skin.op, 0);
  const ordered = [...windows.values()].sort((a, b) => a.end.localeCompare(b.end));
  for (const row of ordered) { reserved += row.cost; row.reserved = reserved; }
  return { windows: ordered, unscheduled };
}
