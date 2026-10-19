import { useEffect, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { loadSiteSearch, SITE_SEARCH_PATH, type SiteSearchEntry } from './siteSearch';

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
 */
export function useSiteSearch(enabled: boolean): { entries: SiteSearchEntry[]; loading: boolean; failed: boolean } {
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

  const current = state?.url === url ? state : null;
  return { entries: current?.entries ?? [], loading: enabled && !current, failed: !!current?.failed };
}
