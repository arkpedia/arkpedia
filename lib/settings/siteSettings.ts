/**
 * The site's preferences, in one place: what each one is, its type and its default, kept in
 * this browser under one versioned key. Code reads and writes through
 * getSetting / setSetting, never localStorage directly, so a saved account
 * can later carry them all: exportSettings() is the whole set as one object, and
 * importSettings() takes one back.
 *
 * Started 2026-10-23 with the Techniques records' "Detailed Skill Description" (owner: "we
 * should probably start having a centralized settings file that is saved to the browser, so
 * that when we do accounts, we can just use that"). The preferences that still keep keys of
 * their own are listed in docs/development/site-settings.md, with which can move here and
 * which must not (the theme and the site server are read before React, by _document).
 *
 * Safe when storage is refused (a private window, blocked site data): a change then lasts
 * for this visit, in memory. Every value read is checked against its type, so a hand-edited
 * or older blob falls back to the default instead of breaking a page.
 * scripts/tests/test-site-settings.ts holds it.
 */
export interface SiteSettings {
  /** /techniques records show each operator's full skill, talent or module text (true), or
   *  only the clause that holds the technique (false, the default). One setting for every
   *  record, remembered. */
  techniqueDetail: boolean;
}

export type SettingKey = keyof SiteSettings;

export const SETTINGS_DEFAULTS: Readonly<SiteSettings> = Object.freeze({
  techniqueDetail: false,
});

/** Checks each stored value is the right type before a page sees it. */
const VALID: { [K in SettingKey]: (value: unknown) => value is SiteSettings[K] } = {
  techniqueDetail: (value): value is boolean => typeof value === 'boolean',
};

export const SETTINGS_KEY = 'arkpedia:settings';
/** Bumped when a setting changes meaning; `migrate` then brings an older blob forward. */
export const SETTINGS_VERSION = 1;

/** What is stored, and what exportSettings hands an account: only the settings the reader
 *  chose, so a default changed later still reaches everyone who never touched it. */
export interface StoredSettings {
  version: number;
  values: Partial<SiteSettings>;
}

/** Older blobs forward. Nothing to do at version 1. */
function migrate(stored: StoredSettings): StoredSettings {
  return stored;
}

/** The settings a stored or imported blob names, each checked; anything else is dropped. */
export function parseSettings(raw: unknown): StoredSettings {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { data = null; }
  }
  const empty: StoredSettings = { version: SETTINGS_VERSION, values: {} };
  if (!data || typeof data !== 'object') return empty;
  const blob = migrate({
    version: Number((data as { version?: unknown }).version) || SETTINGS_VERSION,
    values: ((data as { values?: unknown }).values && typeof (data as { values?: unknown }).values === 'object' ? (data as { values: Record<string, unknown> }).values : {}) as Partial<SiteSettings>,
  });
  const values: Partial<SiteSettings> = {};
  for (const key of Object.keys(VALID) as SettingKey[]) {
    const value = (blob.values as Record<string, unknown>)[key];
    if (VALID[key](value)) (values as Record<string, unknown>)[key] = value;
  }
  return { version: SETTINGS_VERSION, values };
}

interface Store {
  get: () => SiteSettings;
  set: <K extends SettingKey>(key: K, value: SiteSettings[K]) => void;
  exportAll: () => StoredSettings;
  importAll: (blob: unknown) => void;
  subscribe: (onChange: () => void) => () => void;
}

/** A store over `storage` (null where there is none, as on the server). Exported for its test. */
export function createSettingsStore(storage: () => Storage | null): Store {
  const listeners = new Set<() => void>();
  // The last blob read or written, and the settings it gives: the same object until it
  // changes, which useSyncExternalStore needs from a snapshot.
  let cache: { raw: string | null; settings: SiteSettings } | null = null;
  // Where a change lives when storage refuses it.
  let memory: StoredSettings | null = null;

  const rawNow = (): string | null => {
    if (memory) return JSON.stringify(memory);
    try { return storage()?.getItem(SETTINGS_KEY) ?? null; } catch { return null; }
  };
  const get = () => {
    const raw = rawNow();
    if (!cache || cache.raw !== raw) cache = { raw, settings: { ...SETTINGS_DEFAULTS, ...parseSettings(raw).values } };
    return cache.settings;
  };
  const write = (blob: StoredSettings) => {
    const raw = JSON.stringify(blob);
    try {
      const target = storage();
      if (!target) throw new Error('no storage');
      target.setItem(SETTINGS_KEY, raw);
      memory = null;
    } catch {
      memory = blob;
    }
    for (const listener of listeners) listener();
  };
  return {
    get,
    set: (key, value) => {
      if (!VALID[key](value)) return;
      write({ version: SETTINGS_VERSION, values: { ...parseSettings(rawNow()).values, [key]: value } });
    },
    exportAll: () => parseSettings(rawNow()),
    importAll: (blob) => write({ version: SETTINGS_VERSION, values: { ...parseSettings(rawNow()).values, ...parseSettings(blob).values } }),
    subscribe: (onChange) => {
      listeners.add(onChange);
      // Another tab's change arrives as a storage event.
      const onStorage = (event: StorageEvent) => { if (event.key === SETTINGS_KEY || event.key === null) onChange(); };
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onChange);
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
  };
}

const store = createSettingsStore(() => {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
});

/** A setting now, outside React. */
export const getSetting = <K extends SettingKey>(key: K): SiteSettings[K] => store.get()[key];
/** Changes a setting everywhere it is shown, in this tab and the others. */
export const setSetting = <K extends SettingKey>(key: K, value: SiteSettings[K]): void => store.set(key, value);
/** Every setting the reader chose, as one object (for an account to keep). */
export const exportSettings = (): StoredSettings => store.exportAll();
/** Takes an exported object back: its valid settings win over what this browser has. */
export const importSettings = (blob: unknown): void => store.importAll(blob);
