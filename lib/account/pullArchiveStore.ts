import { useSyncExternalStore } from 'react';
import { ACCOUNT_EVENT, ACCOUNT_STORAGE_KEY, OTHER_ACCOUNTS_KEY, parseAccount, parseOtherAccounts } from './accountStore';
import { archiveFromAccount, mergePullArchives, parsePullArchives, PULL_ARCHIVE_EVENT, PULL_ARCHIVE_KEY, type PullArchive } from './pullArchive';
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

export function collectPullArchives(storage: Pick<Storage, 'getItem'>): PullArchive[] {
  const raw = storage.getItem(PULL_ARCHIVE_KEY);
  const saved = raw ? parsePullArchives(JSON.parse(raw)) : [];
  const active = parseAccount(storage.getItem(ACCOUNT_STORAGE_KEY) ?? '');
  const others = parseOtherAccounts(storage.getItem(OTHER_ACCOUNTS_KEY) ?? '');
  return mergePullArchives(saved, [active, ...Object.values(others)].flatMap(archiveFromAccount));
}

/** Restore is always a union, independent of the browser/cloud snapshot choice. */
export function restorePullArchives(incoming: PullArchive[], storage: Storage = window.localStorage): void {
  const merged = mergePullArchives(collectPullArchives(storage), incoming);
  const raw = JSON.stringify(merged);
  if (storage.getItem(PULL_ARCHIVE_KEY) === raw) return;
  storage.setItem(PULL_ARCHIVE_KEY, raw);
  if (typeof window !== 'undefined' && storage === window.localStorage) window.dispatchEvent(new Event(PULL_ARCHIVE_EVENT));
}
const subscribe = (changed: () => void) => {
  window.addEventListener(PULL_ARCHIVE_EVENT, changed); window.addEventListener(ACCOUNT_EVENT, changed); window.addEventListener('storage', changed);
  return () => { window.removeEventListener(PULL_ARCHIVE_EVENT, changed); window.removeEventListener(ACCOUNT_EVENT, changed); window.removeEventListener('storage', changed); };
};
export function usePullArchives(): PullArchive[] {
  const raw = useSyncExternalStore(subscribe, () => window.localStorage.getItem(PULL_ARCHIVE_KEY) ?? '[]', () => '[]');
  try { return parsePullArchives(JSON.parse(raw)); } catch { return []; }
}
