/** Reset this origin's saved Arkpedia data and retire live state before reloading. */
const RESET_EVENT = 'arkpedia:reset-data';
const RESET_SIGNAL_KEY = 'arkpedia:reset-signal';
let resetting = false;

export const isResettingBrowserData = () => resetting;

function reloadEmptyTab(clearLocal: boolean): void {
  if (resetting) return;
  resetting = true;
  // The app unmounts its children synchronously: timers and pagehide handlers must not
  // save the music queue or old form state again while the reload is in flight.
  window.dispatchEvent(new Event(RESET_EVENT));
  try {
    window.sessionStorage.clear();
    if (clearLocal) window.localStorage.clear();
  } finally {
    window.location.reload();
  }
}

export function resetBrowserData(): void {
  if (resetting) return;
  const local = window.localStorage;
  const session = window.sessionStorage;
  // A refused first clear leaves the app mounted, so the caller can report the error.
  session.clear();
  // Even an empty local store must notify other open tabs to discard their session data.
  if (local.length === 0) local.setItem(RESET_SIGNAL_KEY, '1');
  local.clear();
  // Clear once more after unmount cleanups, in case one left a final saved value.
  reloadEmptyTab(true);
}

/** The native clear event reaches other tabs; each retires its own in-memory/session state. */
export function watchBrowserDataReset(beforeReload: () => void): () => void {
  const onClear = (event: StorageEvent) => {
    if (event.key === null && event.storageArea === window.localStorage) reloadEmptyTab(false);
  };
  window.addEventListener(RESET_EVENT, beforeReload);
  window.addEventListener('storage', onClear);
  return () => {
    window.removeEventListener(RESET_EVENT, beforeReload);
    window.removeEventListener('storage', onClear);
  };
}
