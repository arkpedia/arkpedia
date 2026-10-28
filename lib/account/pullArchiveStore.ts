/**
 * The pull archive in this browser's localStorage (lib/account/pullArchive): read for React and
 * for the cloud sync, written as a union, and the one-time move of the rows older builds kept on
 * the account records (migrateLegacyPullRows). Parsing is cached by the stored text, as
 * accountStore's snapshot is, so the same archives come back while nothing changed.
 */
import { useSyncExternalStore } from 'react';
import { ACCOUNT_EVENT, ACCOUNT_STORAGE_KEY, OTHER_ACCOUNTS_KEY, parseAccount, parseOtherAccounts } from './accountStore';
import { carriesPullRows, legacyArchives, mergePullArchives, parsePullArchives, PULL_ARCHIVE_EVENT, PULL_ARCHIVE_KEY, type PullArchive } from './pullArchive';
const OWNERS_KEY = 'arkpedia:pull-archive-owners-v1';
function owners(): Record<string, string> {
  const value = JSON.parse(localStorage.getItem(OWNERS_KEY) ?? '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Archive ownership could not be read. Export a browser backup before syncing.');
  return value;
}
export function claimArchives(archives: PullArchive[], owner: string, replace = false): void {
  const saved = owners();
  for (const archive of archives) { const key = `${archive.server}:${archive.uid}`; if (replace || !saved[key]) saved[key] = owner; }
  localStorage.setItem(OWNERS_KEY, JSON.stringify(saved));
}
export function archivesForOwner(archives: PullArchive[], owner: string): PullArchive[] {
  const saved = owners();
  return archives.filter(archive => !saved[`${archive.server}:${archive.uid}`] || saved[`${archive.server}:${archive.uid}`] === owner);
}

const EMPTY: PullArchive[] = [];
// The same array back while the stored text is the same (useSyncExternalStore needs that), and
// one parse per change rather than one per render or sync.
let cachedRaw: string | null | undefined;
let cachedArchives: PullArchive[] = EMPTY;
let cachedError: Error | null = null;
function parseStored(raw: string | null): PullArchive[] {
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try { cachedArchives = raw ? parsePullArchives(JSON.parse(raw)) : EMPTY; cachedError = null; }
    catch (error) { cachedArchives = EMPTY; cachedError = error instanceof Error ? error : new Error('The pull archive could not be read.'); }
  }
  if (cachedError) throw cachedError;
  return cachedArchives;
}
const parseJson = (raw: string | null): unknown => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

/** The archive as stored, joined with the rows older records still carry: right before they
 *  have moved too. Throws on an archive that cannot be read, so a sync never treats it as empty. */
export function collectPullArchives(storage: Pick<Storage, 'getItem'>): PullArchive[] {
  const saved = parseStored(storage.getItem(PULL_ARCHIVE_KEY));
  const legacy = legacyArchives(parseJson(storage.getItem(ACCOUNT_STORAGE_KEY)), parseJson(storage.getItem(OTHER_ACCOUNTS_KEY)));
  return legacy.length ? mergePullArchives(saved, legacy) : saved;
}

/** Restore is always a union, independent of the browser/cloud snapshot choice. */
export function restorePullArchives(incoming: PullArchive[], storage: Storage = window.localStorage): void {
  const merged = mergePullArchives(collectPullArchives(storage), incoming);
  const raw = JSON.stringify(merged);
  if (storage.getItem(PULL_ARCHIVE_KEY) === raw) return;
  storage.setItem(PULL_ARCHIVE_KEY, raw);
  if (typeof window !== 'undefined' && storage === window.localStorage) window.dispatchEvent(new Event(PULL_ARCHIVE_EVENT));
}

/**
 * Moves the rows an older build kept on the account records (their `pulls.rows`, the shown
 * record's and the other servers') into the archive, once: the archive is written first, as a
 * union (rows it already holds are not doubled), and a record is rewritten without its rows only
 * once the archive holds them, so a full storage costs nothing. Each record keeps its read
 * status. Nothing to do, and nothing touched, once the rows have moved. Returns whether they did.
 */
export function migrateLegacyPullRows(storage: Storage = window.localStorage): boolean {
  const stored = [ACCOUNT_STORAGE_KEY, OTHER_ACCOUNTS_KEY].map((key) => ({ key, raw: storage.getItem(key), value: parseJson(storage.getItem(key)) }));
  const [account, others] = stored;
  const carrying = stored.filter(({ key, value }) => (key === ACCOUNT_STORAGE_KEY ? carriesPullRows(value)
    : !!value && typeof value === 'object' && Object.values(value as Record<string, unknown>).some(carriesPullRows)));
  if (!carrying.length) return false;
  try {
    restorePullArchives(legacyArchives(account.value, others.value), storage);
  } catch {
    return false;
  }
  // The rows are in the archive now; a record the storage refuses to rewrite keeps its copy
  // until the next try, and reads as the union meanwhile (collectPullArchives).
  try {
    for (const { key, raw } of carrying) {
      const stripped = key === ACCOUNT_STORAGE_KEY ? parseAccount(raw) : parseOtherAccounts(raw);
      if (stripped) storage.setItem(key, JSON.stringify(stripped));
    }
  } catch {
    /* Left for the next try. */
  }
  if (typeof window !== 'undefined' && storage === window.localStorage) window.dispatchEvent(new Event(ACCOUNT_EVENT));
  return true;
}

const subscribe = (changed: () => void) => {
  window.addEventListener(PULL_ARCHIVE_EVENT, changed); window.addEventListener('storage', changed);
  return () => { window.removeEventListener(PULL_ARCHIVE_EVENT, changed); window.removeEventListener('storage', changed); };
};
function snapshot(): PullArchive[] {
  let raw: string | null = null;
  try { raw = window.localStorage?.getItem(PULL_ARCHIVE_KEY) ?? null; } catch { raw = null; }
  try { return parseStored(raw); } catch { return EMPTY; }
}
/** The stored archives: none on the server and in the first paint, the same array back while
 *  nothing changed. */
export function usePullArchives(): PullArchive[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
