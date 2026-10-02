/**
 * Everything the site keeps for the reader, as one file: the account import, the Operator
 * Planner (its operators, depot, goals and crafting), the Pull Planner's plan, the skin
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
import { ACCOUNT_EVENT, ACCOUNT_STORAGE_KEY, parseAccount } from './accountStore';
import { CRAFTING_EVENT, CRAFTING_STORAGE_KEY } from '@/lib/planner/crafting';
import { DEPOT_EVENT, DEPOT_STORAGE_KEY, DEPOT_TOUCHED_KEY, parseDepotExport } from '@/lib/planner/depot';
import { PLANNER_STATE_EVENT } from '@/lib/planner/plannerStorage';
import { ROSTER_EVENT, ROSTER_STORAGE_KEY, parseRosterExport } from '@/lib/planner/roster';
import { MAX_IMPORT_BYTES } from '@/lib/planner/untrusted';
import { PULL_PLAN_KEY, parsePullPlan } from '@/lib/pulls/plan';
import { SKIN_PLAN_EVENT, SKIN_PLAN_KEY, parseSkinPlan } from '@/lib/skins/skinPlan';

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
  /** Same-tab listeners to tell: the native `storage` event fires only in other tabs. */
  event?: string;
}

export const BACKUP_STORES: readonly Store[] = [
  { key: ACCOUNT_STORAGE_KEY, label: 'your account', valid: (raw) => parseAccount(raw) !== null, event: ACCOUNT_EVENT },
  { key: ROSTER_STORAGE_KEY, label: 'planner operators', valid: (raw) => parseRosterExport(raw) !== null, event: ROSTER_EVENT },
  { key: DEPOT_STORAGE_KEY, label: 'depot', valid: (raw) => parseDepotExport(raw) !== null, event: DEPOT_EVENT },
  { key: DEPOT_TOUCHED_KEY, label: 'depot date', valid: (_, value) => typeof value === 'number' && Number.isFinite(value) },
  { key: CRAFTING_STORAGE_KEY, label: 'crafting', valid: (_, value) => isStringList(value), event: CRAFTING_EVENT },
  // The planner clamps every goal to its operator's rules when it reads them (clampBuilderStates).
  { key: 'plannerState', label: 'planner goals', valid: (_, value) => isObject(value) && isStringList((value as Record<string, unknown>).selectedNames) && isObject((value as Record<string, unknown>).builderStates), event: PLANNER_STATE_EVENT },
  { key: PULL_PLAN_KEY, label: 'pull plan', valid: pullPlan },
  { key: SKIN_PLAN_KEY, label: 'skin wishlist', valid: (raw) => parseSkinPlan(raw) !== null, event: SKIN_PLAN_EVENT },
  // The base page reads each of these defensively, as it would a value an older build wrote.
  { key: 'baseSetup_v2', label: 'base setup', valid: (_, value) => isObject(value) || Array.isArray(value) },
  { key: 'baseAssignments_v2', label: 'base assignments', valid: (_, value) => isObject(value) || Array.isArray(value) },
  { key: 'baseResourceSettings_v1', label: 'base settings', valid: (_, value) => isObject(value) },
  { key: 'baseFactoryProducts_v1', label: 'factory products', valid: (_, value) => isObject(value) },
  { key: 'baseDormitoryAmbience_v1', label: 'dormitory ambience', valid: (_, value) => isObject(value) || typeof value === 'number' },
  { key: 'musicFavorites', label: 'music favourites', valid: (_, value) => isStringList(value) },
];

type ReadStorage = Pick<Storage, 'getItem'>;

/** The backup file's text, from what this browser holds. */
export function formatBackup(storage: ReadStorage, now = new Date()): string {
  const stores: Record<string, unknown> = {};
  for (const store of BACKUP_STORES) {
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

export function backupFilename(now = new Date()): string {
  return `arkpedia-backup-${now.toISOString().slice(0, 10)}.json`;
}

export interface ParsedBackup {
  savedAt: string | null;
  /** Each store the file carries, as the text to store. */
  stores: { key: string; label: string; raw: string; event?: string }[];
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

/** Write a parsed backup into this browser, store by store, and tell this tab's listeners. */
export function applyBackup(backup: ParsedBackup, storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  for (const store of backup.stores) storage.setItem(store.key, store.raw);
  if (typeof window !== 'undefined') for (const store of backup.stores) if (store.event) window.dispatchEvent(new Event(store.event));
}
