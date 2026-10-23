import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import FilterSheet, { INLINE_RESET, type ActiveFilter } from '@/components/ui/FilterSheet';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import OperatorFaces from '@/components/techniques/OperatorFaces';
import TechniqueRecord from '@/components/techniques/TechniqueRecord';
import { sourceKind, type SourceKind } from '@/components/techniques/SourceTag';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { matchesSearch } from '@/lib/search/searchNormalize';
import { sortClasses } from '@/lib/operators/classOrder';
import { getClassIconPath } from '@/lib/operators/classBranchIcons';
import { buildTechniqueGroups, TechniqueGroup, TechniqueEntry } from '@/lib/techniques/buildTechniqueGroups';
import { TECHNIQUE_KINDS, techniqueKind } from '@/lib/techniques/techniqueKinds';
import { techniqueExcerpt } from '@/lib/techniques/techniqueExcerpt';

interface Props {
  groups: TechniqueGroup[];
  /** Each branch's class, for the Class filter: an entry names its branch, not its class.
   *  Releases compiled before this have none; finalize fills it where the operators can be
   *  read, and the filter hides where they cannot (an empty map). */
  branchClasses: Record<string, string>;
}

/** How many cards render before the list grows on scroll (components/ui/LoadOnScroll). */
const PAGE = 12;

const SOURCES: { value: 'all' | SourceKind; label: string }[] = [
  { value: 'all', label: 'Any source' },
  { value: 'skill', label: 'From a skill' },
  { value: 'talent', label: 'From a talent' },
  { value: 'trait', label: 'From the trait or branch' },
  { value: 'module', label: 'From a module' },
];

type Sort = 'kind' | 'count' | 'name';

export default function TechniquesPage({ groups, branchClasses }: Props) {
  const router = useRouter();
  const [search, setSearch] = useQueryState('q');
  const [kindFilter, setKindFilter] = useQueryState('kind', 'all');
  const [rarityFilter, setRarityFilter] = useQueryState('rarity', 'all');
  const [classFilter, setClassFilter] = useQueryState('class', 'all');
  const [sourceRaw, setSource] = useQueryState('from', 'all');
  const [sortRaw, setSort] = useQueryState('sort', 'kind');
  const [openName, setOpenName] = useQueryState('t');
  const source = SOURCES.some((s) => s.value === sourceRaw) ? sourceRaw as 'all' | SourceKind : 'all';
  const sort: Sort = sortRaw === 'count' || sortRaw === 'name' ? sortRaw : 'kind';

  // A link like /techniques?q=Burn (the "See more" on an operator's page, an enemy's status
  // popover) names one technique: open its record, with the list searched to it behind.
  useEffect(() => {
    if (!router.isReady || typeof router.query.t === 'string') return;
    const q = typeof router.query.q === 'string' ? router.query.q.trim().toLowerCase() : '';
    const named = q && groups.find((g) => g.name.toLowerCase() === q);
    if (named) setOpenName(named.name);
    // Once, when the address is first read; the setter is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const classes = useMemo(() => sortClasses(Object.values(branchClasses)), [branchClasses]);
  const rarities = useMemo(
    () => Array.from(new Set(groups.flatMap((g) => g.entries.map((e) => e.rarity)).filter((r): r is number => r != null))).sort((a, b) => b - a),
    [groups],
  );
  const kinds = useMemo(() => {
    const present = new Set(groups.map((g) => techniqueKind(g.name, g.umbrellaNames)));
    return TECHNIQUE_KINDS.filter((k) => present.has(k));
  }, [groups]);

  const query = search.trim();
  /** Every technique with the operators the filters leave on it; one that keeps none drops. */
  const views = useMemo(() => {
    const keeps = (e: TechniqueEntry) =>
      (rarityFilter === 'all' || String(e.rarity) === rarityFilter)
      && (classFilter === 'all' || branchClasses[e.branchName ?? ''] === classFilter)
      && (source === 'all' || (e.viaBranch ? source === 'trait' : e.badges.some((b) => sourceKind(b) === source)));
    const out = groups.map((group) => {
      const kind = techniqueKind(group.name, group.umbrellaNames);
      const nameHit = !query || matchesSearch(group.name, query);
      const shown = group.entries.filter((e) => keeps(e) && (nameHit || matchesSearch(e.operatorName, query)));
      return { group, kind, shown, nameHit };
    }).filter((v) => v.shown.length > 0 && (kindFilter === 'all' || v.kind === kindFilter));
    const byName = (a: typeof out[number], b: typeof out[number]) => a.group.name.localeCompare(b.group.name);
    const byCount = (a: typeof out[number], b: typeof out[number]) => b.shown.length - a.shown.length || byName(a, b);
    return out.sort(sort === 'name' ? byName : sort === 'count' ? byCount
      : (a, b) => TECHNIQUE_KINDS.indexOf(a.kind) - TECHNIQUE_KINDS.indexOf(b.kind) || byCount(a, b));
  }, [groups, branchClasses, query, kindFilter, rarityFilter, classFilter, source, sort]);

  // The list grows as it is read, from its first batch again whenever the filters change.
  const listKey = [query, kindFilter, rarityFilter, classFilter, source, sort].join('|');
  const [shown, setShown] = useState({ key: listKey, count: PAGE });
  const visible = shown.key === listKey ? shown.count : PAGE;

  const totalOperators = useMemo(() => new Set(groups.flatMap((g) => g.entries.map((e) => e.operatorName))).size, [groups]);
  const operatorFilters = [
    rarityFilter !== 'all' ? `${rarityFilter}★` : null,
    classFilter !== 'all' ? classFilter : null,
    source !== 'all' ? SOURCES.find((s) => s.value === source)!.label.replace(/^From (a |the )?/, '') : null,
  ].filter(Boolean) as string[];

  // The phone's Filters sheet: a chip per filter that is on, and a hold over the list so a
  // filter pressed in the sheet cannot clamp the reader (the Anti-Page Jump rule).
  const hold = useSwitchHold('techniques');
  const activeFilters: ActiveFilter[] = [
    ...(kindFilter !== 'all' ? [{ key: 'kind', label: kindFilter, remove: () => setKindFilter('all') }] : []),
    ...(rarityFilter !== 'all' ? [{ key: 'rarity', label: `${rarityFilter}★`, remove: () => setRarityFilter('all') }] : []),
    ...(classFilter !== 'all' ? [{ key: 'class', label: classFilter, remove: () => setClassFilter('all') }] : []),
    ...(source !== 'all' ? [{ key: 'from', label: SOURCES.find((s) => s.value === source)!.label, remove: () => setSource('all') }] : []),
  ];
  function resetSheet() {
    for (const filter of activeFilters) filter.remove();
  }
  function resetFilters() {
    setSearch('');
    resetSheet();
  }

  const open = openName ? views.find((v) => v.group.name === openName) ?? null : null;
  const openGroup = open?.group ?? (openName ? groups.find((g) => g.name === openName) ?? null : null);

  return (
    <>
      <Head><title>Techniques — Arkpedia</title></Head>
      <PageHeader
        eyebrow={<><Link prefetch={false} href="/operators">Operators</Link>{' // Skill effects'}</>}
        title="Techniques"
        sub={<>
          {groups.length} techniques across {totalOperators} operators&apos; skills, talents, traits and modules. Pick one
          to see who has it, and where.
        </>}
        actions={<div className="roster-controls technique-controls">
          <SearchInput className="roster-search" label="Search techniques or operators" name="technique-search"
            placeholder="Technique or operator…" value={search} onChange={setSearch} />
          <FilterSheet controlsClassName="roster-controls technique-controls" active={activeFilters} onReset={resetSheet} hold={hold} controls={<>
            {/* Independent pick-one chips, as on /operators: pressing the lit one clears it. */}
            <div className="roster-button-group technique-chip-row" role="group" aria-label="Kind">
              {kinds.map((k) => (
                <button type="button" key={k} className="filter-chip" aria-pressed={kindFilter === k}
                  onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}>
                  {k}
                </button>
              ))}
            </div>
            <div className="roster-rarity-class-row">
              <div className="roster-button-group" role="group" aria-label="Rarity">
                {rarities.map((r) => (
                  <button type="button" key={r} className="filter-chip" aria-label={`${r}-star`} aria-pressed={rarityFilter === String(r)}
                    onClick={() => setRarityFilter(rarityFilter === String(r) ? 'all' : String(r))}>
                    {r}★
                  </button>
                ))}
              </div>
              {classes.length > 0 && (
                <div className="roster-button-group" role="group" aria-label="Class">
                  {classes.map((c) => {
                    const icon = getClassIconPath(c);
                    return (
                      <button type="button" key={c} className="filter-chip roster-icon-chip" aria-label={c} aria-pressed={classFilter === c}
                        onClick={() => setClassFilter(classFilter === c ? 'all' : c)}>
                        {icon && <OperatorGameIcon src={icon} label={c} size={24} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="roster-filter-row">
              <StyledSelect className="technique-source-select" label="Where the operator has it" value={source}
                options={SOURCES} onChange={(v) => setSource(v)} />
              <span className="toolbar-spacer" aria-hidden="true" />
              <SegmentedControl label="Sort by" value={sort}
                options={[{ value: 'kind', label: 'Kind' }, { value: 'count', label: 'Most operators' }, { value: 'name', label: 'A–Z' }]}
                onChange={setSort} />
              <button type="button" className={`ghost ${INLINE_RESET}`} onClick={resetFilters}>Reset</button>
            </div>
          </>} />
        </div>}
      />

      <main>
        <div ref={hold.ref} style={hold.style}>
          {views.length === 0 ? (
            <div className="waiting-box">
              <h2>No technique matches</h2>
              <p className="hint">Try another search, or reset the filters.</p>
            </div>
          ) : (
            <>
              <p className="hint technique-tally">
                {views.length === groups.length ? `All ${groups.length} techniques` : `${views.length} of ${groups.length} techniques`}
                {operatorFilters.length > 0 && <> · operators: {operatorFilters.join(' · ')}</>}
              </p>
              <ul className="technique-grid">
                {views.slice(0, visible).map(({ group, kind, shown: ops }) => (
                  <li key={group.name}>
                    <button type="button" className="btn-bare technique-card lift" aria-haspopup="dialog" onClick={() => setOpenName(group.name)}>
                      <span className="technique-card-eyebrow">{[kind, ...group.umbrellaNames].join(' · ')}</span>
                      <span className="technique-card-head">
                        <span className="technique-card-name">{group.name}</span>
                        <span className="technique-card-count">
                          {ops.length}{ops.length < group.entries.length && <span className="technique-card-of">/{group.entries.length}</span>}
                          <span className="visually-hidden"> operators</span>
                        </span>
                      </span>
                      {group.definition && <span className="technique-card-definition">{group.definition}</span>}
                      <OperatorFaces faces={ops} max={7} />
                    </button>
                  </li>
                ))}
              </ul>
              <LoadOnScroll shown={visible} total={views.length} onMore={() => setShown({ key: listKey, count: visible + PAGE })} />
            </>
          )}
        </div>
      </main>

      {openGroup && (
        <TechniqueRecord
          key={openGroup.name}
          group={openGroup}
          kind={techniqueKind(openGroup.name, openGroup.umbrellaNames)}
          shown={open?.shown ?? []}
          filterSummary={(() => {
            const parts = [...operatorFilters, ...(query && open && !open.nameHit ? [`“${query}”`] : [])];
            return parts.length && open ? parts.join(' · ') : null;
          })()}
          branchClasses={branchClasses}
          onClose={() => setOpenName('')}
        />
      )}
    </>
  );
}

/** Each branch's class, from the roster. */
async function readBranchClasses(): Promise<Record<string, string>> {
  const { getAllOperators } = await import('@/lib/operators/operators');
  const out: Record<string, string> = {};
  for (const op of getAllOperators()) if (op.branch && op.class) out[op.branch] = op.class;
  return out;
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/techniques', async () => {
  return { props: { groups: buildTechniqueGroups(), branchClasses: await readBranchClasses() } };
}, {
  // A release compiled before the Class filter has no branchClasses: read them where the
  // roster is on disk, else leave the map empty and the filter hidden.
  finalize: async (props) => ({
    ...props,
    branchClasses: props.branchClasses ?? await readBranchClasses().catch(() => ({})),
    // Releases compiled before the records' short form have no excerpt or note on a badge:
    // cut the same clause here, so both modes of the record read alike.
    groups: props.groups.map((group) => ({
      ...group,
      entries: group.entries.map((entry) => ({
        ...entry,
        badges: entry.badges.map((badge) => ({ ...badge, excerpt: badge.excerpt !== undefined ? badge.excerpt : techniqueExcerpt(badge), note: badge.note ?? null })),
      })),
    })),
  }),
});
