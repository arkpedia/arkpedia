import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import SearchInput from '@/components/ui/SearchInput';
import SiteSearchRow from '@/components/search/SiteSearchRow';
import { searchSite, siteSearchHref, siteSearchJump, type SiteSearchEntry } from '@/lib/search/siteSearch';
import { useSiteSearch } from '@/lib/search/useSiteSearch';

/** How many rows the pop-up lists; the rest are on /search. */
const SUGGESTIONS = 10;

/* The list's last row when there are more matches than it shows: a row and not a link
   under the list, so the arrow keys reach it like the others. */
type MoreRow = { kind: 'more'; count: number };
type Row = SiteSearchEntry | MoreRow;
const isMore = (row: Row): row is MoreRow => row.kind === 'more';

export const SearchGlyph = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width="16" height="16" aria-hidden="true">
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="M12.6 12.6 L17 17" strokeLinecap="round" />
  </svg>
);

/** A key press that is typing somewhere, where "/" belongs to the field. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export interface SiteSearchControl {
  open: boolean;
  inputRef: RefObject<HTMLInputElement>;
  /** Opens the pop-up from a tap or click; returns focus to `from` when it closes. */
  openFrom: (from: HTMLElement | null) => void;
  close: () => void;
}

/**
 * The one site search pop-up's state, held by the nav (components/layout/Sitenav.tsx) so the
 * bar's trigger, the phone bar's trigger and the keyboard all open the same dialog.
 *
 * Ctrl+K or Cmd+K opens it from anywhere; "/" opens it unless the reader is typing in a field.
 * openFrom renders the field inside the tap itself (flushSync) and focuses it there: iOS
 * raises the keyboard only for a focus made during the gesture, and an autoFocus on the next
 * render is too late for it.
 */
export function useSiteSearchControl(): SiteSearchControl {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const openFrom = useCallback((from: HTMLElement | null) => {
    returnTo.current = from;
    flushSync(() => setOpen(true));
    inputRef.current?.focus();
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    returnTo.current?.focus();
    returnTo.current = null;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const shortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !typing(event.target);
      if (!shortcut && !slash) return;
      event.preventDefault();
      if (open) inputRef.current?.focus();
      else openFrom(document.activeElement as HTMLElement | null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, openFrom]);

  useEffect(() => {
    const onRoute = () => { setOpen(false); returnTo.current = null; };
    router.events.on('routeChangeStart', onRoute);
    return () => router.events.off('routeChangeStart', onRoute);
  }, [router.events]);

  return { open, inputRef, openFrom, close };
}

/**
 * The search button in a nav bar: the magnifier, the theme toggle's size on the desktop bar and
 * a 44px tile on the phone bar (nav.css). Its tooltip names the shortcut.
 */
export function SiteSearchTrigger({ variant, control }: { variant: 'bar' | 'mobile'; control: SiteSearchControl }) {
  // Ctrl on the server and everywhere but a Mac, so the first paint never disagrees with it.
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setMod('⌘');
  }, []);
  return (
    <button
      type="button"
      // btn-bare: a field-like control, not a button, so it takes none of the button voice.
      className={`btn-bare site-search-trigger site-search-trigger-${variant}`}
      aria-label="Search Arkpedia"
      title={`Search Arkpedia (${mod === '⌘' ? '⌘' : 'Ctrl'}+K)`}
      aria-haspopup="dialog"
      aria-expanded={control.open}
      onClick={(event) => {
        event.stopPropagation();
        control.openFrom(event.currentTarget);
      }}
    >
      <SearchGlyph />
    </button>
  );
}

/**
 * The site search as a pop-up over the page: the field, the best matches under it, and a key
 * legend, in the site's own panel (search.css). Every
 * operator, event, episode, stage, enemy, album, song and nav page (lib/search/siteSearch.ts).
 *
 * Enter on a highlighted row opens it; Enter otherwise opens the one exact match, or /search
 * with the whole list. Escape, a click outside the frame, or a route change closes it. It is
 * fixed over the page and never in flow, so opening it moves nothing under it.
 */
export default function SiteSearchDialog({ control }: { control: SiteSearchControl }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  /* The index is fetched the first time the pop-up opens, then kept: a reader who never
     searches never downloads it. */
  const [wanted, setWanted] = useState(false);
  useEffect(() => { if (control.open) setWanted(true); }, [control.open]);
  const { entries, loading, failed } = useSiteSearch(wanted);
  const results = useMemo(() => searchSite(entries, query), [entries, query]);
  const q = query.trim();
  const suggestions: Row[] = results.slice(0, SUGGESTIONS).map((r) => r.entry);
  if (results.length > SUGGESTIONS) suggestions.push({ kind: 'more', count: results.length });

  function go(href: string) {
    setQuery('');
    control.close();
    void router.push(href);
  }

  if (!control.open) return null;
  return (
    <div className="site-search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) control.close(); }}>
      <div className="site-search-dialog" role="dialog" aria-modal="true" aria-label="Search Arkpedia"
        onKeyDown={(event) => { if (event.key === 'Tab') event.preventDefault(); }}>
        <SearchInput<Row>
          label="Search Arkpedia"
          name="site-search"
          className="site-search-dialog-field"
          placeholder="Operators, stage codes, events, enemies, songs…"
          value={query}
          onChange={setQuery}
          inputRef={control.inputRef}
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
            if (event.key === 'Escape') { event.preventDefault(); control.close(); }
            else if (event.key === 'Enter' && q) {
              event.preventDefault();
              go(siteSearchJump(results)?.href ?? siteSearchHref(q));
            }
          }}
        />
        {!q && <p className="site-search-dialog-hint">Try an operator, a stage code like 1-7, an event, an enemy or a song.</p>}
        <div className="site-search-dialog-keys" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> Move</span>
          <span><kbd>Enter</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
