import { useEffect, useState } from 'react';
import { LATEST_CHANGE } from './entries';

/*
 * Whether this reader has seen the latest changelog entry, for the dot on the nav's What's
 * new (components/layout/Sitenav.tsx, MobileNavDrawer.tsx). Kept in this browser only: a dot
 * is a convenience, and storage that is blocked or cleared just shows it again.
 */
const KEY = 'arkpedia.changelog.seen';
const EVENT = 'arkpedia:changelog-seen';

function seen(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

/** True once mounted when the latest entry is newer than what this reader last opened. */
export function useChangelogUnseen(): boolean {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    const update = () => setUnseen(!!LATEST_CHANGE && seen() < LATEST_CHANGE);
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return unseen;
}

/** Called by the What's new page: the reader has now seen the latest entry. */
export function markChangelogSeen(): void {
  try { localStorage.setItem(KEY, LATEST_CHANGE); } catch { /* storage blocked: the dot stays */ }
  window.dispatchEvent(new Event(EVENT));
}
