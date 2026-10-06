import { useCallback, useEffect, useState } from 'react';

/**
 * A section's lock: read-only until the reader unlocks it, so a number an import filled in is not
 * changed by a stray tap (the Pull Planner's resources, the Operator Planner's starting levels).
 * What the reader last chose is remembered in this browser (localStorage `arkpediaLock:<key>`);
 * before they have chosen, `lockedByDefault` decides -- locked where the values came from an
 * import, so a reader who types their own is never stopped. Unlocked until mounted, as the server
 * and the first render know neither the import nor the choice.
 */
export function useLock(key: string, lockedByDefault: boolean): [boolean, (locked: boolean) => void] {
  const storageKey = `arkpediaLock:${key}`;
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'locked' || stored === 'unlocked') setChosen(stored === 'locked');
    } catch { /* Storage blocked: the default stands, and a choice lasts for the visit. */ }
  }, [storageKey]);
  const choose = useCallback((locked: boolean) => {
    setChosen(locked);
    try { window.localStorage.setItem(storageKey, locked ? 'locked' : 'unlocked'); } catch { /* the visit only */ }
  }, [storageKey]);
  return [mounted && (chosen ?? lockedByDefault), choose];
}
