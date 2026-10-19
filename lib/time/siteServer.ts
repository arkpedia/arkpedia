import { useSyncExternalStore } from 'react';
import { ACCOUNT_EVENT, showAccount, storedAccount, storedOtherAccounts } from '@/lib/account/accountStore';
import { isServerId, SERVER_IDS, type ServerId } from '@/lib/account-import/yostar';

/**
 * The server the whole site shows: its clock and reset, banner and event timings, maintenance and
 * everything else that reads useRegionalTime.
 *
 * The reader picks it by clicking the reset label in the nav (ServerClock), which steps Global,
 * Japan, Korea; an import picks the imported account's (lib/account/importAccount.ts). Until either
 * happens it is the shown account's server, and Global with no account. Kept in this browser
 * only, like the account itself.
 *
 * Choosing a server that has an imported account waiting (accountStore OTHER_ACCOUNTS_KEY) shows
 * that account too, so the planner and pull pages read the same server as the clock. One with no
 * account keeps the shown one: its own roster and pulls, on the chosen server's calendar.
 */
/** Read before the first paint too, by _document's boot script, for <html data-site-server>. */
export const SITE_SERVER_KEY = 'arkpedia-site-server';
const SITE_SERVER_EVENT = 'arkpediaSiteServerChanged';

function chosen(): ServerId | null {
  try {
    const value = window.localStorage?.getItem(SITE_SERVER_KEY);
    return isServerId(value) ? value : null;
  } catch {
    return null;
  }
}

/** The site's server now, outside React. Global on the server and before any choice or account. */
export function siteServerNow(): ServerId {
  if (typeof window === 'undefined') return 'en';
  return chosen() ?? storedAccount()?.server ?? 'en';
}

/** Makes `server` the site's server, without touching the accounts (an import calls this). */
export function rememberSiteServer(server: ServerId): void {
  try {
    window.localStorage?.setItem(SITE_SERVER_KEY, server);
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
  window.dispatchEvent(new Event(SITE_SERVER_EVENT));
}

/** The server after `server` in the nav's cycle: Global, Japan, Korea, and round again. */
export const nextServer = (server: ServerId): ServerId => SERVER_IDS[(SERVER_IDS.indexOf(server) + 1) % SERVER_IDS.length];

/** The nav's click: the next server, and its imported account if one is waiting. */
export function cycleSiteServer(): ServerId {
  const next = nextServer(siteServerNow());
  if (storedOtherAccounts()[next]) showAccount(next);
  rememberSiteServer(next);
  return next;
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(ACCOUNT_EVENT, onChange);
  window.addEventListener(SITE_SERVER_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(ACCOUNT_EVENT, onChange);
    window.removeEventListener(SITE_SERVER_EVENT, onChange);
  };
}

/** Keeps <html data-site-server> on the site's server after the boot script set it (what CSS
 *  that must not wait for React reads, such as the home maintenance notice). */
export function applySiteServerAttribute(server: ServerId): void {
  if (server === 'en') document.documentElement.removeAttribute('data-site-server');
  else document.documentElement.setAttribute('data-site-server', server);
}

/** The site's server: Global on the server and in the first paint, so the markup matches; the
 *  reader's arrives right after, as useAccount's does. */
export function useSiteServer(): ServerId {
  return useSyncExternalStore(subscribe, siteServerNow, () => 'en');
}
