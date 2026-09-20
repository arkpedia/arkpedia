import shopRotations from '../../data/skin-shop-rotations.json';
import { getSkinsForEvent } from '../schedule/scheduleSkinMatch';
import type { ScheduleEvent } from '../schedule/scheduleTypes';
import type { Skin } from '../skins/skinTypes';
import type { PlannedSkin } from './skins';

export interface SkinCollection {
  id: string; name: string; start: string; end: string; estimated: boolean;
  skinIds: string[]; featuredIds: string[];
  source?: string; sourceRegion?: string;
}
const isoDate = (text: string) => {
  const match = text.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
};
export interface SkinShopSource {
  event: string; source: string; sourceRegion: string; eventStart: string;
  rotations: { label: string; start: string; end: string; dateBasis: string; new: string[]; returning: string[] }[];
}
const day = 86_400_000;
const shiftDate = (date: string, offset: number) => new Date(Date.parse(`${date}T00:00:00Z`) + offset).toISOString().slice(0, 10);

/** Only explicit shop inventories establish availability. A release association,
 * rerun, or Fashion Review flag is not evidence that an outfit is sold for OP.
 * CN rotations follow the scheduled Global event opening, retaining each shop's
 * own offsets. Both inventory and timing remain estimates until verified Global. */
export function pullSkinCollections(events: ScheduleEvent[], _skins: Skin[], catalogue: PlannedSkin[], today: string, predicted: ReadonlySet<string> = new Set(), sources: SkinShopSource[] = shopRotations.entries): SkinCollection[] {
  const paid = new Set(catalogue.map(skin => skin.id));
  return sources.flatMap(source => {
    const event = events.find(event => event.name === source.event);
    if (!event) return [];
    return (event.global.dateRange || '').split(';').flatMap(window => {
      const [eventStart, eventEnd] = window.split(/[–—]/).map(isoDate);
      if (!eventStart || !eventEnd || eventEnd < eventStart) return [];
      const offset = Date.parse(`${eventStart}T00:00:00Z`) - Date.parse(`${source.eventStart}T00:00:00Z`);
      if (!Number.isFinite(offset) || offset % day) throw new Error(`Invalid shop reference date: ${source.event}`);
      const returning = source.rotations.filter(rotation => !rotation.new.length && rotation.returning.length);
      return source.rotations.flatMap(rotation => {
        const start = shiftDate(rotation.start, offset);
        const end = shiftDate(rotation.end, offset);
        if (end < start) throw new Error(`Invalid shop window: ${source.event} / ${rotation.label}`);
        // Filter the shop, not the event: outfits may remain on sale afterwards.
        if (end < today) return [];
        const skinIds = [...new Set([...rotation.new, ...rotation.returning])];
        for (const id of skinIds) if (!paid.has(id)) throw new Error(`Shop outfit missing OP metadata: ${id}`);
        return skinIds.length ? [{
          id: `${event.name} / ${eventStart} / ${rotation.label}`,
          name: `${event.name} · ${rotation.new.length === 0 ? `Returning outfits${returning.length > 1 ? ` — batch ${returning.indexOf(rotation) + 1}` : ''}` : rotation.label}`,
          source: source.source, sourceRegion: source.sourceRegion,
          start, end,
          estimated: source.sourceRegion !== 'global' || rotation.dateBasis !== 'shop' || predicted.has(event.name),
          skinIds, featuredIds: rotation.new,
        }] : [];
      });
    });
  }).sort((a, b) => a.start.localeCompare(b.start) || b.featuredIds.length - a.featuredIds.length || a.name.localeCompare(b.name));
}

/** Original release dates, not the next rerun/Fashion Review shop window.
 * Prefer the Global debut where known, with CN as a fallback for unreleased
 * outfits. A skin introduced during a rerun must not inherit the original run. */
export function skinReleaseDates(events: ScheduleEvent[], skins: Skin[]): Map<string, string> {
  const dates = new Map<string, string>();
  const names = events.map(event => event.name);
  for (const region of ['global', 'cn'] as const) {
    const regional = new Map<string, string>();
    for (const event of events) {
      const start = isoDate((event[region].dateRange || '').split(/[–—;]/)[0]);
      if (!start) continue;
      for (const skin of getSkinsForEvent(event.name, skins, names)) {
        if (/\brerun\b/i.test(skin.release || '') && !/\brerun\b/i.test(event.name)) continue;
        const id = `${skin.model} / ${skin.name}`;
        if (!regional.has(id) || start < regional.get(id)!) regional.set(id, start);
      }
    }
    for (const [id, date] of regional) if (!dates.has(id)) dates.set(id, date);
  }
  return dates;
}
