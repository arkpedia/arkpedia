const EMPTY_WINDOWS: Record<string, number[]> = {};

import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { useContentUrl, useReleaseTable } from '@/lib/content/context';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterType, StageContentEntry, StageGroup, StageSummary, TYPE_LABELS, TYPE_ORDER, variantLabel } from '@/lib/stages/stageTypes';
import type { NavData } from '@/lib/stages/stageNav';
import { compareStageSummaries } from '@/lib/stages/stageSort';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import StyledSelect, { type SelectOption } from '@/components/ui/StyledSelect';
import SearchInput from '@/components/ui/SearchInput';
import { fetchAsset } from '@/lib/assets/assetRetry';

/** One choice in the rail's filters: a chapter or event has a code column
 *  ("EP 04"), a stage type does not. */
interface PickerOption {
  id: string;
  /** Short code shown in its own column, e.g. "EP 04". May be empty. */
  code: string;
  name: string;
  count: number | null;
}

interface PickerGroup {
  id: string;
  /** Heading above the group. Empty for a single ungrouped list. */
  label: string;
  options: PickerOption[];
}

type RailOption = SelectOption & { code: string; name: string };

/**
 * The rail's two filters, on the site's one dropdown (components/ui/StyledSelect).
 * The code and the name are two aligned columns -- the reason this was once a
 * listbox of its own rather than a native select, whose OS-drawn popup cannot
 * align anything -- and the chapter list is wider than the 264px rail.
 */
function RailFilter({ label, value, groups, onChange }: {
  label: string;
  value: string;
  groups: PickerGroup[];
  onChange: (id: string) => void;
}) {
  const options = useMemo<RailOption[]>(() => groups.flatMap((g) => g.options.map((o) => ({
    value: o.id,
    // What type-to-find matches: the code as well as the name, so "EP" finds the
    // episodes.
    label: o.code ? `${o.code} ${o.name}` : o.name,
    group: g.label || undefined,
    code: o.code,
    name: o.name,
  }))), [groups]);
  /** The widest code decides the column, so every name starts in one place. */
  const codeWidth = useMemo(() => options.reduce((w, o) => Math.max(w, o.code.length), 0), [options]);
  const row = (o: RailOption) => (
    <>
      {codeWidth > 0 && <span className="stage-pick-code" style={{ minWidth: `${codeWidth}ch` }}>{o.code}</span>}
      <span className="stage-pick-name">{o.name}</span>
    </>
  );
  return (
    <StyledSelect<RailOption>
      className="stage-rail-filter"
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      menuMinWidth={420}
      renderOption={row}
      renderValue={row}
    />
  );
}

interface Props {
  /** Stages per type, counted over the whole dataset, so the type filter's numbers
   *  are right before the rows arrive from /stages-index.json. */
  typeCounts: Record<string, number>;
  /** The request's clock, in unix seconds. It picks the content the list opens on,
   *  so the first client render agrees with the markup; an effect then re-picks
   *  against the reader's own clock. */
  now: number;
  /**
   * The stage open in the pane beside this list: its slug, null when the address
   * names none, and undefined until the page has read the address at all -- the first
   * render of a static page has no query, so a deep link is not known yet. Required,
   * tri-state on purpose: the list scopes itself to the open stage's chapter, and a
   * caller that could leave this out is how it came to scope itself to a stage nobody
   * asked for.
   */
  selectedSlug: string | null | undefined;
}

interface Filters {
  search: string;
  type: string;
  content: string;
}

/** The clock the Current group and the default chapter are read against, rounded
 *  down to the minute so that re-reading it is a no-op for React unless a minute
 *  has actually passed. */
const nowSeconds = () => Math.floor(Date.now() / 60000) * 60;

/** Where the rail remembers its filters, so a row click does not reset them. */
const STORE_KEY = 'arkpedia.stages.filters';
/** Rendering all 4,130 rows is 25k DOM nodes; the rest is a filter away. */
const ROW_CAP = 600;

function matchesFilters(s: StageSummary, f: Filters) {
  // A search looks at every stage, not at the chapter in view. The filter has no
  // "all chapters" setting to widen to any more, and searching inside one event
  // for something already listed in front of you is not what the box is for.
  if (f.search.trim()) {
    return matchesSearch(s.code || '', f.search) || matchesSearch(s.name || '', f.search);
  }
  if (f.type && filterType(s.stageType) !== f.type) return false;
  if (f.content && s.contentId !== f.content) return false;
  return true;
}

/**
 * The chapter or event the list opens on: whatever is running now, and the latest
 * main-story chapter when nothing is.
 *
 * "Running now" is the live content that started most recently -- two are often
 * live at once (a story event and a challenge mode), and the newer one is the one
 * being played.
 */
function openingContent(groups: StageGroup[], nowSeconds: number): string {
  let live: StageContentEntry | null = null;
  for (const group of groups) {
    for (const content of group.contents) {
      if (!content.start || !content.end) continue;
      if (nowSeconds < content.start || nowSeconds > content.end) continue;
      if (!live || content.start > (live.start || 0)) live = content;
    }
  }
  if (live) return live.id;
  const acts = groups.filter((g) => g.mainline);
  const chapters = acts[acts.length - 1]?.contents || [];
  return chapters[chapters.length - 1]?.id || groups[0]?.contents[0]?.id || '';
}

/**
 * The filters and the stage list, as its own column.
 *
 * Lifted out of the stages index so the same list can sit beside an open stage
 * -- the two-pane reading the prototype had, where picking a stage fills the
 * pane to the right instead of replacing the page.
 *
 * The rail is a fixed-height column that scrolls internally: the filters stay
 * pinned at the top and only the rows move. Its first version let the rows
 * grow to their natural 2,436px inside an 868px column, which the column's
 * max-height could not clip (the rows sat in a flex item with min-height:auto,
 * so nothing ever shrank) -- the list spilled 2,000px down the page and only
 * two rows were above the fold. Every height here is part of that chain.
 */
export default function StageList({ typeCounts, now, selectedSlug }: Props) {
  const contentUrl = useContentUrl();
  // The rows arrive from the index, one fetch for the whole visit rather than 1.98MB
  // per stage opened. Nothing is shipped with the page: it used to carry the first
  // index row's chapter (Act or Die) to paint at once, and a static page does not know
  // which stage its address names until it has hydrated, so that first paint was the
  // wrong chapter for every stage but one -- and the filters seeded from it stayed.
  const [all, setAll] = useState<StageSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { basePath } = useRouter();

  useEffect(() => {
    let live = true;
    fetchAsset(contentUrl(`${basePath}/stages-index.json`))
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        if (!live || !Array.isArray(rows)) return;
        setAll((rows as StageSummary[]).slice().sort(compareStageSummaries));
        setLoaded(true);
      })
      .catch(() => {
        // Offline or blocked: the rail stays empty and says it is loading; the stage
        // beside it arrives on its own fetch.
      });
    return () => {
      live = false;
    };
  }, [contentUrl, basePath]);

  const selected = useMemo(
    () => (selectedSlug ? all.find((s) => s.slug === selectedSlug) : undefined),
    [all, selectedSlug]
  );

  /**
   * The filter's headings, built here rather than shipped.
   *
   * They are the same 24 groups and 150 contents on every stage in the game, and
   * arriving through getStaticProps meant 23.1 kB in each of 3,786 page payloads --
   * 87 MB of the static export, re-downloaded on every stage opened. The index this
   * component already fetches is what they are derived from, so the wire carries the
   * rows once instead of the summary of them 3,786 times.
   *
   * The three tables it reads come with the page, in its props (__contentTables,
   * lib/content/tables.mjs), so the headings follow the content release the rows came
   * from. They used to be lazy chunks of this deploy's data/: a new event arrived in the
   * index but fell into a raw "other" group with no dates until somebody redeployed.
   * The grouping code is still imported dynamically, and the groups are still built
   * after mount, so first paint is exactly what it was.
   */
  const contents = useReleaseTable<NavData['contents']>('stages-content');
  const globalWindows = useReleaseTable<NavData['windows']>('content-windows');
  const { server, schedule } = useRegionalTime();
  const windows = server === 'en' ? globalWindows : schedule?.contents ?? EMPTY_WINDOWS;
  const storyGroups = useReleaseTable<NavData['storyGroups']>('story-groups');
  const [navGroups, setNavGroups] = useState<StageGroup[]>([]);
  useEffect(() => {
    let live = true;
    import('@/lib/stages/stageNav')
      .then((nav) => {
        if (!live) return;
        setNavGroups(nav.buildStageGroups(all, { contents, windows, storyGroups }));
      })
      .catch(() => {
        // Same posture as the index fetch: the rail keeps the one heading it can
        // name from the open stage, which is the chapter you are already reading.
      });
    return () => {
      live = false;
    };
  }, [all, contents, windows, storyGroups]);

  /**
   * What the picker reads before the headings arrive: the open stage's own chapter,
   * named from the row itself.
   *
   * Not a placeholder -- it is the entry that would be selected anyway, so the
   * closed picker says "EP 09 Stormwatch" from the first paint and simply gains the
   * other 149 options a moment later. An empty list would have rendered a blank
   * control, which is what a naive version of this did.
   */
  const fallbackGroups = useMemo<StageGroup[]>(() => {
    if (!selected?.contentId) return [];
    const type = filterType(selected.stageType);
    return [{
      id: 'open',
      label: '',
      mainline: false,
      contents: [{
        id: selected.contentId,
        start: null,
        end: null,
        label: selected.contentLabel || '',
        name: selected.contentName || selected.contentId,
        count: all.filter((s) => !s.variantOf && s.contentId === selected.contentId).length,
        byType: { [type]: all.filter((s) => !s.variantOf && s.contentId === selected.contentId && filterType(s.stageType) === type).length },
      }],
    }];
  }, [selected, all]);

  const groups = navGroups.length ? navGroups : fallbackGroups;
  // `now` is already unix SECONDS from getStaticProps; dividing it again landed
  // in 1970 and no window contained it, so this quietly fell back to the latest
  // chapter while an event was running.
  // The request's clock to start with, so the markup and the first client render
  // agree, then the reader's own -- what is running is the whole point of both the
  // default and the Current group.
  const [clock, setClock] = useState(now);
  const opening = useMemo(() => openingContent(groups, clock), [groups, clock]);
  const [filters, setFiltersState] = useState<Filters>({ search: '', type: '', content: '' });

  /*
   * Which chapter the list shows.
   *
   * Opening a stage scopes the list to that stage's own chapter or event, so its
   * siblings are what you see beside it, with it marked. That is decided when the open
   * stage is first known, and again whenever it changes -- never when the filters
   * change, or a reader who picks another chapter while a stage is open would be
   * snapped back to the stage's. On a change, filters that already list the new stage
   * are kept (a row clicked from a search result keeps the search); anything else
   * scopes to the new stage's chapter.
   *
   * This used to seed the filters once, from the first render. On a static page that
   * render has no query, so /stages/browse?s=pa-1 seeded from the first stage of the
   * index -- Act or Die -- and kept it after the address was read: every deep link
   * opened the rail on Act or Die with nothing marked (2026-09-26 audit).
   *
   * Filters stored in sessionStorage (a search typed before following a link here)
   * are honoured on the first decision only when the list they produce contains the
   * open stage, so the rail never shows a list its own selection is missing from.
   * With no stage open they are honoured as they are, and failing those, the list
   * opens on what is running.
   */
  const saved = useRef<Filters | null>(null);
  /** Whether the first decision has been made; nothing is stored before it. */
  const decided = useRef(false);
  /** The stage the filters were last scoped for. */
  const scopedFor = useRef<string | null>(null);
  /** Whether the reader has set a filter since, so "what is running" stops moving it. */
  const touched = useRef(false);
  const setFilters = (next: Filters | ((f: Filters) => Filters)) => {
    touched.current = true;
    setFiltersState(next);
  };

  useEffect(() => {
    setClock(nowSeconds());
    // Read after mount rather than in the initial state, because the server has no
    // sessionStorage and the first client render has to match what it sent.
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        saved.current = {
          search: String(parsed.search || ''),
          // Folded on the way in, in case a filter stored before the fold names a type
          // that is no longer offered.
          type: filterType(String(parsed.type || '')),
          content: String(parsed.content || ''),
        };
      }
    } catch {
      // sessionStorage unavailable (private mode, blocked) -- filters simply do not
      // carry across a page.
    }
  }, []);

  // A stage is open and its row is known: scope to it, on first sight and on change.
  useEffect(() => {
    if (!selected || scopedFor.current === selected.slug) return;
    scopedFor.current = selected.slug;
    const first = !decided.current;
    decided.current = true;
    const stored = first ? saved.current : null;
    // Through the fold: an interlude's own type is `sub`, which the filter does not
    // offer, and setting it here listed nothing at all on those 81 pages.
    const own: Filters = { search: '', type: filterType(selected.stageType), content: selected.contentId || '' };
    setFiltersState((f) => {
      if (stored && matchesFilters(selected, stored)) return stored;
      if (!first && matchesFilters(selected, f)) return f;
      return own;
    });
  }, [selected]);

  // No stage open -- the address names none, or one the index does not have: stored
  // filters, else what is running against the reader's clock, until the reader picks.
  const noStage = selectedSlug === null || (!!selectedSlug && loaded && !selected);
  useEffect(() => {
    if (!noStage) return;
    scopedFor.current = null;
    if (!decided.current) {
      decided.current = true;
      if (saved.current) {
        touched.current = true;
        setFiltersState(saved.current);
        return;
      }
    }
    if (!touched.current && opening) setFiltersState((f) => (f.content === opening ? f : { ...f, content: opening }));
  }, [noStage, opening]);

  useEffect(() => {
    if (!decided.current) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(filters));
    } catch {
      // as above -- persistence is a nicety, not a requirement
    }
  }, [filters]);

  const total = useMemo(() => Object.values(typeCounts).reduce((n, c) => n + c, 0), [typeCounts]);

  // Kept grouped rather than flattened, so the 168 chapters and events read as
  // the game's own headings -- the four acts of the main story, then its 13
  // side-story lines -- instead of one unbroken list. Filtering by stage type
  // narrows what each heading holds rather than which headings there are, since
  // one chapter carries main-theme stages, interludes and vignettes at once.
  // Switching type keeps the chapter in view when it holds stages of that type and
  // otherwise lands on the first one that does -- there is no "all chapters"
  // option to fall back to.
  const firstContentOfType = (current: string, type: string) => {
    if (!type) return current;
    for (const group of groups) {
      if (group.contents.some((c) => c.id === current && c.byType[type])) return current;
    }
    for (const group of groups) {
      const hit = group.contents.find((c) => c.byType[type]);
      if (hit) return hit.id;
    }
    return current;
  };

  const contentsForType = useMemo(() => {
    if (!filters.type) return groups;
    return groups
      .map((g) => ({ ...g, contents: g.contents.filter((c) => c.byType[filters.type]) }))
      .filter((g) => g.contents.length > 0);
  }, [groups, filters.type]);

  // Opening a Challenge Mode stage marks its base row, which is the row that is
  // there.
  const selectedRow = selected?.variantOf || selectedSlug;

  const visible = useMemo(() => {
    const list = all.filter((s) => !s.variantOf && matchesFilters(s, filters));
    if (!filters.search.trim()) return list;
    return list.sort((a, b) => {
      const relA = Math.min(searchRelevance(a.code || '', filters.search), searchRelevance(a.name || '', filters.search));
      const relB = Math.min(searchRelevance(b.code || '', filters.search), searchRelevance(b.name || '', filters.search));
      return relA - relB;
    });
  }, [all, filters]);

  /*
   * The rail's height is CSS's, not this component's.
   *
   * It used to be set here on every scroll frame from the rail's live position, and
   * that is what made the list behave strangely: a scroll event fires while the page is
   * still moving, so the height was computed for a position the reader had already left
   * and nothing corrected it once they stopped. Measured on a stage page at a 900px
   * viewport, the rail held 789px for 300ms after the scroll ended, where 789 was the
   * answer for a rail top of 99 that no longer existed, and only snapped to its real
   * value when an unrelated ResizeObserver happened to fire.
   *
   * Nothing the height depends on changes while scrolling, so nothing needs to watch
   * the scroll. See .stage-list-col in stages.css.
   *
   * The ref stays for scrollSelectedIntoView below.
   */
  const colRef = useRef<HTMLDivElement | null>(null);

  // Re-read the clock when the tab comes back. An event ending is the one thing
  // this list gets wrong by sitting still: leave it open overnight and Current
  // would still name yesterday's event until a reload.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') setClock(nowSeconds());
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, []);

  const rowsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = rowsRef.current;
    if (!box) return;
    const row = selectedRow ? box.querySelector<HTMLElement>('.stage-row.selected') : null;
    // scrollTop is set directly rather than through scrollIntoView, which
    // scrolls every ancestor including the page and would drag the stage
    // beside the rail out of view. Filtering to a list the open stage is not
    // in goes back to the top instead.
    box.scrollTop = row ? Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2) : 0;
  }, [selectedRow, filters]);

  const typeOptions: PickerGroup[] = useMemo(
    () => [
      {
        id: 'types',
        label: '',
        options: [
          { id: '', code: '', name: 'All types', count: total },
          ...TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => ({
            id: t,
            code: '',
            name: TYPE_LABELS[t] || t,
            count: typeCounts[t],
          })),
        ],
      },
    ],
    [total, typeCounts]
  );

  const contentOptions: PickerGroup[] = useMemo(() => {
    const toOption = (c: StageContentEntry) => ({
      id: c.id,
      code: c.label,
      name: c.name,
      count: (filters.type ? c.byType[filters.type] : c.count) || 0,
    });
    const listed = contentsForType.map((g) => ({ id: g.id, label: g.label, options: g.contents.map(toOption) }));
    // Whatever is on right now, at the top, rather than found by remembering which
    // storyline it belongs to. Reruns count: what matters is that it is playable
    // today. They stay in their storyline too -- this is a shortcut, not a move.
    const live = contentsForType
      .flatMap((g) => g.contents)
      .filter((c) => c.start && c.end && clock >= c.start && clock <= c.end)
      .sort((a, b) => (b.start || 0) - (a.start || 0));
    if (!live.length) return listed;
    return [{ id: 'current', label: 'Current', options: live.map(toOption) }, ...listed];
  }, [contentsForType, filters.type, clock]);

  const filtered = !!(filters.search || filters.type || filters.content);

  return (
    <div className={`stage-list-col${filters.content ? ' scoped' : ''}`} ref={colRef}>
      <div className="panel stage-rail">
        <div className="stage-rail-head">
          <SearchInput
            label="Search stages"
            placeholder="Code or name…"
            value={filters.search}
            onChange={(search) => setFilters((f) => ({ ...f, search }))}
          />
          {/* Two selects rather than a chip per type: thirteen chips wrapped to
              ten rows in a column this narrow -- 290px of filters above a list
              that then started below the fold. */}
          <RailFilter
            label="Stage type"
            value={filters.type}
            groups={typeOptions}
            onChange={(type) => setFilters((f) => ({ ...f, type, content: firstContentOfType(f.content, type) }))}
          />
          <RailFilter
            label="Chapter or event"
            value={filters.content}
            groups={contentOptions}
            onChange={(content) => setFilters((f) => ({ ...f, content }))}
          />
          <div className="stage-rail-foot">
            <span className="stage-count">
              {visible.length} {visible.length === 1 ? 'stage' : 'stages'}
            </span>
            {filtered && (
              <button
                type="button"
                className="ghost stage-rail-clear"
                onClick={() => setFilters({ search: '', type: '', content: opening })}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* .loading holds the box at its stacked height until the rows arrive (they
            are fetched, not shipped), so on a phone the stage below does not drop by
            a list's height after first paint. */}
        <div className={`stage-rows${loaded ? '' : ' loading'}`} ref={rowsRef}>
          {visible.slice(0, ROW_CAP).map((s) => (
            /* scroll={false} for the same reason as the form tabs on the page beside
               this: the rail is a list you read from where you are, and every row
               being its own route sent the document back to the top on each press.
               The rail keeps its own scroll (it scrolls the selected row into view
               itself), so the page you land on is the one you were looking at with a
               different stage in it. */
            <Link prefetch={false}
              key={s.slug}
              href={`/stages/browse?s=${encodeURIComponent(s.slug)}`}
              shallow
              scroll={false}
              className={`stage-row${s.slug === selectedRow ? ' selected' : ''}`}
            >
              {/* Code leads with the name as its subscript, and the stage's
                  own details sit to the right, rather than each being its own
                  column -- the way the prototype read. */}
              <span className="stage-row-ident">
                <span className="stage-row-code">
                  {s.code || s.slug}
                  {s.hasBoss && <span className="stage-boss-badge">Boss</span>}
                  {/* No marker for the other forms a stage has. A "CM" beside
                      CG-1 read as "this row is the Challenge Mode" rather than
                      "this stage also has one" -- the row is the stage, and the
                      forms are the toggle on its page.
                      A variant whose base is not in the dataset is a different
                      case: that row IS the variant, so it still says so. */}
                  {s.variantOf == null && variantLabel(s.variant) && (
                    <span className="stage-variant-badge">{variantLabel(s.variant)}</span>
                  )}
                </span>
                <span className="stage-row-name">{s.name}</span>
                {/* Which event a stage belongs to is worth a line only while
                    the list spans more than one -- once you have picked a
                    chapter it would repeat on every row. */}
                {!filters.content && (
                  <span className="stage-row-zone">
                    {s.contentLabel ? `${s.contentLabel} -- ` : ''}
                    {s.contentName || s.zoneName || TYPE_LABELS[s.stageType] || s.stageType}
                  </span>
                )}
              </span>
              {/* Sanity and enemy count used to sit here. They are both in the
                  stage's own stat row, and dropping them is what lets the rail be
                  narrow enough for the page to keep the site's standard width. */}
            </Link>
          ))}
          {visible.length === 0 && (
            <p className="hint stage-empty">
              {loaded ? 'No stage matches those filters.' : 'Loading the stage list...'}
            </p>
          )}
          {visible.length > ROW_CAP && (
            <p className="hint stage-provenance stage-rail-more">
              Showing the first {ROW_CAP} of {visible.length}. Narrow it with the filters or the search box.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
