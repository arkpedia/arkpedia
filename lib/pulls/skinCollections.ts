import confirmedAvailability from '../../data/skin-availability-windows.json';
import shopRotations from '../../data/skin-shop-rotations.json';
import { getSkinsForEvent } from '../schedule/scheduleSkinMatch';
import type { ScheduleEvent } from '../schedule/scheduleTypes';
import type { Skin } from '../skins/skinTypes';
import type { PlannedSkin } from './skins';

export interface SkinCollection {
  id: string; name: string; start: string; end: string; estimated: boolean;
  skinIds: string[]; featuredIds: string[];
  source?: string; sourceRegion?: string; fashionReview?: boolean;
}
const isoDate = (text: string) => {
  const match = text.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
};
export interface SkinShopSource {
  event: string; source: string; sourceRegion: string; eventStart: string;
  rotations: { label: string; start: string; end: string; dateBasis: string; new: string[]; returning: string[] }[];
}
export interface ConfirmedSkinWindow {
  event: string; kind: string; label: string; startAt: string; endAt: string;
  skinIds: string[]; source?: string; newRelease?: boolean; inventoryComplete?: boolean;
}
const normalizeEvent = (name: string) => name.replace(/\[[^\]]*\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const day = 86_400_000;
const shiftDate = (date: string, offset: number) => new Date(Date.parse(`${date}T00:00:00Z`) + offset).toISOString().slice(0, 10);

/** Only explicit shop inventories establish availability. A release association,
 * rerun, or Fashion Review flag is not evidence that an outfit is sold for OP.
 * CN rotations follow the scheduled Global event opening, retaining each shop's
 * own offsets. Both inventory and timing remain estimates until verified Global.
 * Shops that are already over stay in: which ones are over is decided per request
 * (lib/pulls/currentPlan.ts) and again in the browser (SkinPlan), never here.
 *
 * A CN rotation's new outfits are not new on Global once Global has sold them some
 * other way: Critical Phase Transition's three early-shop outfits came to Global with
 * Duel Channel: Ivy Vine, weeks before its own shop. So a projected shop leaves out a
 * new outfit a confirmed Global shop sold first, or that Global released (its
 * globalReleaseAt) before the projected shop opens. Its returning outfits stay: selling
 * them again is what a returning batch is. */
export function pullSkinCollections(events: ScheduleEvent[], skins: Skin[], catalogue: PlannedSkin[], predicted: ReadonlySet<string> = new Set(), sources: SkinShopSource[] = shopRotations.entries, confirmed: ConfirmedSkinWindow[] = confirmedAvailability.entries): SkinCollection[] {
  const paid = new Set(catalogue.map(skin => skin.id));
  // Keep expired confirmations too: an old CN projection must never resurrect
  // a shop after its verified Global window has closed.
  const completeEvents = new Set(confirmed.filter(window => window.inventoryComplete).map(window => normalizeEvent(window.event)));
  const confirmedIds = new Map<string, Set<string>>();
  for (const window of confirmed.filter(window => window.kind === 'shop')) {
    const event = normalizeEvent(window.event);
    const ids = confirmedIds.get(event) ?? new Set<string>();
    window.skinIds.forEach(id => ids.add(id));
    confirmedIds.set(event, ids);
  }
  const verified: SkinCollection[] = confirmed.flatMap(window => {
    if (window.kind !== 'shop') return [];
    const startTime = Date.parse(window.startAt), endTime = Date.parse(window.endAt);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      throw new Error(`Invalid confirmed shop window: ${window.event} / ${window.label}`);
    }
    const start = new Date(startTime).toISOString().slice(0, 10);
    // endAt is exclusive, including a shop closing exactly at midnight.
    const end = new Date(endTime - 1).toISOString().slice(0, 10);
    const skinIds = [...new Set(window.skinIds)];
    for (const id of skinIds) if (!paid.has(id)) throw new Error(`Shop outfit missing OP metadata: ${id}`);
    return skinIds.length ? [{
      id: `${window.event} / ${start} / ${window.label}`,
      name: `${window.event} · ${window.label}`,
      start, end, estimated: false, skinIds,
      featuredIds: window.newRelease ? skinIds : [],
      source: window.source, sourceRegion: 'global',
    }] : [];
  });
  // When Global first had each outfit: its earliest confirmed shop, or its release.
  const onGlobal = new Map<string, string>();
  const firstSeen = (id: string, date: string) => { if (!onGlobal.has(id) || date < onGlobal.get(id)!) onGlobal.set(id, date); };
  for (const collection of verified) for (const id of collection.skinIds) firstSeen(id, collection.start);
  for (const skin of skins) {
    if (skin.globalReleaseAt) firstSeen(`${skin.model} / ${skin.name}`, new Date(skin.globalReleaseAt * 1000).toISOString().slice(0, 10));
  }
  const projected = sources.flatMap(source => {
    if (completeEvents.has(normalizeEvent(source.event))) return [];
    const verifiedIds = confirmedIds.get(normalizeEvent(source.event));
    const event = events.find(event => normalizeEvent(event.name) === normalizeEvent(source.event));
    if (!event) return [];
    return (event.global.dateRange || '').split(';').flatMap(window => {
      const [eventStart, eventEnd] = window.split(/[–—]/).map(isoDate);
      if (!eventStart || !eventEnd || eventEnd < eventStart) return [];
      const offset = Date.parse(`${eventStart}T00:00:00Z`) - Date.parse(`${source.eventStart}T00:00:00Z`);
      if (!Number.isFinite(offset) || offset % day) throw new Error(`Invalid shop reference date: ${source.event}`);
      const returning = source.rotations.filter(rotation => rotation.label !== 'Fashion Review' && !rotation.new.length && rotation.returning.length);
      return source.rotations.flatMap(rotation => {
        const start = shiftDate(rotation.start, offset);
        const end = shiftDate(rotation.end, offset);
        if (end < start) throw new Error(`Invalid shop window: ${source.event} / ${rotation.label}`);
        const fresh = rotation.new.filter(id => !verifiedIds?.has(id) && !(onGlobal.has(id) && onGlobal.get(id)! < start));
        const skinIds = [...new Set([...fresh, ...rotation.returning.filter(id => !verifiedIds?.has(id))])];
        for (const id of skinIds) if (!paid.has(id)) throw new Error(`Shop outfit missing OP metadata: ${id}`);
        return skinIds.length ? [{
          id: `${event.name} / ${eventStart} / ${rotation.label}`,
          name: `${event.name} · ${rotation.label === 'Fashion Review' ? 'Fashion Review' : rotation.new.length === 0 ? `Returning outfits${returning.length > 1 ? ` — batch ${returning.indexOf(rotation) + 1}` : ''}` : rotation.label}`,
          source: source.source, sourceRegion: source.sourceRegion,
          start, end,
          estimated: source.sourceRegion !== 'global' || rotation.dateBasis !== 'shop' || predicted.has(event.name),
          skinIds, featuredIds: fresh, fashionReview: rotation.label === 'Fashion Review',
        }] : [];
      });
    });
  });
  return [...verified, ...projected].sort((a, b) => a.start.localeCompare(b.start) || b.featuredIds.length - a.featuredIds.length || a.name.localeCompare(b.name));
}

/** Original release dates, not the next rerun/Fashion Review shop window.
 * Prefer the Global debut where known, with CN as a fallback for unreleased
 * outfits. A skin introduced during a rerun must not inherit the original run. */
export function skinReleaseDates(events: ScheduleEvent[], skins: Skin[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const skin of skins) {
    const time = skin.globalReleaseAt || skin.cnReleaseAt;
    if (time) dates.set(`${skin.model} / ${skin.name}`, new Date(time * 1000).toISOString().slice(0, 10));
  }
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
