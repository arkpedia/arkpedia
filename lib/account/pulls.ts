/**
 * The reader's headhunting history, as the account record keeps it (lib/account/accountStore).
 *
 * Yostar's Account Center lists only the last 90 days of pulls, and nothing before 2025-12-11
 * (Global). So this is the one part of the record an import adds to instead of replacing: each
 * read joins what the earlier ones kept, and the history grows past the 90 days in this browser.
 *
 * Every pull of a ten-pull has the same time and pool, so a pull is told apart from its batch's
 * others only by its place in the list. A read replaces each batch it has as a whole, and keeps
 * the batches only earlier reads had: no read is trusted to list a batch in the same order.
 */
import type { PullRow } from '@/lib/account-import/yostar';

export interface PullRecord {
  /** Unix seconds; one ten-pull's are all the same. */
  at: number;
  /** The game's pool id (the banner records' globalPoolId). */
  pool: string;
  /** The game's character id (the id map's key). */
  char: string;
  /** The rarity the Account Center gave, which can be stale: the page asks the id map first. */
  star: number | null;
}

export interface PullHistory {
  /** Newest first. */
  rows: PullRecord[];
  /** Each pool's name as the Account Center gave it, for a pool no banner record names. */
  pools: Record<string, string>;
  /** Each character's name as the Account Center gave it, for one the id map has no entry for. */
  names: Record<string, string>;
  /** When an import last read the history, ISO; null if none has managed to. */
  readAt: string | null;
  /** Why the last import could not read it, or null when it could. */
  error: string | null;
}

/** What one import found: the rows read, or null with why not. */
export interface PullRead {
  rows: PullRow[] | null;
  error: string | null;
}

/** A batch's key: one ten-pull (or one single pull) on one pool. */
const batch = (row: { at: number; pool: string }) => `${row.at}|${row.pool}`;

const MAX_ROWS = 50_000;

/**
 * The history after an import. `read` is null for an import that did not ask (a file), which
 * leaves the history as it was. A read that failed keeps every row and says why.
 */
export function mergePulls(previous: PullHistory | undefined, read: PullRead | null, now = new Date()): PullHistory | undefined {
  if (!read) return previous;
  const base: PullHistory = previous ?? { rows: [], pools: {}, names: {}, readAt: null, error: null };
  if (!read.rows) return { ...base, error: read.error ?? 'the pull history could not be read' };
  const fresh: PullRecord[] = read.rows.map((row) => ({ at: row.at, pool: row.poolId, char: row.charId, star: row.star }));
  const replaced = new Set(fresh.map(batch));
  const kept = base.rows.filter((row) => !replaced.has(batch(row)));
  // Newest first; a batch keeps its read's order (sort is stable).
  const rows = [...fresh, ...kept].sort((a, b) => b.at - a.at).slice(0, MAX_ROWS);
  const pools = { ...base.pools }, names = { ...base.names };
  for (const row of read.rows) {
    if (row.poolName) pools[row.poolId] = row.poolName;
    if (row.charName) names[row.charId] = row.charName;
  }
  return { rows, pools, names, readAt: now.toISOString(), error: null };
}

const ID = /^[\w-]{1,80}$/;
const textMap = (value: unknown, max: number): Record<string, string> => (value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, max)
    .filter(([key, name]) => ID.test(key) && typeof name === 'string' && name.length <= 200)) as Record<string, string>
  : {});

/** A stored history, or undefined for anything that is not one. */
export function parsePullHistory(value: unknown): PullHistory | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const history = value as Record<string, unknown>;
  if (!Array.isArray(history.rows) || history.rows.length > MAX_ROWS) return undefined;
  const rows = (history.rows as Record<string, unknown>[]).flatMap((row) => {
    if (!row || !Number.isInteger(row.at) || (row.at as number) <= 0 || typeof row.pool !== 'string' || !ID.test(row.pool) || typeof row.char !== 'string' || !ID.test(row.char)) return [];
    const star = Number.isInteger(row.star) && (row.star as number) >= 1 && (row.star as number) <= 6 ? row.star as number : null;
    return [{ at: row.at as number, pool: row.pool, char: row.char, star }];
  });
  const iso = (field: unknown) => (typeof field === 'string' && field.length <= 40 && Number.isFinite(Date.parse(field)) ? field : null);
  return { rows, pools: textMap(history.pools, 5000), names: textMap(history.names, 5000), readAt: iso(history.readAt),
    error: typeof history.error === 'string' ? history.error.slice(0, 300) : null };
}

/** One press of a headhunting button: a ten-pull, or a single pull. */
export interface PullSession {
  at: number;
  pool: string;
  rows: PullRecord[];
}

/** The history as presses, newest first. */
export function pullSessions(rows: PullRecord[]): PullSession[] {
  const sessions: PullSession[] = [];
  for (const row of rows) {
    const last = sessions[sessions.length - 1];
    if (last && last.at === row.at && last.pool === row.pool) last.rows.push(row);
    else sessions.push({ at: row.at, pool: row.pool, rows: [row] });
  }
  return sessions;
}

/** One banner's pulls: how many, over which days, and the six- and five-stars they gave. */
export interface BannerPulls {
  pool: string;
  pulls: number;
  first: number;
  last: number;
  six: PullRecord[];
  five: PullRecord[];
  /** Pulls made on it since its last six-star (all of them without one). Read as the list is,
   *  newest first, a ten-pull's rows too: they share one time, so their order is the list's. */
  sinceSix: number;
}

/** Each banner pulled on, the latest first. `rarity` gives a pull's rarity (the id map's first). */
export function bannerPulls(rows: PullRecord[], rarity: (row: PullRecord) => number): BannerPulls[] {
  const byPool = new Map<string, BannerPulls>();
  // Oldest first, so sinceSix counts forward and resets at each six-star.
  for (const row of [...rows].reverse()) {
    const entry = byPool.get(row.pool) ?? { pool: row.pool, pulls: 0, first: row.at, last: row.at, six: [], five: [], sinceSix: 0 };
    entry.pulls += 1;
    entry.last = row.at;
    const stars = rarity(row);
    if (stars === 6) { entry.six.push(row); entry.sinceSix = 0; } else entry.sinceSix += 1;
    if (stars === 5) entry.five.push(row);
    byPool.set(row.pool, entry);
  }
  for (const entry of byPool.values()) { entry.six.reverse(); entry.five.reverse(); }
  return [...byPool.values()].sort((a, b) => b.last - a.last);
}

/** How many of each rarity, out of how many pulls. */
export function rarityCounts(rows: PullRecord[], rarity: (row: PullRecord) => number): { total: number; six: number; five: number; four: number; three: number } {
  const counts = { total: rows.length, six: 0, five: 0, four: 0, three: 0 };
  for (const row of rows) {
    const stars = rarity(row);
    if (stars === 6) counts.six += 1;
    else if (stars === 5) counts.five += 1;
    else if (stars === 4) counts.four += 1;
    else counts.three += 1;
  }
  return counts;
}
