import confirmed from '@/data/skin-availability-windows.json';
import rotations from '@/data/skin-shop-rotations.json';
import type { Skin } from './skinTypes';
import type { ScheduleEvent } from '../schedule/scheduleTypes';
import { getSkinsForEvent } from '../schedule/scheduleSkinMatch';
import { parseGameWindow } from '../schedule/gameWindow';

export type AcquisitionKind = 'shop' | 'reward' | 'draw';
export interface SkinWindow {
  event: string;
  kind: AcquisitionKind;
  label: string;
  startAt: string;
  /** Exclusive close, including the final minute in the announcement. */
  endAt: string;
  skinIds: string[];
  source?: string;
  inventorySource?: string;
  details?: string;
  estimated?: boolean;
}
export interface SkinCountdown extends SkinWindow {
  live: boolean;
}
export const skinKey = (skin: Pick<Skin, 'model' | 'name'>) => `${skin.model} / ${skin.name}`;
const normalizeEvent = (name: string) => name.replace(/\[[^\]]*\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Verified acquisition windows win over release associations and CN projections.
 * A Fashion Review flag says nothing about an individual sale or draw pool.
 * Forecasts are useful for planning, but never establish "available now". */
export function getSkinWindows(skins: Skin[], events: ScheduleEvent[]): SkinWindow[] {
  const windows: SkinWindow[] = confirmed.entries.map(entry => ({ ...entry, kind: entry.kind as AcquisitionKind }));
  const eventNames = events.map(event => event.name);
  const byId = new Map(skins.map(skin => [skinKey(skin), skin]));
  for (const source of rotations.entries) {
    const event = events.find(event => normalizeEvent(event.name) === normalizeEvent(source.event));
    if (!event?.global.dateRange) continue;
    for (const range of event.global.dateRange.split(';')) {
      const parsed = parseGameWindow(range.trim());
      if (!parsed) continue;
      const offset = Date.parse(parsed.start.toISOString().slice(0, 10)) - Date.parse(source.eventStart);
      for (const rotation of source.rotations) {
        const skinIds = [...rotation.new, ...rotation.returning].filter(id => byId.has(id));
        if (!skinIds.length) continue;
        // Official windows for this event replace its projected CN batches.
        if (windows.some(window => !window.estimated && normalizeEvent(window.event) === normalizeEvent(event.name))) continue;
        windows.push({
          event: event.name, kind: 'shop', label: rotation.label, skinIds,
          startAt: new Date(Date.parse(rotation.start) + offset + 15 * 3600000).toISOString(),
          endAt: new Date(Date.parse(rotation.end) + offset + 11 * 3600000).toISOString(),
          source: source.source, estimated: true,
        });
      }
    }
  }
  for (const event of events) {
    const range = parseGameWindow(event.global.dateRange, event.global);
    if (!range) continue;
    const matched = event.linkedSkinNames?.length
      ? skins.filter(skin => event.linkedSkinNames!.includes(skin.name))
      : getSkinsForEvent(event.name, skins, eventNames);
    for (const skin of matched) {
      const id = skinKey(skin);
      if (windows.some(window => window.skinIds.includes(id) && normalizeEvent(window.event) === normalizeEvent(event.name))) continue;
      windows.push({ event: event.name, kind: /Outfit Store/i.test(skin.howToObtain || '') ? 'shop' : 'reward',
        label: 'Expected release', skinIds: [id], startAt: range.start.toISOString(), endAt: range.end.toISOString(), estimated: true });
    }
  }
  return windows;
}

export function computeSkinCountdowns(skins: Skin[], events: ScheduleEvent[], asOf: Date = new Date(), windows = getSkinWindows(skins, events)): Map<string, SkinCountdown> {
  const result = new Map<string, SkinCountdown>();
  for (const window of windows) {
    const start = Date.parse(window.startAt), end = Date.parse(window.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end <= +asOf) continue;
    const live = start <= +asOf;
    if (live && window.estimated) continue;
    for (const id of window.skinIds) {
      const existing = result.get(id);
      // Direct acquisition takes priority over a random draw of the same outfit.
      if (existing && (existing.live && !live
        || existing.live === live && (existing.kind !== 'draw' && window.kind === 'draw'
          || existing.kind === window.kind && Date.parse(existing.startAt) <= start))) continue;
      result.set(id, { ...window, live });
    }
  }
  return result;
}

export const acquisitionLabel = (window: SkinWindow) => window.kind === 'shop' ? 'Outfit shop' : window.kind === 'reward' ? 'Event reward' : 'Random draw';
