import { useEffect, useMemo, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { loadSiteSearch, loadSiteSearchFeeds, SITE_SEARCH_PATH, type SiteSearchEntry } from './siteSearch';

/* One fetch per release URL for the whole visit: the nav's box and /search share it, and
   reopening the box does not fetch again. A failed load is forgotten, so the next open
   tries again rather than remembering an offline moment for the rest of the visit. */
const loads = new Map<string, Promise<SiteSearchEntry[]>>();

function load(url: string): Promise<SiteSearchEntry[]> {
  let pending = loads.get(url);
  if (!pending) {
    pending = loadSiteSearch(url);
    pending.catch(() => loads.delete(url));
    loads.set(url, pending);
  }
  return pending;
}

/**
 * The site search's rows (lib/search/siteSearch.ts), fetched from the page's content
 * release the first time `enabled` is true -- the nav passes whether its box has been
 * opened, so a page that never searches never downloads the index.
 *
 * The YouTube and Twitch rows (/api/search-feeds) are fetched again each time `open` turns
 * true, since who is live changes while a visit lasts; the route's own cache headers keep
 * a reopen from reaching the feeds. Until they arrive, and if they fail, the index alone is
 * the search: they sort under its rows, so their arrival adds to the end of the list and
 * moves nothing above it, and a failed feed is not an offline search.
 */
export function useSiteSearch(enabled: boolean, open: boolean): { entries: SiteSearchEntry[]; loading: boolean; failed: boolean } {
  const contentUrl = useContentUrl();
  const url = contentUrl(SITE_SEARCH_PATH);
  const [state, setState] = useState<{ url: string; entries: SiteSearchEntry[]; failed: boolean } | null>(null);

  useEffect(() => {
    if (!enabled || state?.url === url) return;
    let live = true;
    load(url)
      .then((entries) => { if (live) setState({ url, entries, failed: false }); })
      .catch((error) => {
        console.error(error);
        if (live) setState({ url, entries: [], failed: true });
      });
    return () => { live = false; };
  }, [enabled, url, state?.url]);

  const [feeds, setFeeds] = useState<SiteSearchEntry[]>([]);
  useEffect(() => {
    if (!enabled || !open) return;
    const abort = new AbortController();
    loadSiteSearchFeeds(abort.signal)
      .then(setFeeds)
      // The last feeds stay: a failed refresh is no reason to forget who was live.
      .catch((error) => { if (!abort.signal.aborted) console.warn(error); });
    return () => abort.abort();
  }, [enabled, open]);

  const current = state?.url === url ? state : null;
  const entries = useMemo(() => (current && !current.failed ? [...current.entries, ...feeds] : []), [current, feeds]);
  return { entries, loading: enabled && !current, failed: !!current?.failed };
}
