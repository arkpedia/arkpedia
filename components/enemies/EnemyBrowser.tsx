import { useContentUrl } from '@/lib/content/context';
import { ContentImg } from '@/components/content/ContentImage';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EnemyContent, EnemySummary } from '@/lib/enemies/enemyTypes';
import ContentPicker, { ContentPickerOption } from '@/components/ui/ContentPicker';
import { matchesSearch } from '@/lib/search/searchNormalize';

/**
 * Enemy icons skip Next's image optimizer.
 *
 * It cannot serve a good number of these filenames. Ask it for
 * `/enemies-icons/Originium Slug α.webp` and it answers 400, "The requested resource
 * isn't a valid image"; ask for `'Plastic' Szewczyk.webp` and the image never decodes.
 * 271 of the 1,585 icons contain an apostrophe and 30 contain a non-ASCII letter, so
 * a browser walking the grid finds a couple of dozen broken pictures at any scroll
 * position. The files themselves are fine and serve correctly when requested directly.
 *
 * Rather than encode around it character by character, these bypass it. There is
 * nothing to gain anyway: they are 1-3KB webp files already sized for the 72px tile
 * they sit in, so the optimizer was re-encoding tiny images to the same size, 1,585
 * times. It also drops a request per tile.
 *
 * Not new, and not caused by the redesign -- main renders these the same way. It went
 * unnoticed because `next dev` optimizes differently and the Pages demo set
 * images.unoptimized globally, so neither place anyone looked ever hit it.
 */

/**
 * How much of the top of the screen the fixed mobile bar is covering.
 *
 * Measured, not a constant. It was 52 here and 52 again in three stylesheets, and the
 * day a clock strip went on top of the bar every one of those was quietly wrong by the
 * height of the strip -- nothing to fail, just a heading landing under the bar. The
 * stylesheets read --nav-h, which MobileNavDrawer measures off the bar; this reads the
 * bar itself, which needs no effect to have run first.
 */
function mobileNavHeight(): number {
  const bar = document.querySelector('.mobile-nav-bar');
  return bar ? Math.round(bar.getBoundingClientRect().height) : 0;
}

/** The grade tabs the game shows above its grid. Leader is our Boss rank. */
const TYPE_TABS = [
  { key: 'all', label: 'All' },
  /* Normal is the biggest rank of the three (737 of 1,585) and was the only
     one with no tab -- "everything that is not Elite or Leader" was a filter
     you could see the shape of but not ask for. */
  { key: 'Normal', label: 'Normal' },
  { key: 'Elite', label: 'Elite' },
  { key: 'Boss', label: 'Leader' },
] as const;

/**
 * How many tiles the grid paints before the reader asks for more. All 1,540 at once
 * is a lot of grid for a pane four columns wide: every tile is a DOM node and an
 * unoptimized <ContentImg> request, and they were all mounted on arrival whether or not
 * anyone scrolled to them. Same page size and same "Show more" affordance as the
 * operators roster.
 */
const PAGE_SIZE = 40;

export type SortField = 'handbook' | 'name' | 'hp' | 'atk' | 'def' | 'res';
type SortDir = 'asc' | 'desc';

/**
 * Which direction a field means when first picked. Ascending is the useful
 * reading of handbook order and of a name, and the useless reading of a stat --
 * nobody opens an HP sort to find the frailest enemy in the game.
 */
const NATURAL_DIR: Record<SortField, SortDir> = {
  handbook: 'asc', name: 'asc', hp: 'desc', atk: 'desc', def: 'desc', res: 'desc',
};
/**
 * The order the game's own Race panel lists these in, which is not alphabetical and
 * is not frequency either -- it is the game's, so the filter should match it. Every
 * one of these 11 is present in the data; anything upstream adds later sorts after
 * them, and the 937 unclassified records are "Other", last, as in the game.
 */
const RACE_ORDER = [
  'Infected Creature', 'Drone', 'Sarkaz', 'Possessed', 'Sea Monster', 'Arts Creation',
  'Apparition', 'Machina', 'Wild Beast', 'Collapsal', 'Originium Creation',
];

const SORTS: { key: SortField; label: string }[] = [
  { key: 'handbook', label: 'No.' },
  { key: 'name', label: 'Name' },
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'res', label: 'RES' },
];

export interface Filters {
  search: string;
  type: string;
  race: string;
  movement: string;
  position: string;
  damage: string;
  content: string;
}
export const EMPTY_FILTERS: Filters = {
  search: '', type: 'all', race: 'all', movement: 'all', position: 'all', damage: 'all', content: 'all',
};

interface Props {
  /** Rows to show before the full index arrives -- the selected enemy's own
   *  introduction group, so the grid is never empty on first paint. */
  seed: EnemySummary[];
  contents: EnemyContent[];
  selectedSlug?: string;
  /** The open enemy's detail, shown when the filter panel is closed. */
  children?: React.ReactNode;
}

export default function EnemyBrowser({ seed, contents, selectedSlug, children }: Props) {
  const contentUrl = useContentUrl();
  // The whole index is fetched once rather than shipped with all 1,585 pages:
  // 509KB per page is not a grid. Until it lands, the seed rows stand in.
  const [all, setAll] = useState<EnemySummary[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(contentUrl('/enemies-index.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => { if (live && rows) setAll(rows as EnemySummary[]); })
      .catch(() => {});
    return () => { live = false; };
  }, [contentUrl]);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState<SortField>('handbook');
  const [sortDir, setSortDir] = useState<SortDir>(NATURAL_DIR.handbook);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterActionsRef = useRef<HTMLSpanElement | null>(null);
  const filterPopupRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (filterActionsRef.current?.contains(event.target as Node) || filterPopupRef.current?.contains(event.target as Node)) return;
      setFiltersOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (event.target instanceof Element && event.target.closest('.enemy-appear-list'))) return;
      setFiltersOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [filtersOpen]);

  // On a phone the grid sits ABOVE the detail rather than beside it, so choosing an
  // enemy leaves the thing you picked below the fold. Scroll it up under the nav so
  // it fills the screen. Only on a selection CHANGE -- landing on a page directly
  // should not fling you past the grid you have not seen yet.
  const detailRef = useRef<HTMLDivElement | null>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 901px)').matches) return;  // both panes already visible
    const pane = detailRef.current;
    if (!pane) return;
    // The bar is fixed at the top, so scrolling to the pane's own offset would put
    // its first line underneath it.
    const top = pane.getBoundingClientRect().top + window.scrollY - mobileNavHeight();
    // Instant for anyone who asked for less motion; a 500px jump animated is
    // exactly the kind of movement that setting is for.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }, [selectedSlug]);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const rows = all || seed;
  const races = useMemo(() => {
    const present = new Set(rows.map((e) => e.race).filter(Boolean) as string[]);
    const rank = (r: string) => {
      const i = RACE_ORDER.indexOf(r);
      return i === -1 ? RACE_ORDER.length : i;
    };
    return [...present].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [rows]);

  /* One count per content: how many enemies it fields. Contents that field nothing
     are dropped rather than offered as options that can only empty the grid -- the
     same rule the appearances picker follows in the other direction, where an enemy
     lists only the contents it actually turns up in. */
  const contentOptions: ContentPickerOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of rows) {
      if (e.hidden) continue;
      for (const id of e.appears_in || []) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return contents
      .filter((c) => counts.has(c.id))
      .map((c) => ({ kind: c.kind, id: c.id, label: c.label, name: c.name, count: counts.get(c.id) || 0 }));
  }, [contents, rows]);

  const shown = useMemo(() => {
    let list = rows.filter((e) => !e.hidden);
    if (filters.type !== 'all') list = list.filter((e) => e.rank === filters.type);
    if (filters.movement !== 'all') list = list.filter((e) => e.movement === filters.movement);
    if (filters.position !== 'all') list = list.filter((e) => e.attack_position === filters.position);
    if (filters.damage !== 'all') list = list.filter((e) => e.damage_type.includes(filters.damage));
    if (filters.race !== 'all') {
      // 937 of 1,585 have no race upstream, so "Other" is a real bucket rather
      // than an empty option.
      list = filters.race === 'none' ? list.filter((e) => !e.race) : list.filter((e) => e.race === filters.race);
    }
    /* Appears in, not introduced by. An enemy debuts in one content and is then
       fielded by any number of others, so matching on introduced_by answered a
       question nobody asked: picking a chapter listed only the enemies that were NEW
       in it, hiding every returning one. EP 01 goes from 6 to 15 that way, and IS2
       from 17 to 175. Every visible enemy has at least one appearance record, so
       nothing falls out of the filter entirely. */
    if (filters.content !== 'all') {
      list = list.filter((e) => (e.appears_in || []).includes(filters.content));
    }
    if (filters.search.trim()) {
      list = list.filter((e) => matchesSearch(e.name, filters.search) || matchesSearch(e.index || '', filters.search));
    }

    const flip = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortField === 'name') return a.name.localeCompare(b.name) * flip;
      if (sortField === 'handbook') return (a.sort - b.sort) * flip || a.name.localeCompare(b.name);
      const va = a[sortField];
      const vb = b[sortField];
      // A missing stat sorts last in BOTH directions: an enemy with no declared
      // DEF is unknown, not the weakest, so flipping should not parade the
      // unknowns to the front.
      if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1;
      return (va - vb) * flip || a.name.localeCompare(b.name);
    });
  }, [rows, filters, sortField, sortDir]);

  function pickSort(field: SortField) {
    if (field === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir(NATURAL_DIR[field]); }
  }

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /* The most tiles the grid has been asked for. See shownCount below. */
  const highWater = useRef(PAGE_SIZE);
  /* Narrowing or reordering starts the count over. Otherwise a search matching three
     enemies would still be paying for however far the reader had walked the full list,
     and "Show more" would sit under a grid that had nothing more to show.
     Keyed on the filters' VALUES rather than the object. `filters` is replaced whole by
     every setFilters, so depending on it reset the count on changes that were not
     narrowings, and the grid collapsed under the reader for no reason they could see. */
  const filterKey = `${filters.search}|${filters.type}|${filters.race}|${filters.movement}`
    + `|${filters.position}|${filters.damage}|${filters.content}`;
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    highWater.current = PAGE_SIZE;
  }, [filterKey, sortField, sortDir]);

  /*
   * How many tiles the grid paints: what the reader has asked for, and never less.
   *
   * The open enemy has to be IN the grid, whatever page it falls on. B1 is the first
   * tile, but a link, a bookmark or a referenced-enemy jump can land on #1,400, and a
   * handbook that will not show you where you are is worse than one that paints a few
   * more tiles. Rounded up to a whole page, so the count stays on the boundaries "Show
   * more" walks.
   *
   * Held as a high-water mark, which is the part that was missing. The selection term
   * is a floor and the reader's own count is a floor, and taking the larger of the two
   * each render meant that if anything reset visibleCount the grid fell back to
   * whatever the selection alone required: the nearest page boundary after the open
   * enemy. Choosing a tile near the top of a list expanded to 240 collapsed it to 40,
   * and the next choice expanded it again, which is a list that jitters as you read it.
   * A ref, not state, because it is derived rather than a thing to render on: raising
   * it during a render that is already happening needs no second one.
   */
  const selectedIndex = selectedSlug ? shown.findIndex((e) => e.slug === selectedSlug) : -1;
  const wanted = Math.max(
    visibleCount,
    selectedIndex === -1 ? PAGE_SIZE : Math.ceil((selectedIndex + 1) / PAGE_SIZE) * PAGE_SIZE
  );
  /* Reset with the filters, not with a click: a narrowed list genuinely starts over. */
  if (wanted > highWater.current) highWater.current = wanted;
  const shownCount = highWater.current;

  const narrowed = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[])
    .some((key) => filters[key] !== EMPTY_FILTERS[key]);
  const clearNarrowing = () => { setFilters(EMPTY_FILTERS); setFiltersOpen(false); };

  return (
    <div className="enemy-frame">
      <div className="enemy-frame-head">
        <span className="enemy-frame-sorts">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`enemy-sort${sortField === s.key ? ' current' : ''}`}
              onClick={() => pickSort(s.key)}
            >
              {s.label}
              {sortField === s.key && <span aria-hidden="true">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
            </button>
          ))}
        </span>
        <span className="enemy-frame-tabs">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`enemy-type-tab${filters.type === t.key ? ' current' : ''}`}
              onClick={() => set('type', t.key)}
            >
              {t.label}
            </button>
          ))}
        </span>
        <span className="enemy-filter-actions" ref={filterActionsRef}>
          <button
            type="button"
            className={`enemy-filter-btn${filtersOpen ? ' current' : ''}${narrowed ? ' enemy-clear-btn' : ''}`}
            aria-expanded={narrowed ? undefined : filtersOpen}
            onClick={narrowed ? clearNarrowing : () => setFiltersOpen((value) => !value)}
          >
            {narrowed ? 'Clear' : 'Filter'}
          </button>
          {narrowed && (
            <button
              type="button"
              className={`enemy-filter-btn enemy-filter-edit${filtersOpen ? ' current' : ''}`}
              aria-label="Adjust filters"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <svg className="enemy-filter-btn-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" />
                <circle cx="7" cy="5" r="2" fill="var(--panel)" />
                <circle cx="13" cy="10" r="2" fill="var(--panel)" />
                <circle cx="9" cy="15" r="2" fill="var(--panel)" />
              </svg>
            </button>
          )}
        </span>
        {filtersOpen && (
          <div className="enemy-filter-popup" ref={filterPopupRef}>
            <EnemyFilterPanel
              filters={filters}
              set={set}
              races={races}
              contentOptions={contentOptions}
              contentTotal={rows.filter((enemy) => !enemy.hidden).length}
              onClose={() => setFiltersOpen(false)}
              shown={shown.length}
            />
          </div>
        )}
      </div>

      <div className="enemy-frame-body">
        <div className="enemy-grid-pane">
          <div className="enemy-grid">
            {shown.slice(0, shownCount).map((e) => (
              <Link prefetch={false}
                key={e.slug}
                /* The selection is a query on one page, not a route per enemy --
                   pointing at the old path made Next fetch a page chunk that no
                   longer exists, fail, and fall back to a full reload that the
                   server then had to redirect. `shallow` keeps it a URL change
                   rather than a data round-trip; the panel fetches its own record. */
                href={`/enemies?e=${encodeURIComponent(e.slug)}`}
                shallow
                className={`enemy-tile${e.slug === selectedSlug ? ' current' : ''}`}
                title={e.name}
                // Picking a tile must not move the page. The frame is locked to the
                // viewport and each pane scrolls itself, so the only thing the
                // window scrolls is the header out of the way -- and Next's default
                // scroll-to-top on a route change pulled that header straight back
                // down, shoving the frame with it, every time an enemy was chosen
                // from anywhere but the very top. The grid kept its own place, so
                // what the reader saw was the page jumping around a tile that had
                // not moved. Mobile still gets scrolled deliberately, by the
                // selection effect above -- there the detail sits below the grid.
                scroll={false}
                // Picking an enemy means the search did its job, so the panel gets
                // out of the way -- it sits over the detail pane, so leaving it open
                // would hide the very enemy that was just chosen. The filters
                // themselves are kept: the reader is browsing a narrowed set and
                // will want the next tile too.
                onClick={() => setFiltersOpen(false)}
              >
                {/* The handbook code, badged as the game badges it. */}
                <span className="enemy-tile-index">{e.index || '—'}</span>
                {e.icon ? (
                  <Image
                    src={e.icon}
                    alt=""
                    width={72}
                    height={72}
                    className="enemy-tile-art"
                    unoptimized
                  />
                ) : (
                  <span className="enemy-tile-art blank" aria-hidden="true" />
                )}
              </Link>
            ))}
          </div>
          {shownCount < shown.length && (
            <div className="enemy-grid-more">
              <span className="hint">{shownCount} of {shown.length}</span>
              <button type="button" className="ghost" onClick={() => setVisibleCount(shownCount + PAGE_SIZE)}>
                Show more
              </button>
              {/* Kept beside Show more rather than replacing it: paging exists
                  because every tile is a DOM node and an image request, and
                  1,540 of them at once is a real cost on a phone. But a reader
                  who wants the whole list should not have to press a button
                  thirty-seven times to get it. */}
              <button
                type="button"
                className="ghost"
                onClick={() => setVisibleCount(shown.length)}
                title={`Show all ${shown.length} at once`}
              >
                Show all {shown.length}
              </button>
            </div>
          )}
          {shown.length === 0 && <p className="hint enemy-grid-empty">Nothing matches those filters.</p>}
        </div>

        <div className="enemy-detail-pane" ref={detailRef}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Filters stay in a compact popup while the enemy detail remains visible. */
function EnemyFilterPanel({
  filters, set, races, contentOptions, contentTotal, onClose, shown,
}: {
  filters: Filters;
  set: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  races: string[];
  contentOptions: ContentPickerOption[];
  contentTotal: number;
  onClose: () => void;
  shown: number;
}) {
  const group = (
    label: string,
    key: keyof Filters,
    options: { value: string; label: string }[]
  ) => (
    <div className="enemy-filter-group">
      <h4 className="enemy-section-head">{label}</h4>
      <div className="enemy-filter-chips">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            /* primary/ghost, the same pair the operators roster uses for its
               rarity filters, rather than a chip shape invented for this page. */
            className={filters[key] === o.value ? 'primary' : 'ghost'}
            onClick={() => set(key, filters[key] === o.value ? 'all' : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="enemy-filters">
      <div className="enemy-filters-head">
        <h3 className="enemy-section-head">Filters</h3>
        <span className="hint">{shown} matching</span>
      </div>
      <input
        type="search"
        className="enemy-filter-search"
        aria-label="Search enemies"
        placeholder="Search by name or code..."
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
      />
      {group('Race', 'race', [
        ...races.map((r) => ({ value: r, label: r })),
        // The 937 records upstream leaves unclassified; the game calls this Other.
        { value: 'none', label: 'Other' },
      ])}
      {group('Location', 'movement', [
        { value: 'Ground', label: 'Ground' },
        { value: 'Flying', label: 'Flying' },
      ])}
      {group('Attack Pattern', 'position', [
        { value: 'Melee', label: 'Melee' },
        { value: 'Ranged', label: 'Ranged' },
        // The game's panel has no chip for this; 91 enemies genuinely do both.
        { value: 'Melee and Ranged', label: 'Melee and Ranged' },
      ])}
      {group('Damage Type', 'damage', [
        { value: 'Physical', label: 'Physical' },
        { value: 'Arts', label: 'Arts' },
        { value: 'Healing', label: 'Healing' },
        // Upstream's wording for what the game's filter calls Null.
        { value: 'No Damage', label: 'No Damage' },
      ])}
      <div className="enemy-filter-group">
        <h4 className="enemy-section-head">Appears in</h4>
        {/* The same picker the Appearances list uses. It was a native <select>,
            which the OS draws in the system font: no teal shorthand, no counts
            lined up down the right, and one grouping level at most. Two panels on
            one page offering the same choice should not look like two products. */}
        <ContentPicker
          options={contentOptions}
          value={filters.content}
          onChange={(id) => set('content', id)}
          countNoun="enemy"
          countNounPlural="enemies"
          anyOption={{ id: 'all', name: 'Any content', count: contentTotal }}
          ariaLabel="Appears in"
          searchable
        />
      </div>
      <div className="enemy-filters-foot">
        {/* Reset used to sit here too; it would now say the same thing as Clear above. */}
        <button type="button" className="primary" onClick={onClose}>Show {shown}</button>
      </div>
    </div>
  );
}
