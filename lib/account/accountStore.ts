/**
 * What the reader's Arknights account holds, as the last game import read it: the one
 * record every page that cares about ownership reads (issue #94). The import is the
 * account's truth, so a new one replaces it whole.
 *
 *   operators  the operators owned, by the name the site uses (Amiya's forms each by theirs)
 *   skins      the outfits owned, by the game's skin id, which every skin record carries
 *   cleared    the stages cleared, by the game's stage id
 *   profile    what the account page shows: level, when it was registered, the assistant, the
 *              signature (absent on a record written before it had them)
 *
 * The planner's import writes it (Export / import > From the game), where the id map it
 * needs is a release table; it lives only in this browser's localStorage. Nothing
 * hand-entered goes in here: the planner's own roster may hold operators the reader does not
 * have yet, for planning, and those are not owned.
 */
import { useSyncExternalStore } from 'react';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

export const ACCOUNT_STORAGE_KEY = 'arkpediaAccount';
/** Same-tab writes: the native `storage` event fires only in the other tabs. */
export const ACCOUNT_EVENT = 'arkpediaAccountChanged';

export interface AccountRecord {
  version: 1;
  server: 'en';
  /** When the import read it, ISO. */
  importedAt: string;
  /** The Doctor's name and number, to say whose it is. */
  doctor: string | null;
  operators: string[];
  skins: string[];
  cleared: string[];
  profile?: AccountProfile;
}

export interface AccountProfile {
  level: number | null;
  /** status.registerTs, ISO. */
  registeredAt: string | null;
  /** The assistant (status.secretary), by the site's name. */
  secretary: string | null;
  /** The profile's signature line (status.resume). */
  bio: string | null;
}

const strings = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every((item) => typeof item === 'string' && item.length <= 200);

/** A stored record, or null for anything that is not one. */
export function parseAccount(raw: string | null): AccountRecord | null {
  if (!raw) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || value.version !== 1 || value.server !== 'en' || typeof value.importedAt !== 'string') return null;
  if (!strings(value.operators, 5000) || !strings(value.skins, 20000) || !strings(value.cleared, 50000)) return null;
  const profile = value.profile && typeof value.profile === 'object' ? value.profile as Record<string, unknown> : null;
  const text = (field: unknown) => (typeof field === 'string' && field.length <= 500 ? field : null);
  return {
    version: 1, server: 'en', importedAt: value.importedAt,
    doctor: typeof value.doctor === 'string' ? value.doctor : null,
    operators: value.operators as string[], skins: value.skins as string[], cleared: value.cleared as string[],
    ...(profile ? { profile: {
      level: typeof profile.level === 'number' && Number.isFinite(profile.level) ? profile.level : null,
      registeredAt: text(profile.registeredAt), secretary: text(profile.secretary), bio: text(profile.bio),
    } } : {}),
  };
}

/**
 * The record an account (as the game server sends it) gives. Operators by the map's names,
 * those it has no record for left out (the planner's import names them); skins and stages
 * by the game's ids. A stage counts as cleared at state 2 or 3 (cleared, or with every
 * star); 0 and 1 are opened and not cleared.
 */
export function accountFromGame(user: Record<string, any>, map: GameAccountMap, now = new Date()): AccountRecord {
  const operators = new Set<string>();
  for (const char of Object.values((user.troop?.chars ?? {}) as Record<string, { charId?: string; tmpl?: Record<string, unknown> }>)) {
    const ids = char?.tmpl && typeof char.tmpl === 'object' ? Object.keys(char.tmpl) : [char?.charId ?? ''];
    for (const id of ids) if (map.chars[id]) operators.add(map.chars[id].name);
  }
  const stages = (user.dungeon?.stages ?? {}) as Record<string, { state?: number }>;
  const status = user.status ?? {};
  return {
    version: 1,
    server: 'en',
    importedAt: now.toISOString(),
    doctor: status.nickName ? `${status.nickName}#${status.nickNumber ?? ''}` : null,
    operators: [...operators].sort(),
    skins: Object.keys(user.skin?.characterSkins ?? {}).sort(),
    cleared: Object.entries(stages).filter(([, stage]) => (stage?.state ?? 0) >= 2).map(([id]) => id).sort(),
    profile: {
      level: typeof status.level === 'number' ? status.level : null,
      registeredAt: typeof status.registerTs === 'number' && status.registerTs > 0 ? new Date(status.registerTs * 1000).toISOString() : null,
      secretary: map.chars[status.secretary]?.name ?? null,
      bio: typeof status.resume === 'string' && status.resume.trim() ? status.resume.trim().slice(0, 500) : null,
    },
  };
}

export function writeAccount(record: AccountRecord | null): void {
  try {
    if (record) window.localStorage?.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(record));
    else window.localStorage?.removeItem(ACCOUNT_STORAGE_KEY);
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
  } catch {
    /* Private mode: the filters stay as they were. */
  }
}

// useSyncExternalStore needs the same object back while nothing changed.
let cachedRaw: string | null | undefined;
let cached: AccountRecord | null = null;
function snapshot(): AccountRecord | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(ACCOUNT_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseAccount(raw);
  }
  return cached;
}
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(ACCOUNT_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(ACCOUNT_EVENT, onChange);
  };
}

/** The imported account, or null: always null on the server and in the first paint, so the
 *  markup matches; the stored record arrives right after. */
export function useAccount(): AccountRecord | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Owned, not owned, or every one: the filter the operator and skin lists share. */
export type OwnedFilter = 'all' | 'owned' | 'missing';
export const ownedFilter = (raw: string): OwnedFilter => (raw === 'owned' || raw === 'missing' ? raw : 'all');
