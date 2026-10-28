import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import SiteSearchRow from '@/components/search/SiteSearchRow';
import { searchSite, siteSearchJump, siteSearchOffSite } from '@/lib/search/siteSearch';
import { useSiteSearch } from '@/lib/search/useSiteSearch';
import { withContentPage } from '@/lib/content/server';

/** Rows drawn at once; a query that matches more is one to narrow, not to scroll. */
const SHOWN = 100;
/** How long the URL waits behind the field, so typing writes one history entry, not ten. */
const URL_DELAY_MS = 300;

/**
 * /search?s=<query>: the site search as a page (lib/search/siteSearch.ts).
 *
 * It is where the nav's box sends Enter when no one row is the answer, and the address a
 * browser searches when Arkpedia is added as a search engine (public/opensearch.xml,
 * and arkpedia.net/?s=, which next.config.js sends here). Arriving with a query that has
 * one exact answer -- an operator's name, a stage code no other stage shares -- opens
 * that page straight away, in place of this one in the history, so Back returns to
 * wherever the search started.
 *
 * The rows come from the content release in the browser, the same file the nav's box
 * reads, so this page needs no redeploy to find a new operator. That takes the empty data
 * function at the bottom: a page without one carries no release, and its box would read the
 * deployment's copy of the index instead.
 */
export default function SearchPage() {
  const router = useRouter();
  const urlQuery = router.isReady && typeof router.query.s === 'string' ? router.query.s : '';
  const [query, setQuery] = useState('');
  /* The queries this page has put in the URL since the last search from outside. One of
     them arriving there is this page's own write catching up -- possibly after the field
     has moved on, so comparing with the latest write alone would snap the field back.
     Anything else is a new search from outside (a first visit, the nav's box, Back),
     which may jump. */
  const written = useRef<string[] | null>(null);
  const pendingJump = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { entries, loading, failed } = useSiteSearch(true, true);
  const results = useMemo(() => searchSite(entries, query), [entries, query]);

  const arrived = useRef('');
  useEffect(() => {
    if (!router.isReady) return;
    const caughtUp = written.current?.indexOf(urlQuery) ?? -1;
    // Caught up: forget that write and the ones before it; the later ones are still on
    // their way. Forgotten, the same query sent again from the nav counts as a new search.
    if (caughtUp >= 0) { written.current = written.current!.slice(caughtUp + 1); return; }
    written.current = [];
    arrived.current = urlQuery;
    setQuery(urlQuery);
    pendingJump.current = urlQuery.trim() !== '';
  }, [router.isReady, urlQuery]);

  useEffect(() => {
    if (!pendingJump.current || loading) return;
    pendingJump.current = false;
    const jump = siteSearchJump(searchSite(entries, arrived.current));
    if (jump) void router.replace(jump.href);
  }, [entries, loading, router]);

  useEffect(() => () => { if (writeTimer.current) clearTimeout(writeTimer.current); }, []);

  function change(value: string) {
    setQuery(value);
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      const next = value.trim();
      (written.current ??= []).push(next);
      void router.replace({ pathname: '/search', query: next ? { s: next } : {} }, undefined, { shallow: true, scroll: false });
    }, URL_DELAY_MS);
  }

  const q = query.trim();
  return (
    <>
      {/* A results page is not a page of its own to a search engine. */}
      <PageMeta title={q ? `${q} — Search` : 'Search'} description="Search Arkpedia: operators, artists and voice actors, events, stages, enemies, music and every page." path="/search" noindex />
      <PageHeader eyebrow="Rhodes Island // Search" title="Search" sub="Operators, artists and voice actors, events, stages, enemies, music, every page of the site, and the community's YouTube and Twitch." />
      <main className="site-search-page">
        <SearchInput
          label="Search Arkpedia"
          name="s"
          placeholder="Search Arkpedia…"
          value={query}
          onChange={change}
          autoFocus={!urlQuery}
          className="site-search-page-field"
        />
        {q && (
          <p className="site-search-page-count" aria-live="polite">
            {failed ? 'Search is unavailable right now.'
              : loading ? 'Loading search…'
              : results.length === 0 ? `Nothing found for “${q}”.`
              : results.length > SHOWN ? `The first ${SHOWN} of ${results.length} results for “${q}”.`
              : `${results.length} result${results.length === 1 ? '' : 's'} for “${q}”.`}
          </p>
        )}
        {results.length > 0 && (
          <ul className="site-search-page-list">
            {results.slice(0, SHOWN).map(({ entry }) => (
              <li key={`${entry.kind}:${entry.href}`}>
                {/* YouTube and Twitch open in a new tab, as the community page's links do. */}
                {siteSearchOffSite(entry)
                  ? <a href={entry.href} target="_blank" rel="noopener noreferrer" className="site-search-page-row"><SiteSearchRow entry={entry} /></a>
                  : <Link prefetch={false} href={entry.href} className="site-search-page-row"><SiteSearchRow entry={entry} /></Link>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

/* No props of its own: withContentPage is here for the release it attaches, which points
   the index fetch at the release's copy (useSiteSearch). bundledWhenUnpublished: the
   releases before this have no /search page, and the builder reads nothing from data/. */
type Props = Record<string, never>;

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/search', async () => ({ props: {} }), {
  bundledWhenUnpublished: true,
});
