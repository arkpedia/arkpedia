/**
 * Everything the site keeps for the reader, as one file: the account import, the Operator
 * Planner (its operators, depot, goals and crafting), the Pull Planner's plan and the claimed
 * first-clear rewards (the OP Tracker's ticks), the skin
 * wishlist, the base setups and the music favourites. All of it lives only in this browser's
 * localStorage, so this file is the only way to take it to another browser or keep it past
 * clearing site data. The Import / export dialog (components/account/DataDialog) writes and
 * reads it.
 *
 * Not in it: what is a preference of this browser rather than the reader's data (the theme,
 * volumes, filters, the stages page's mode) -- and never a login.
 *
 * The rules are the planner bundle's (lib/planner/transfer.ts):
 *   - each store is checked by the parser its own page uses, and one that fails fails the
 *     whole file -- a restore that kept the parts it could read would leave the reader
 *     believing all of it had landed;
 *   - a store the file does not carry is left as it is: absent is not empty;
 *   - a store added later joins without a version bump, so an older build reading a newer
 *     file ignores what it does not know rather than refusing the file;
 *   - a newer version than this build knows is refused, not guessed at.
 */
import { ACCOUNT_EVENT, ACCOUNT_STORAGE_KEY, OTHER_ACCOUNTS_KEY, parseAccount, parseOtherAccounts } from './accountStore';
import { CRAFTING_EVENT, CRAFTING_STORAGE_KEY } from '@/lib/planner/crafting';
import { DEPOT_EVENT, DEPOT_STORAGE_KEY, DEPOT_TOUCHED_KEY, parseDepotExport } from '@/lib/planner/depot';
import { PLANNER_STATE_EVENT } from '@/lib/planner/plannerStorage';
import { ROSTER_EVENT, ROSTER_STORAGE_KEY, parseRosterExport } from '@/lib/planner/roster';
import { MAX_IMPORT_BYTES } from '@/lib/planner/untrusted';
import { PULL_PLAN_KEY, parsePullPlan } from '@/lib/pulls/plan';
import { PAST_PROGRESS_EVENT, PAST_PROGRESS_KEY, parsePastProgress } from '@/lib/pulls/pastProgress';
import { REWARD_FILTERS_EVENT, REWARD_FILTERS_KEY, parseRewardFilters } from '@/lib/pulls/rewardTrackerFilters';
import { SKIN_PLAN_EVENT, SKIN_PLAN_KEY, parseSkinPlan } from '@/lib/skins/skinPlan';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY } from '@/lib/music/musicFavorites';

import { MUSIC_PLAYLISTS_KEY, MUSIC_PLAYLISTS_EVENT, validatePlaylists } from '@/lib/music/musicPlaylists';
import { STORY_PROGRESS_EVENT, STORY_PROGRESS_KEY, parseStoryProgress } from '@/lib/story/storyProgress';
import { PULL_ARCHIVE_KEY, PULL_ARCHIVE_EVENT, parsePullArchives } from './pullArchive';

export const BACKUP_KIND = 'arkpedia-backup';
export const BACKUP_VERSION = 1;

const isObject = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
const isStringList = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const pullPlan = (raw: string) => { try { parsePullPlan(raw); return true; } catch { return false; } };

interface Store {
  key: string;
  /** What the reader would call it, for the line that reports a restore. */
  label: string;
  /** The stored text is one its page reads back. */
  valid: (raw: string, value: unknown) => boolean;
  /**
   * Same-tab listeners to tell: the native `storage` event fires only in other tabs. A restore
   * happens in place, with no reload (that would end the music: components/account/DataDialog),
   * so whatever holds a store while the Account page is open -- the page itself, or the app
   * shell around every page -- reads it again on this event. null only for a store nothing
   * holds there: each page that reads it reads it when it opens, so the next one it opens has
   * the restored value. Required, so a new store has to say which
   * (scripts/tests/test-backup.ts).
   */
  event: string | null;
}

export const BACKUP_STORES: readonly Store[] = [
  { key: PULL_ARCHIVE_KEY, label: 'pull history archive', valid: (_, value) => { try { parsePullArchives(value); return true; } catch { return false; } }, event: PULL_ARCHIVE_EVENT },
  { key: ACCOUNT_STORAGE_KEY, label: 'your account', valid: (raw) => parseAccount(raw) !== null, event: ACCOUNT_EVENT },
  // Every key a record of its own server's (parseOtherAccounts keeps only those).
  { key: OTHER_ACCOUNTS_KEY, label: 'your other servers\' accounts', valid: (raw, value) => !!value && typeof value === 'object' && Object.keys(parseOtherAccounts(raw)).length === Object.keys(value as object).length, event: ACCOUNT_EVENT },
  { key: ROSTER_STORAGE_KEY, label: 'planner operators', valid: (raw) => parseRosterExport(raw) !== null, event: ROSTER_EVENT },
  { key: DEPOT_STORAGE_KEY, label: 'depot', valid: (raw) => parseDepotExport(raw) !== null, event: DEPOT_EVENT },
  // The Operator Planner reads it with the depot, on the depot's event.
  { key: DEPOT_TOUCHED_KEY, label: 'depot date', valid: (_, value) => typeof value === 'number' && Number.isFinite(value), event: DEPOT_EVENT },
  { key: CRAFTING_STORAGE_KEY, label: 'crafting', valid: (_, value) => isStringList(value), event: CRAFTING_EVENT },
  // The planner clamps every goal to its operator's rules when it reads them (clampBuilderStates).
  { key: 'plannerState', label: 'planner goals', valid: (_, value) => isObject(value) && isStringList((value as Record<string, unknown>).selectedNames) && isObject((value as Record<string, unknown>).builderStates), event: PLANNER_STATE_EVENT },
  // Read when the Pull Planner opens (and for the ticks and skins it once held, when their own
  // stores are first read).
  { key: PULL_PLAN_KEY, label: 'pull plan', valid: pullPlan, event: null },
  { key: PAST_PROGRESS_KEY, label: 'claimed rewards', valid: (raw) => parsePastProgress(raw) !== null, event: PAST_PROGRESS_EVENT },
  { key: REWARD_FILTERS_KEY, label: 'Reward Tracker stage filters', valid: (raw) => parseRewardFilters(raw) !== null, event: REWARD_FILTERS_EVENT },
  { key: SKIN_PLAN_KEY, label: 'skin wishlist', valid: (raw) => parseSkinPlan(raw) !== null, event: SKIN_PLAN_EVENT },
  // The base page reads each of these defensively, as it would a value an older build wrote,
  // when it opens.
  { key: 'baseSetup_v2', label: 'base setup', valid: (_, value) => isObject(value) || Array.isArray(value), event: null },
  { key: 'baseAssignments_v2', label: 'base assignments', valid: (_, value) => isObject(value) || Array.isArray(value), event: null },
  { key: 'baseResourceSettings_v1', label: 'base settings', valid: (_, value) => isObject(value), event: null },
  { key: 'baseSavedPresets_v1', label: 'saved base presets', valid: (_, value) => Array.isArray(value), event: null },
  { key: 'baseRotationPlan_v1', label: 'base rotation timetable', valid: (_, value) => isObject(value), event: null },
  { key: 'baseModelSettings_v1', label: 'base training and crafting', valid: (_, value) => isObject(value), event: null },
  { key: 'baseFactoryProducts_v1', label: 'factory products', valid: (_, value) => isObject(value), event: null },
  { key: 'baseDormitoryAmbience_v1', label: 'dormitory ambience', valid: (_, value) => isObject(value) || typeof value === 'number', event: null },
  // The music player holds them on every page, the Account page included.
  { key: MUSIC_PLAYLISTS_KEY, label: 'music playlists', valid: (_, value) => { try { validatePlaylists(value); return true; } catch { return false; } }, event: MUSIC_PLAYLISTS_EVENT },
  { key: MUSIC_FAVORITES_KEY, label: 'music favourites', valid: (_, value) => isStringList(value), event: MUSIC_FAVORITES_EVENT },
  { key: STORY_PROGRESS_KEY, label: 'story progress', valid: (raw) => parseStoryProgress(raw) !== null, event: STORY_PROGRESS_EVENT },
];

type ReadStorage = Pick<Storage, 'getItem'>;

/** The backup file's text, from what this browser holds. */
export function formatBackup(storage: ReadStorage, now = new Date(), keys?: readonly string[]): string {
  const stores: Record<string, unknown> = {};
  for (const store of BACKUP_STORES) {
    if (keys && !keys.includes(store.key)) continue;
    const raw = storage.getItem(store.key);
    if (raw === null) continue;
    try {
      const value = JSON.parse(raw);
      if (store.valid(raw, value)) stores[store.key] = value;
    } catch {
      /* A value its own page would not read either: left out rather than carried. */
    }
  }
  return JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, savedAt: now.toISOString(), stores }, null, 2);
}

export interface ParsedBackup {
  savedAt: string | null;
  /** Each store the file carries, as the text to store. */
  stores: { key: string; label: string; raw: string; event: string | null }[];
}

/** A backup file, all or nothing; null for anything that is not one (another format may be). */
export function parseBackup(text: string): ParsedBackup | null | 'invalid' {
  if (text.length > MAX_IMPORT_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || (parsed as Record<string, unknown>).kind !== BACKUP_KIND) return null;
  const file = parsed as Record<string, unknown>;
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION || !isObject(file.stores)) return 'invalid';
  const carried = file.stores as Record<string, unknown>;
  const stores: ParsedBackup['stores'] = [];
  for (const store of BACKUP_STORES) {
    if (!Object.prototype.hasOwnProperty.call(carried, store.key)) continue;
    const value = carried[store.key];
    const raw = JSON.stringify(value);
    if (raw === undefined || !store.valid(raw, value)) return 'invalid';
    stores.push({ key: store.key, label: store.label, raw, event: store.event });
  }
  return { savedAt: typeof file.savedAt === 'string' ? file.savedAt : null, stores };
}

/** Write a parsed backup into this browser, store by store, then tell this tab's listeners,
 *  each event once. */
export function applyBackup(backup: ParsedBackup, storage: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem' | 'removeItem'>> = window.localStorage,
  target: Pick<EventTarget, 'dispatchEvent'> | null = typeof window === 'undefined' ? null : window): void {
  const previous = storage.getItem && storage.removeItem ? backup.stores.map(store => ({ key: store.key, raw: storage.getItem!(store.key) })) : null;
  let written = 0;
  try {
    for (const store of backup.stores) { storage.setItem(store.key, store.raw); written++; }
  } catch (error) {
    if (previous) for (const store of previous.slice(0, written).reverse()) {
      if (store.raw === null) storage.removeItem!(store.key); else storage.setItem(store.key, store.raw);
    }
    throw error;
  }
  for (const event of new Set(backup.stores.flatMap((store) => (store.event ? [store.event] : [])))) target?.dispatchEvent(new Event(event));
}
