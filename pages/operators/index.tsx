import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import path from 'path';
import Head from 'next/head';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReaderClock } from '@/lib/time/readerClock';
import { getAllOperators } from '@/lib/operators/operators';
import { portraitStatus } from '@/lib/operators/operatorPortrait';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getClassIconPath, getBranchIconPath } from '@/lib/operators/classBranchIcons';
import { operatorRelease, operatorReleaseLabel } from '@/lib/operators/operatorAvailability';
import { RosterOperator } from '@/lib/operators/operatorTypes';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import { operatorBelongsToFaction, expandFactionAliases } from '@/lib/operators/factionAliases';
import { publicFiles } from '@/lib/assets/publicAssets';
import PageHeader from '@/components/ui/PageHeader';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';

interface Props {
  operators: RosterOperator[];
  /** The build's clock, in unix milliseconds, rounded to the minute. */
  now: number;
}

type SortDir = 'asc' | 'desc';
type SortField = 'rarity' | 'releaseDate';

export default function OperatorsIndex({ operators, now }: Props) {
  // Every filter and the sort live in the URL query, so a filtered view
  // survives reload and can be shared as a link. The saved-preferences
  // localStorage blob (loaded further down) only fills in keys the URL
  // doesn't carry -- an explicit query string always wins over whatever
  // this browser happened to have saved last time.
  const [search, setSearch] = useQueryState('q');
  const [rarityFilter, setRarityFilter] = useQueryState('rarity', 'all');
  const [classFilter, setClassFilter] = useQueryState('class', 'all');
  const [branchFilter, setBranchFilter] = useQueryState('branch', 'all');
  const [factionFilter, setFactionFilter] = useQueryState('faction', 'all');
  // A shared URL can carry anything ("?dir=banana") -- narrow the raw
  // strings back to the two values each of these actually has, so the
  // sort logic below never sees garbage.
  const [sortDirRaw, setSortDir] = useQueryState('dir', 'desc');
  const [sortFieldRaw, setSortField] = useQueryState('sort', 'rarity');
  const sortDir: SortDir = sortDirRaw === 'asc' ? 'asc' : 'desc';
  const sortField: SortField = sortFieldRaw === 'releaseDate' ? 'releaseDate' : 'rarity';
  // Hides not-yet-released (CN-only / upcoming) operators by default,
  // from both the main list AND search -- toggled via the "Show CN"
  // button, mirrored into the URL as ?cn=1.
  const [showUnreleasedRaw, setShowUnreleasedRaw] = useQueryState('cn');
  const showUnreleased = showUnreleasedRaw === '1';
  const setShowUnreleased = (v: boolean) => setShowUnreleasedRaw(v ? '1' : '');
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // "Days until release" is judged against the READER's clock, not the
  // build's. A static build can be weeks old, and a roster that still
  // tags a long-released operator "In 3 days" is actively wrong -- so
  // the markup and first client paint render from the build's clock
  // (they must agree, or React flags a hydration mismatch) and an
  // effect re-picks the real time immediately on mount (useReaderClock,
  // lib/time/readerClock.ts). Same pattern as the Terminal page's clock.
  // Rounded to the minute, so a re-read within it is a no-op for React.
  const clock = useReaderClock(now, { tickMs: 1000 });

  const rarities = useMemo(
    () => Array.from(new Set(operators.map((op) => op.rarity).filter((r): r is number => r != null))).sort(
      (a, b) => b - a
    ),
    [operators]
  );
  const classes = useMemo(
    () => Array.from(new Set(operators.map((op) => op.class).filter((c): c is string => !!c))).sort(),
    [operators]
  );
  // Branch options narrow to whichever class is currently selected, so the
  // list doesn't show irrelevant branches once a class filter is active.
  const branches = useMemo(() => {
    const pool = classFilter === 'all' ? operators : operators.filter((op) => op.class === classFilter);
    return Array.from(new Set(pool.map((op) => op.branch).filter((b): b is string => !!b))).sort();
  }, [operators, classFilter]);
  const factions = useMemo(
    () =>
      Array.from(
        new Set(
          operators
            .flatMap((op) => [op.faction, ...(op.umbrellaFactions || []), ...(op.connectedFactions || [])])
            .filter((f): f is string => !!f)
        )
      ).sort(),
    [operators]
  );

  // Days between now and this operator's release date -- null if there's
  // no parseable release date at all (falls back to the isFuture flag
  // in that case, both for filtering and the "coming soon" sort boost).
  function daysUntilRelease(op: RosterOperator): number | null {
    const release = operatorRelease(op);
    if (!release) return null;
    return (release.at - clock) / (24 * 60 * 60 * 1000);
  }
  const COMING_SOON_WINDOW_DAYS = 10;
  const RECENTLY_RELEASED_WINDOW_DAYS = 14;
  function isComingSoon(op: RosterOperator): boolean {
    const days = daysUntilRelease(op);
    if (days === null) return false; // no known date -- can't be "coming soon" specifically
    return days > 0 && days <= COMING_SOON_WINDOW_DAYS;
  }
  function isRecentlyReleased(op: RosterOperator): boolean {
    const days = daysUntilRelease(op);
    if (days === null) return false; // no known date -- can't be "recently released" specifically
    return days <= 0 && days >= -RECENTLY_RELEASED_WINDOW_DAYS;
  }

  // When a faction filter is active, ranks which tier an operator
  // matched on -- main first, then umbrella, then connected -- so the
  // "most directly" affiliated operators surface first rather than the
  // three tiers being mixed together in whatever order they'd
  // otherwise sort in.
  function factionMatchRank(op: RosterOperator, filterFaction: string): number {
    const equivalents = expandFactionAliases(filterFaction);
    if (op.faction && equivalents.includes(op.faction)) return 0;
    if ((op.umbrellaFactions || []).some((f) => equivalents.includes(f))) return 1;
    if ((op.connectedFactions || []).some((f) => equivalents.includes(f))) return 2;
    return 3; // shouldn't happen post-filter, but a safe fallback either way
  }

  const filtered = useMemo(() => {
    let list = operators;
    if (showUnreleased) {
      // Show CN: ONLY unreleased operators, not the already-released
      // ones too.
      list = list.filter((op) => {
        const days = daysUntilRelease(op);
        if (days === null) return op.isFuture; // no known date -- fall back to the existing flag
        return days > 0; // strictly future release date
      });
    } else {
      list = list.filter((op) => {
        const days = daysUntilRelease(op);
        if (days === null) return !op.isFuture; // no known date -- fall back to the existing flag
        return days <= COMING_SOON_WINDOW_DAYS; // already released, or releasing within the window
      });
    }
    if (rarityFilter !== 'all') list = list.filter((op) => String(op.rarity) === rarityFilter);
    if (classFilter !== 'all') list = list.filter((op) => op.class === classFilter);
    if (branchFilter !== 'all') list = list.filter((op) => op.branch === branchFilter);
    if (factionFilter !== 'all') {
      list = list.filter((op) => operatorBelongsToFaction(op, factionFilter));
    }
    if (search.trim()) {
      list = list.filter((op) => matchesSearch(op.name, search));
    }

    return [...list].sort((a, b) => {
      if (search.trim()) {
        const relDiff = searchRelevance(a.name, search) - searchRelevance(b.name, search);
        if (relDiff !== 0) return relDiff;
      }
      // Show CN view: earliest release date first, then rarity as a
      // tiebreak (higher first) for operators sharing the same date --
      // regardless of the normal sort field/direction, since this is a
      // dedicated, simpler ordering for "what's coming, and in what
      // order" specifically.
      if (showUnreleased) {
        const da = operatorRelease(a)?.at;
        const db = operatorRelease(b)?.at;
        if (da === undefined && db === undefined) {
          const ra = a.rarity ?? -1;
          const rb = b.rarity ?? -1;
          if (ra !== rb) return rb - ra;
          return a.name.localeCompare(b.name);
        }
        if (da === undefined) return 1; // missing dates always sort last
        if (db === undefined) return -1;
        const diff = da - db;
        if (diff !== 0) return diff; // ascending -- earliest first
        const ra = a.rarity ?? -1;
        const rb = b.rarity ?? -1;
        if (ra !== rb) return rb - ra;
        return a.name.localeCompare(b.name);
      }
      // A faction filter is active -- rank by which tier matched
      // (main, then umbrella, then connected) ahead of the normal
      // sort field, same reasoning as the search-relevance check
      // above: a deliberate filter choice takes priority over the
      // default ordering.
      if (factionFilter !== 'all') {
        const rankDiff = factionMatchRank(a, factionFilter) - factionMatchRank(b, factionFilter);
        if (rankDiff !== 0) return rankDiff;
      }
      // Recently-released ("Now Available") operators get top priority
      // -- something the player can actually go get right now, ahead of
      // "coming soon" (which is still pending) -- regardless of the
      // active sort field (but still after a genuine name search match,
      // since that's a specific, deliberate lookup).
      const aAvailable = isRecentlyReleased(a);
      const bAvailable = isRecentlyReleased(b);
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
      // Operators releasing within the next 10 days are prioritized to
      // the front, regardless of the active sort field -- "almost
      // here" content is worth surfacing prominently, ahead of the
      // normal rarity/date ordering (but still after a genuine name
      // search match, since that's a specific, deliberate lookup).
      const aComingSoon = isComingSoon(a);
      const bComingSoon = isComingSoon(b);
      if (aComingSoon !== bComingSoon) return aComingSoon ? -1 : 1;
      if (sortField === 'releaseDate') {
        const da = operatorRelease(a)?.at;
        const db = operatorRelease(b)?.at;
        if (da === undefined && db === undefined) return a.name.localeCompare(b.name);
        if (da === undefined) return 1; // missing dates always sort last, regardless of direction
        if (db === undefined) return -1;
        const diff = da - db;
        if (diff !== 0) return sortDir === 'desc' ? -diff : diff;
        return a.name.localeCompare(b.name);
      }
      const ra = a.rarity ?? -1;
      const rb = b.rarity ?? -1;
      if (ra !== rb) return sortDir === 'desc' ? rb - ra : ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [operators, showUnreleased, rarityFilter, classFilter, branchFilter, factionFilter, search, sortDir, sortField, clock]);

  function resetFilters() {
    setSearch('');
    setRarityFilter('all');
    setClassFilter('all');
    setBranchFilter('all');
    setFactionFilter('all');
  }

  // Loads saved filter/sort preferences once the router is ready --
  // deliberately does NOT include the free-text search box, since that
  // feels like a transient lookup action rather than a persistent view
  // preference; a stale old search term silently still filtering the
  // roster next visit would be more surprising than helpful. (Search
  // still round-trips through the URL as ?q=, which IS the shareable,
  // deliberate form of it.)
  //
  // Waiting for router.isReady (instead of plain mount) matters: only
  // then is the query string actually populated, and a saved preference
  // must NEVER override a key the URL explicitly carries -- someone
  // following a shared "?class=Sniper" link should see Snipers, not
  // whatever this browser filtered by last month. Keys the URL is
  // silent on fall back to the saved blob, and applying them through
  // the useQueryState setters means the restored view also lands in
  // the address bar, ready to share.
  const router = useRouter();
  const savedPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || savedPrefsAppliedRef.current) return;
    savedPrefsAppliedRef.current = true;
    try {
      const saved = localStorage.getItem('operatorsFilters');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const inUrl = (key: string) => typeof router.query[key] === 'string' && router.query[key] !== '';
      if (!inUrl('rarity') && parsed.rarityFilter) setRarityFilter(parsed.rarityFilter);
      if (!inUrl('class') && parsed.classFilter) setClassFilter(parsed.classFilter);
      if (!inUrl('branch') && parsed.branchFilter) setBranchFilter(parsed.branchFilter);
      if (!inUrl('faction') && parsed.factionFilter) setFactionFilter(parsed.factionFilter);
      if (!inUrl('dir') && parsed.sortDir) setSortDir(parsed.sortDir);
      if (!inUrl('sort') && parsed.sortField) setSortField(parsed.sortField);
      if (!inUrl('cn') && typeof parsed.showUnreleased === 'boolean') setShowUnreleased(parsed.showUnreleased);
    } catch {
      // Corrupted or unavailable -- just fall back to defaults.
    }
    // The setters from useQueryState are stable; router.query is read
    // fresh on the run that matters (the one where isReady flips).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const isFirstFilterEffectRunRef = useRef(true);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    // Skip saving on this effect's own first run (mount). On that pass
    // the closure holds the ORIGINAL default filter values -- the URL's
    // query and the saved-preferences blob only get applied later, once
    // router.isReady flips -- so saving here would silently overwrite
    // the stored preferences back to defaults before the user ever saw
    // them take effect. Only from the SECOND run onward (a later commit
    // where the applied state has already propagated) does this reflect
    // real values worth saving. Note that this means a followed share
    // link's filters also get saved as the new preference -- the view
    // on screen is the view that persists, whichever way it arrived.
    if (isFirstFilterEffectRunRef.current) {
      isFirstFilterEffectRunRef.current = false;
      return;
    }
    try {
      localStorage.setItem(
        'operatorsFilters',
        JSON.stringify({ rarityFilter, classFilter, branchFilter, factionFilter, sortDir, sortField, showUnreleased })
      );
    } catch {
      // Not persisted this session -- not worth failing over.
    }
  }, [search, rarityFilter, classFilter, branchFilter, factionFilter, sortDir, sortField, showUnreleased]);

  return (
    <>
      <Head><title>Operator Roster — Arkpedia</title></Head>

      <PageHeader eyebrow="Rhodes Island // Personnel Archive" title="Operator roster"
        actions={<div className="roster-controls">
          <SearchInput className="roster-search" label="Search operators" name="operator-search" placeholder="Search by name…" value={search} onChange={setSearch} />

          {/* Independent filter chips: pressing the lit one clears it. */}
          <div className="roster-rarity-class-row">
            <div className="roster-button-group" role="group" aria-label="Rarity">
              {rarities.map((r) => (
                <button
                  type="button"
                  key={r}
                  className="filter-chip"
                  aria-label={`${r}-star`}
                  aria-pressed={rarityFilter === String(r)}
                  onClick={() => setRarityFilter(rarityFilter === String(r) ? 'all' : String(r))}
                >
                  {r}★
                </button>
              ))}
            </div>

            <div className="roster-button-group" role="group" aria-label="Class">
              {classes.map((c) => {
                const iconPath = getClassIconPath(c);
                return (
                  <button
                    type="button"
                    key={c}
                    className="filter-chip roster-icon-chip"
                    aria-label={c}
                    aria-pressed={classFilter === c}
                    onClick={() => {
                      setClassFilter(classFilter === c ? 'all' : c);
                      setBranchFilter('all'); // branch list changes with class, reset to avoid an invalid combo
                    }}
                  >
                    {iconPath && <OperatorGameIcon src={iconPath} label={c} size={24} />}
                  </button>
                );
              })}
            </div>
          </div>

          {classFilter !== 'all' && branches.length > 0 && (
            <div className="roster-button-group roster-branch-row" role="group" aria-label="Branch">
              {branches.map((b) => {
                const iconPath = getBranchIconPath(b);
                return (
                  <button
                    type="button"
                    key={b}
                    className="filter-chip"
                    aria-label={b}
                    aria-pressed={branchFilter === b}
                    onClick={() => setBranchFilter(branchFilter === b ? 'all' : b)}
                  >
                    {iconPath && <OperatorGameIcon src={iconPath} label={b} size={20} />}
                    <span>{b}</span>
                  </button>
                );
              })}
            </div>
          )}

          <nav className="roster-techniques-link-row" aria-label="Operator reference tools">
            <Link prefetch={false} href="/techniques" className="btn btn-sm roster-techniques-btn">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <path d="M10 2 L17 6 L17 14 L10 18 L3 14 L3 6 Z" strokeLinejoin="round" />
                <path d="M10 2 V18 M3 6 L17 14 M17 6 L3 14" strokeLinecap="round" />
              </svg>
              <span>Techniques</span>
            </Link>
            <Link prefetch={false} href="/synergies" className="btn btn-sm roster-techniques-btn">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="14" cy="6" r="2.5" />
                <circle cx="10" cy="15" r="2.5" />
                <path d="M8 7.5 L11.5 13 M12 7.5 L8.5 13 M8.5 6 L11.5 6" strokeLinecap="round" />
              </svg>
              <span>Synergies</span>
            </Link>
            <Link prefetch={false} href="/obtain-method" className="btn btn-sm roster-techniques-btn">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <rect x="3" y="4" width="14" height="12" rx="1.5" />
                <path d="M3 8 H17 M7 4 V16" strokeLinecap="round" />
              </svg>
              <span>Obtain method</span>
            </Link>
          </nav>

          <StyledSelect className="roster-faction" label="Filter by faction" value={factionFilter} onChange={setFactionFilter}
            options={[{ value: 'all', label: 'All factions' }, ...factions.map((f) => ({ value: f, label: f }))]} />

          <button
            type="button"
            className="filter-chip"
            aria-pressed={showUnreleased}
            onClick={() => setShowUnreleased(!showUnreleased)}
          >
            Show CN
          </button>

          <SegmentedControl label="Sort by" value={sortField === 'releaseDate' ? 'releaseDate' : 'rarity'}
            options={[{ value: 'rarity', label: 'Rarity' }, { value: 'releaseDate', label: 'Release date' }]}
            onChange={setSortField} />
          {/* Flips between two states, so aria-pressed reads "pressed" for the
              non-default one: ascending order. */}
          <button
            type="button"
            className="ghost"
            aria-pressed={sortDir === 'asc'}
            onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
            aria-label={sortDir === 'desc' ? 'Sort descending' : 'Sort ascending'}
            title={sortDir === 'desc' ? 'Sort descending' : 'Sort ascending'}
          >
            {sortDir === 'desc' ? '↓' : '↑'}
          </button>

          <button type="button" className="ghost" onClick={resetFilters}>
            Reset
          </button>
        </div>} />

      <main>
        {filtered.length === 0 ? (
          <div className="waiting-box">
            <h2>No operators match</h2>
            <p className="hint">Try adjusting or resetting your filters.</p>
          </div>
        ) : (
          <>
            <div className="grid roster-grid">
              {filtered.slice(0, visibleCount).map((op, i) => (
                <Link prefetch={false}
                  key={op.name}
                  href={`/operators/${encodeURIComponent(op.name)}`}
                  className="card roster-card roster-card-enter"
                  style={{ animationDelay: `${Math.min(i * 25, 600)}ms` }}
                >
                  <div className={`avatar${op.rarity ? ` tier-${rarityLevel(op.rarity)}` : ''}`}>
                    <Image src={getOperatorIconPath(op)} alt={op.name} fill sizes="(max-width: 600px) 33vw, 160px" />
                  </div>
                  <p className="op-name">{op.name}</p>
                  {(() => {
                    const days = daysUntilRelease(op);
                    const comingSoon = isComingSoon(op);
                    const recentlyReleased = isRecentlyReleased(op);
                    // Genuinely far-future operators (outside the
                    // coming-soon window) have no confirmed rarity/class
                    // yet in practice -- keep the existing text-only
                    // display for them, unchanged.
                    if ((days === null ? op.isFuture : days > COMING_SOON_WINDOW_DAYS)) {
                      return <p className="hint roster-class-branch">Upcoming</p>;
                    }
                    return (
                      <>
                        <p className="hint roster-class-branch">
                          {op.rarity ? <Rarity n={rarityLevel(op.rarity)} /> : null}
                          {/* The class and branch glyphs are white art: drawn as masks in
                              the line's own ink (OperatorGameIcon), not as images, or the
                              light theme shows them white on white. */}
                          {op.class && getClassIconPath(op.class) && (
                            <OperatorGameIcon src={getClassIconPath(op.class)!} label={op.class} size={16} />
                          )}
                          {op.branch && getBranchIconPath(op.branch) && (
                            <OperatorGameIcon src={getBranchIconPath(op.branch)!} label={op.branch} size={16} />
                          )}
                          {op.branch}
                        </p>
                        {factionFilter !== 'all' && (
                          <p className="hint roster-faction-match-tag">
                            <b>
                              {(() => {
                                const equivalents = expandFactionAliases(factionFilter);
                                if (op.faction && equivalents.includes(op.faction)) return 'Main Faction';
                                if ((op.umbrellaFactions || []).some((f) => equivalents.includes(f))) return 'Umbrella Faction';
                                if ((op.connectedFactions || []).some((f) => equivalents.includes(f))) return 'Connected Faction';
                                return null;
                              })()}
                            </b>
                          </p>
                        )}
                        {comingSoon && (
                          <p className="hint roster-release-tag">
                            <span className="roster-release-days">{operatorReleaseLabel(op, clock)}</span>
                          </p>
                        )}
                        {recentlyReleased && <p className="hint roster-release-tag roster-release-tag-available">Now Available</p>}
                      </>
                    );
                  })()}
                </Link>
              ))}
            </div>
            <LoadOnScroll shown={visibleCount} total={filtered.length} onMore={() => setVisibleCount((c) => c + PAGE_SIZE)} />
          </>
        )}
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/operators", async () => {
  // This page only ever reads name/rarity/class/branch/faction/
  // isFuture/characterInfo['Release Date'] -- getAllOperators()
  // returns every operator's ENTIRE record (all skills' per-level/
  // per-mastery text, talents, modules, base stats, promotion tables,
  // full bios, voice credits, ...), almost none of which this page
  // touches. Trimming down to just what's used keeps the page's data
  // payload from ballooning with data that's never rendered here.
  // howToObtain specifically isn't read anywhere on this page (that's
  // the dedicated Obtain Method page's job) -- nulled out rather than
  // carried along unused.
  const operators: RosterOperator[] = getAllOperators().map((op) => ({
    name: op.name,
    rarity: op.rarity,
    class: op.class,
    branch: op.branch,
    faction: op.faction,
    umbrellaFactions: op.umbrellaFactions || [],
    connectedFactions: op.connectedFactions || [],
    howToObtain: null,
    isFuture: op.isFuture ?? false,
    ...portraitStatus(op),
    ...(op.sourceRegion ? { sourceRegion: op.sourceRegion } : {}),
    ...(op.releaseAt ? { releaseAt: op.releaseAt } : {}),
    characterInfo: op.characterInfo ? { 'Release Date': op.characterInfo['Release Date'] || '' } : null,
  }));
  /**
   * Every class and branch this page draws a chip for has art on disk.
   *
   * getClassIconPath and getBranchIconPath are unguarded: they build
   * `/branch-icons/<name>.webp` out of a name and return it whether the file
   * exists or not, so a gap is a 404 that renders as a broken square and
   * reports nothing. That is how Supportive Ranger -- Pedro's branch, and the
   * only one of the 72 with no icon -- sat visibly broken in the branch filter
   * with a green build. A missing icon fails the build now instead.
   *
   * Checked here rather than in the helper because the helper runs on the
   * client too, and this is the page that enumerates the whole set: the chips
   * come from the same operator list this projection is built from.
   */
  const artFor = (folder: string, names: Iterable<string>) => {
    const have = new Set(publicFiles(folder).map((file) => path.parse(file).name));
    return [...names].filter((n) => !have.has(n));
  };
  const classes = new Set(operators.map((op) => op.class).filter((c): c is string => !!c));
  const branchNames = new Set(operators.map((op) => op.branch).filter((b): b is string => !!b));
  const noArt = [
    ...artFor('class-icons', classes).map((n) => `class-icons/${n}.webp`),
    ...artFor('branch-icons', branchNames).map((n) => `branch-icons/${n}.webp`),
  ];
  if (noArt.length) {
    throw new Error(
      `operators: ${noArt.length} class/branch icon(s) the roster renders do not exist: ${noArt.join(', ')}. `
      + 'Run scripts/build/build-branch-icons.mjs, which fetches the missing ones from prts.wiki by the '
      + "branch's own subProfessionId.",
    );
  }

  // `now`, the release-date countdowns' first paint, is the request's clock from
  // contentPageClock (lib/content/pageClock.ts). The component re-picks the reader's
  // real time on mount (see the clock state above) and keeps the badge live.
  return { props: { operators } };
});
