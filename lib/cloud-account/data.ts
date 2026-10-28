import { BACKUP_STORES, applyBackup, type ParsedBackup } from '@/lib/account/backup';
import { parseAccount, parseOtherAccounts, ACCOUNT_STORAGE_KEY, OTHER_ACCOUNTS_KEY } from '@/lib/account/accountStore';
import { ROSTER_STORAGE_KEY, parseRosterExport } from '@/lib/planner/roster';
import { DEPOT_STORAGE_KEY } from '@/lib/planner/depot';
import { PULL_PLAN_KEY, parsePullPlan } from '@/lib/pulls/plan';
import { PAST_PROGRESS_KEY, parsePastProgress } from '@/lib/pulls/pastProgress';
import { SETTINGS_KEY, parseSettings } from '@/lib/settings/siteSettings';
import { CLOUD_RESTORED_EVENT } from './events';
import { THEME_COLOR } from '@/lib/nav/themeColor';
import { PULL_ARCHIVE_KEY } from '@/lib/account/pullArchive';

export type CloudData = Record<string, unknown>;
export const MAX_CLOUD_BYTES = 900_000;
// A closed list, shared by browser and API. Never enumerate localStorage for upload.
export const GAME_KEYS = new Set([ACCOUNT_STORAGE_KEY, OTHER_ACCOUNTS_KEY, ROSTER_STORAGE_KEY, DEPOT_STORAGE_KEY, 'plannerDepotTouched']);
const preferences: Record<string, (v: unknown) => boolean> = {
  [SETTINGS_KEY]: v => !!v && typeof v === 'object',
  theme: v => v === 'light' || v === 'dark',
  'arkpedia-site-server': v => ['en', 'jp', 'kr'].includes(v as string),
  arkpediaMusicAutoplay: v => typeof v === 'boolean',
  musicVolume: v => typeof v === 'number' && v >= 0 && v <= 100,
  arkpediaMusicDataSaver: v => typeof v === 'boolean',
  musicIncludeEndfield: v => typeof v === 'boolean',
  musicExcludeCopyrighted: v => typeof v === 'boolean',
};
export const CLOUD_KEYS = [...new Set([...BACKUP_STORES.map(s => s.key).filter(key => key !== PULL_ARCHIVE_KEY), ...Object.keys(preferences)])];
const starting = ['startingElite', 'startingLevel', 'startingSkillLevel', 'startingMasteryLevels', 'startingModuleStages'];

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Defense in depth for unexpected credential fields in a supported data object.
// Provider identity/session records use a different API and database schema.
export function assertNoCredentials(value: unknown, depth = 0): void {
  if (depth > 35) throw new Error('Saved data is nested too deeply.');
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:email|emailCode|codeToken|authToken|accessToken|refreshToken|idToken|token|password|secret|deviceId|authorization|cookie|__proto__|constructor|prototype)$/i.test(key)) {
      throw new Error('Sign-in credentials are not accepted in cloud saves.');
    }
    assertNoCredentials(item, depth + 1);
  }
}

function personalProjection(key: string, value: unknown): unknown {
  if (key === 'plannerState' && object(value) && object(value.builderStates)) {
    return { selectedNames: value.selectedNames, builderStates: Object.fromEntries(Object.entries(value.builderStates).map(([name, state]) => [name,
      object(state) ? Object.fromEntries(Object.entries(state).filter(([field]) => !starting.includes(field))) : state])) };
  }
  if (key === PULL_PLAN_KEY) {
    const plan = parsePullPlan(JSON.stringify(value));
    // A wallet filled by import is optional game data. A user-edited budget is a plan.
    if (plan.walletFrom) Object.assign(plan, { orundum: '', originite: '', permits: '', yellowCerts: '', monthlyCard: false });
    return { ...plan, walletFrom: '', ticksFrom: '', doneKeys: [], doneEvents: [], annihilationDone: false };
  }
  if (key === PAST_PROGRESS_KEY) {
    const progress = parsePastProgress(JSON.stringify(value));
    if (!progress) throw new Error('Invalid reward progress.');
    const importedKeys = new Set(progress.importedDoneKeys ?? []), importedEvents = new Set(progress.importedDoneEvents ?? []);
    // Older snapshots with no provenance cannot safely distinguish manual/imported ticks.
    return { doneKeys: progress.ticksFrom && !progress.importedDoneKeys ? [] : progress.doneKeys.filter(k => !importedKeys.has(k)),
      doneEvents: progress.ticksFrom && !progress.importedDoneEvents ? [] : progress.doneEvents.filter(k => !importedEvents.has(k)),
      annihilationDone: progress.ticksFrom ? false : progress.annihilationDone, ticksFrom: '' };
  }
  return value;
}

/** Validate everything before accepting any write. Unknown stores fail closed. */
export function validateCloudData(input: unknown, gameSync: boolean, personalSync = true): CloudData {
  if (!object(input)) throw new Error('Invalid cloud save.');
  if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_CLOUD_BYTES) throw new Error('Cloud saves currently support up to 900 KB. Export a backup before reducing your saved data.');
  assertNoCredentials(input);
  const output: CloudData = {};
  for (const [key, value] of Object.entries(input)) {
    if (!CLOUD_KEYS.includes(key)) throw new Error('Unsupported cloud-save field.');
    if (GAME_KEYS.has(key) && !gameSync) throw new Error('Saving imported game data requires your permission.');
    if (!GAME_KEYS.has(key) && !personalSync) throw new Error('Saving personal data requires your permission.');
    const store = BACKUP_STORES.find(s => s.key === key);
    if (store ? !store.valid(JSON.stringify(value), value) : !preferences[key]?.(value)) throw new Error('A saved section is invalid. Export your browser data and check it before syncing.');
    let clean = value;
    if (key === ACCOUNT_STORAGE_KEY) clean = parseAccount(JSON.stringify(value));
    else if (key === OTHER_ACCOUNTS_KEY) clean = parseOtherAccounts(JSON.stringify(value));
    else if (key === ROSTER_STORAGE_KEY) clean = parseRosterExport(JSON.stringify(value));
    else if (key === PULL_PLAN_KEY) clean = parsePullPlan(JSON.stringify(value));
    else if (key === SETTINGS_KEY) clean = parseSettings(value);
    // History has its own consent and append-only archive, never a replaceable snapshot. The
    // record's own `pulls` is only its read status now; a snapshot an older build uploaded still
    // carries rows there, and the API moves those into the archive (api.ts) before projecting.
    if (key === ACCOUNT_STORAGE_KEY && object(clean)) { const { pulls: _pulls, ...snapshot } = clean; clean = snapshot; }
    if (key === OTHER_ACCOUNTS_KEY && object(clean)) clean = Object.fromEntries(Object.entries(clean).map(([server, account]) => {
      const { pulls: _pulls, ...snapshot } = account as Record<string, unknown>; return [server, snapshot];
    }));
    output[key] = gameSync ? clean : personalProjection(key, clean);
  }
  return output;
}

/** Used both when permission is withdrawn and before collecting browser data. */
export function personalData(data: CloudData): CloudData {
  return validateCloudData(Object.fromEntries(Object.entries(data).filter(([key]) => !GAME_KEYS.has(key))), false);
}

export function collectCloudData(storage: Pick<Storage, 'getItem'>, gameSync: boolean, personalSync = true): CloudData {
  const data: CloudData = {};
  for (const key of CLOUD_KEYS) {
    if (!gameSync && GAME_KEYS.has(key)) continue;
    if (!personalSync && !GAME_KEYS.has(key)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
      // Exclude the separate archive (and, on a record an older build wrote, the rows it still
      // carries) before enforcing the snapshot's byte budget.
      if (key === ACCOUNT_STORAGE_KEY && object(data[key])) delete (data[key] as Record<string, unknown>).pulls;
      if (key === OTHER_ACCOUNTS_KEY && object(data[key])) for (const account of Object.values(data[key] as Record<string, unknown>)) if (object(account)) delete account.pulls;
    }
    catch {
      // Several existing preferences use plain localStorage strings.
      if (key === 'theme' || key === 'arkpedia-site-server') data[key] = raw;
      else throw new Error('A browser save could not be read. Export your data before syncing.');
    }
  }
  return validateCloudData(data, gameSync, personalSync);
}

export function fingerprint(data: CloudData): string {
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
    : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
  return JSON.stringify(sorted(data));
}

/** Explicit restore replaces supported sections, including deleted sections. It never
 * touches Yostar credentials. The caller remounts the page, keeping the player alive. */
export function restoreCloudData(data: CloudData, gameSync: boolean, storage: Storage = window.localStorage, personalSync = true): void {
  const valid = validateCloudData(data, gameSync, personalSync);
  const keys = CLOUD_KEYS.filter(key => GAME_KEYS.has(key) ? gameSync : personalSync);
  const previous = keys.map(key => [key, storage.getItem(key)] as const);
  const backup: ParsedBackup = { savedAt: null, stores: [] };
  for (const key of keys) {
    if (!Object.hasOwn(valid, key)) continue;
    const store = BACKUP_STORES.find(s => s.key === key);
    backup.stores.push({ key, label: key, raw: key === 'theme' || key === 'arkpedia-site-server' ? String(valid[key]) : JSON.stringify(valid[key]), event: store?.event ?? null });
  }
  try {
    for (const key of keys) storage.removeItem(key);
    applyBackup(backup, storage, null);
  } catch (error) {
    for (const [key, raw] of previous) { if (raw === null) storage.removeItem(key); else storage.setItem(key, raw); }
    throw error;
  }
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    // Include deleted sections: consumers must read the new empty/default value too.
    for (const key of keys) window.dispatchEvent(new StorageEvent('storage', { key, storageArea: window.localStorage }));
    for (const event of new Set(BACKUP_STORES.filter(s => keys.includes(s.key)).map(s => s.event).filter(Boolean))) window.dispatchEvent(new Event(event!));
    const theme = storage.getItem('theme') === 'light' ? 'light' : 'dark';
    if (theme === 'light') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
    window.dispatchEvent(new Event(CLOUD_RESTORED_EVENT));
  }
}
