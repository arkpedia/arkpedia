import { useRouter } from 'next/router';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import SearchInput from '@/components/ui/SearchInput';
import SiteSearchRow from '@/components/search/SiteSearchRow';
import { searchSite, siteSearchHref, siteSearchJump, type SiteSearchEntry } from '@/lib/search/siteSearch';
import { useSiteSearch } from '@/lib/search/useSiteSearch';

/** How many rows the nav's list shows; the rest are on /search. */
const SUGGESTIONS = 8;

/* The list's last row when there are more matches than it shows: a row and not a link
   under the field, because the list is drawn over whatever sits under the field, and a
   row is reached with the arrow keys like the others. */
type MoreRow = { kind: 'more'; count: number };
type Row = SiteSearchEntry | MoreRow;
const isMore = (row: Row): row is MoreRow => row.kind === 'more';

export const SearchGlyph = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width="16" height="16" aria-hidden="true">
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="M12.6 12.6 L17 17" strokeLinecap="round" />
  </svg>
);

/**
 * The nav's search: a button beside the theme toggle that opens a search field over the
 * page, the way Terra Wiki's header box works -- type a name, pick a row, land on its
 * page. Every operator, event, episode, stage, enemy, album, song and nav page
 * (lib/search/siteSearch.ts).
 *
 * A button and not a standing field because the bar has no room for one: it measures
 * about 1px of slack at its 1040px cap (see .site-nav-clock-bar in nav.css). The panel
 * is positioned, never in flow, so opening it moves nothing on the page.
 *
 * Enter on a highlighted row opens it; Enter otherwise opens the one exact match, or
 * /search with the whole list.
 */
export default function SiteSearch({ variant }: { variant: 'bar' | 'mobile' }) {
  const router = useRouter();
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /* Fetched the first time the panel opens, then kept: a reader who never searches never
     downloads the index. */
  const [wanted, setWanted] = useState(false);
  const { entries, loading, failed } = useSiteSearch(wanted);
  const results = useMemo(() => searchSite(entries, query), [entries, query]);
  const q = query.trim();
  const suggestions: Row[] = results.slice(0, SUGGESTIONS).map((r) => r.entry);
  if (results.length > SUGGESTIONS) suggestions.push({ kind: 'more', count: results.length });

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  /* flushSync so the field exists before this handler returns, and is focused inside the
     tap itself: iOS raises the keyboard only for a focus made during the gesture, and an
     autoFocus on the next render is too late for it. */
  function openPanel() {
    flushSync(() => { setOpen(true); setWanted(true); });
    inputRef.current?.focus();
  }

  function go(href: string) {
    setQuery('');
    setOpen(false);
    void router.push(href);
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  useEffect(() => {
    const onRoute = () => setOpen(false);
    router.events.on('routeChangeStart', onRoute);
    return () => router.events.off('routeChangeStart', onRoute);
  }, [router.events]);

  return (
    <div ref={wrapRef} className={`site-search site-search-${variant}`}>
      <button
        ref={triggerRef}
        type="button"
        className="site-search-trigger"
        aria-label="Search Arkpedia"
        title="Search Arkpedia"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close(false); else openPanel();
        }}
      >
        <SearchGlyph />
      </button>
      {open && (
        <div id={panelId} className="site-search-pop" role="dialog" aria-label="Search Arkpedia">
          <SearchInput<Row>
            label="Search Arkpedia"
            name="site-search"
            placeholder="Operators, stages, events, enemies…"
            value={query}
            onChange={setQuery}
            inputRef={inputRef}
            suggestions={suggestions}
            getKey={(row) => (isMore(row) ? 'more' : `${row.kind}:${row.href}`)}
            renderSuggestion={(row) => (isMore(row)
              ? <span className="site-search-more">All {row.count} results for “{q}”</span>
              : <SiteSearchRow entry={row} />)}
            onPick={(row) => go(isMore(row) ? siteSearchHref(q) : row.href)}
            suggestLabel="Search results"
            emptyText={failed ? 'Search is unavailable right now.' : loading ? 'Loading search…' : 'Nothing found.'}
            onKeyDown={(event) => {
              if (event.defaultPrevented) return;
              if (event.key === 'Escape') { event.preventDefault(); close(true); }
              else if (event.key === 'Enter' && q) {
                event.preventDefault();
                go(siteSearchJump(results)?.href ?? siteSearchHref(q));
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
