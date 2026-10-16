import { serverDayBoundary } from '@/lib/time/servers.mjs';
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
  /** Whether the window sells outfits that are new, not reissues: what "current" sorts by.
   *  Always stated. It used to be optional, and a window without it made the page look the
   *  answer up in the verified windows compiled into its bundle -- the deploy's copy. */
  newRelease: boolean;
}
export interface SkinCountdown extends SkinWindow {
  live: boolean;
}
/** data/skin-availability-windows.json: verified Global acquisition windows. */
export interface ConfirmedSkinWindows {
  entries: (Omit<SkinWindow, 'kind' | 'newRelease'> & { kind: string; newRelease?: boolean; inventoryComplete?: boolean })[];
}
/** data/skin-shop-rotations.json: CN shop batches, projected onto Global event dates. */
export interface SkinShopRotations {
  entries: { event: string; eventStart: string; source?: string; rotations: { label: string; start: string; end: string; new: string[]; returning: string[] }[] }[];
}
/** A verified entry as a window, with newRelease stated. */
export const confirmedWindow = ({ inventoryComplete: _inventoryComplete, ...entry }: ConfirmedSkinWindows['entries'][number]): SkinWindow =>
  ({ ...entry, kind: entry.kind as AcquisitionKind, newRelease: entry.newRelease === true });
export const skinKey = (skin: Pick<Skin, 'model' | 'name'>) => `${skin.model} / ${skin.name}`;
const normalizeEvent = (name: string) => name.replace(/\[[^\]]*\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Verified acquisition windows win over release associations and CN projections.
 * A Fashion Review flag says nothing about an individual sale or draw pool.
 * Forecasts are useful for planning, but never establish "available now".
 * The two tables are the release's, handed in by the page's data builder: required, so no
 * caller can fall back on a copy compiled into the browser bundle. */
export function getSkinWindows(skins: Skin[], events: ScheduleEvent[], sources: { confirmed: ConfirmedSkinWindows; rotations: SkinShopRotations }): SkinWindow[] {
  const { confirmed, rotations } = sources;
  const windows: SkinWindow[] = confirmed.entries.map(confirmedWindow);
  const eventNames = events.map(event => event.name);
  const byId = new Map(skins.map(skin => [skinKey(skin), skin]));
  const completeEvents = new Set(confirmed.entries.filter(window => window.inventoryComplete).map(window => normalizeEvent(window.event)));
  for (const source of rotations.entries) {
    if (completeEvents.has(normalizeEvent(source.event))) continue;
    const event = events.find(event => normalizeEvent(event.name) === normalizeEvent(source.event));
    if (!event?.global.dateRange) continue;
    for (const range of event.global.dateRange.split(';')) {
      const parsed = parseGameWindow(range.trim());
      if (!parsed) continue;
      const offset = Date.parse(parsed.start.toISOString().slice(0, 10)) - Date.parse(source.eventStart);
      for (const rotation of source.rotations) {
        const verifiedIds = new Set(windows.filter(window => !window.estimated && window.kind === 'shop'
          && normalizeEvent(window.event) === normalizeEvent(event.name)).flatMap(window => window.skinIds));
        const startAt = new Date(serverDayBoundary(Date.parse(rotation.start) + offset, 'en', 'event')).toISOString();
        const skinIds = [...rotation.new.filter(id => {
          const released = byId.get(id)?.globalReleaseAt;
          return !released || released * 1000 >= Date.parse(startAt);
        }), ...rotation.returning].filter(id => byId.has(id) && !verifiedIds.has(id));
        if (!skinIds.length) continue;

        windows.push({
          event: event.name, kind: 'shop', label: rotation.label, skinIds,
          startAt,
          endAt: new Date(serverDayBoundary(Date.parse(rotation.end) + offset, 'en', 'reset')).toISOString(),
          source: source.source, estimated: true, newRelease: false,
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
      // A Global debut elsewhere supersedes a CN release association. Reruns need an inventory.
      if (skin.globalReleaseAt && skin.globalReleaseAt * 1000 < +range.start) continue;
      windows.push({ event: event.name, kind: /Outfit Store/i.test(skin.howToObtain || '') ? 'shop' : 'reward',
        label: 'Expected release', skinIds: [id], startAt: range.start.toISOString(), endAt: range.end.toISOString(), estimated: true, newRelease: false });
    }
  }
  return windows;
}

export function computeSkinCountdowns(skins: Skin[], events: ScheduleEvent[], asOf: Date, windows: SkinWindow[]): Map<string, SkinCountdown> {
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

/** On sale now, as /skins' Available now tab counts it: a live shop or event-reward window, never
 *  a random draw. */
export const isAvailableNow = (window: SkinCountdown | undefined) => !!window?.live && window.kind !== 'draw';

/**
 * What can be had now, current releases first: /skins' Available now tab, and the home page's
 * carousel. The home page used to list the skins of whichever events were running, matched by
 * name, so an outfit on sale in the shop outside a running event never reached it (2026-09-30).
 */
export function availableSkins(skins: Skin[], windows: SkinWindow[], asOf: Date): Skin[] {
  const availability = computeSkinCountdowns(skins, [], asOf, windows);
  return skins.filter(skin => isAvailableNow(availability.get(skinKey(skin))))
    .sort((a, b) => compareCurrentSkins(a, b, availability));
}

/** Current releases precede reissues, independent of catalogue/scrape order. */
export function compareCurrentSkins(a: Skin, b: Skin, availability: Map<string, SkinCountdown>): number {
  const first = availability.get(skinKey(a)), second = availability.get(skinKey(b));
  const isNew = (window: SkinCountdown | undefined) => window?.newRelease === true;
  return Number(isNew(second)) - Number(isNew(first))
    || Date.parse(second?.startAt ?? '1970-01-01') - Date.parse(first?.startAt ?? '1970-01-01');
}

/** Upcoming acquisitions exclude random draws and already-live windows. Undated CN debuts
 * follow dated windows, and stop being upcoming once the Global client has released them. */
export function isUpcomingSkin(skin: Skin, window: SkinCountdown | undefined, now: number): boolean {
  if (window?.live) return false;
  if (window && window.kind !== 'draw') return true;
  return skin.globalReleaseAt ? skin.globalReleaseAt * 1000 > now
    : skin.sourceRegion === 'CN' || /^\[CN\]/.test(skin.release || '');
}
export function compareUpcomingSkins(a: Skin, b: Skin, availability: Map<string, SkinCountdown>): number {
  return (Date.parse(availability.get(skinKey(a))?.startAt ?? '') || Infinity)
    - (Date.parse(availability.get(skinKey(b))?.startAt ?? '') || Infinity)
    || Number(!!a.globalReleaseAt && a.globalReleaseAt * 1000 < Date.parse(availability.get(skinKey(a))?.startAt ?? ''))
      - Number(!!b.globalReleaseAt && b.globalReleaseAt * 1000 < Date.parse(availability.get(skinKey(b))?.startAt ?? ''))
    || (a.cnReleaseAt ?? Infinity) - (b.cnReleaseAt ?? Infinity)
    || (a.model ?? '').localeCompare(b.model ?? '') || a.name.localeCompare(b.name);
}
