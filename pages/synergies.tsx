import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import FilterSheet, { INLINE_RESET, type ActiveFilter } from '@/components/ui/FilterSheet';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import OperatorFaces from '@/components/techniques/OperatorFaces';
import SynergyEmblem from '@/components/techniques/SynergyEmblem';
import SynergyRecord from '@/components/techniques/SynergyRecord';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { matchesSearch } from '@/lib/search/searchNormalize';
import { buildSynergyGroups, type SynergyGroup } from '@/lib/techniques/buildSynergyGroups';
import { SYNERGY_BUFFS, synergyBuffs, type SynergyBuff } from '@/lib/techniques/synergyBuffs';

interface Props {
  groups: SynergyGroup[];
  /** Each faction's emblem where one is on file (a class draws its glyph). Releases
   *  compiled before this have none; finalize fills them from the asset index. */
  emblems: Record<string, string | null>;
}

const PAGE = 12;

/** The buff kinds each of a group's contributors grants it, worked out from their texts
 *  (lib/techniques/synergyBuffs.ts), so a release of any age can be filtered. */
function giverBuffs(group: SynergyGroup): Map<string, Set<SynergyBuff>> {
  return new Map(group.entries.filter((e) => e.isContributor).map((e) => [
    e.operatorName,
    new Set(e.badges.flatMap((b) => synergyBuffs(b.sourceText, b.matchedKeyword))),
  ]));
}

export default function SynergiesPage({ groups, emblems }: Props) {
  const [search, setSearch] = useQueryState('q');
  const [typeRaw, setType] = useQueryState('type', 'all');
  const [buffRaw, setBuff] = useQueryState('buff', 'all');
  const [openName, setOpenName] = useQueryState('s');
  const type = typeRaw === 'faction' || typeRaw === 'class' ? typeRaw : 'all';
  const buff = (SYNERGY_BUFFS as readonly string[]).includes(buffRaw) ? buffRaw as SynergyBuff : 'all';

  const buffsByGroup = useMemo(() => new Map(groups.map((g) => [g.name, giverBuffs(g)])), [groups]);
  const buffs = useMemo(() => {
    const present = new Set([...buffsByGroup.values()].flatMap((m) => [...m.values()].flatMap((s) => [...s])));
    return SYNERGY_BUFFS.filter((b) => present.has(b));
  }, [buffsByGroup]);

  const query = search.trim();
  /** Each faction or class left, with the contributors that grant the picked buff. */
  const views = useMemo(() => groups.map((group) => {
    const buffsOf = buffsByGroup.get(group.name)!;
    const givers = group.entries.filter((e) => e.isContributor && (buff === 'all' || buffsOf.get(e.operatorName)!.has(buff)));
    const tags = SYNERGY_BUFFS.filter((b) => givers.some((e) => buffsOf.get(e.operatorName)!.has(b)));
    const hit = !query || matchesSearch(group.name, query) || group.entries.some((e) => matchesSearch(e.operatorName, query));
    return { group, givers, tags, members: group.entries.length - group.entries.filter((e) => e.isContributor).length, hit };
  }).filter((v) => v.hit && v.givers.length > 0 && (type === 'all' || v.group.type === type)), [groups, buffsByGroup, query, buff, type]);

  const listKey = [query, type, buff].join('|');
  const [shown, setShown] = useState({ key: listKey, count: PAGE });
  const visible = shown.key === listKey ? shown.count : PAGE;

  const hold = useSwitchHold('synergies');
  const activeFilters: ActiveFilter[] = [
    ...(type !== 'all' ? [{ key: 'type', label: type === 'class' ? 'Classes' : 'Factions', remove: () => setType('all') }] : []),
    ...(buff !== 'all' ? [{ key: 'buff', label: buff, remove: () => setBuff('all') }] : []),
  ];
  function resetSheet() {
    for (const filter of activeFilters) filter.remove();
  }
  function resetFilters() {
    setSearch('');
    resetSheet();
  }

  const open = openName ? groups.find((g) => g.name === openName) ?? null : null;
  const factions = groups.filter((g) => g.type === 'faction').length;

  return (
    <>
      <Head><title>Synergies — Arkpedia</title></Head>
      <PageHeader stickyActions
        eyebrow={<><Link prefetch={false} href="/operators">Operators</Link>{' // Faction and class buffs'}</>}
        title="Synergies"
        sub={<>
          {factions} factions and {groups.length - factions} classes that an operator&apos;s skill, talent or module buffs. Pick
          one to see who grants what, and who it reaches.
        </>}
        actions={<div className="roster-controls technique-controls">
          <SearchInput className="roster-search" label="Search synergies or operators" name="synergy-search"
            placeholder="Faction, class or operator…" value={search} onChange={setSearch} />
          <FilterSheet controlsClassName="roster-controls technique-controls" active={activeFilters} onReset={resetSheet} hold={hold} controls={<>
            <div className="roster-filter-row">
              <SegmentedControl label="Show" value={type}
                options={[{ value: 'all', label: 'All' }, { value: 'faction', label: 'Factions' }, { value: 'class', label: 'Classes' }]}
                onChange={setType} />
              <span className="toolbar-spacer" aria-hidden="true" />
              <button type="button" className={`ghost ${INLINE_RESET}`} onClick={resetFilters}>Reset</button>
            </div>
            {/* Pick-one chips, as on /operators: pressing the lit one clears it. */}
            <div className="roster-button-group technique-chip-row" role="group" aria-label="Buff">
              {buffs.map((b) => (
                <button type="button" key={b} className="filter-chip" aria-pressed={buff === b} onClick={() => setBuff(buff === b ? 'all' : b)}>
                  {b}
                </button>
              ))}
            </div>
          </>} />
        </div>}
      />

      <main>
        <div ref={hold.ref} style={hold.style}>
          {views.length === 0 ? (
            <div className="waiting-box">
              <h2>No synergy matches</h2>
              <p className="hint">Try another search, or reset the filters.</p>
            </div>
          ) : (
            <>
              <p className="hint technique-tally">
                {views.length === groups.length ? `All ${groups.length} synergies` : `${views.length} of ${groups.length} synergies`}
                {buff !== 'all' && <> · granting {buff}</>}
              </p>
              <ul className="directory-grid">
                {views.slice(0, visible).map(({ group, givers, tags, members }) => (
                  <li key={`${group.type}-${group.name}`}>
                    <button type="button" className="btn-bare directory-card technique-card synergy-card lift" aria-haspopup="dialog" onClick={() => setOpenName(group.name)}>
                      <span className="synergy-card-head">
                        <SynergyEmblem group={group} emblem={emblems[group.name] ?? null} size={40} />
                        <span className="synergy-card-title">
                          <span className="technique-card-eyebrow">{group.type === 'class' ? 'Class' : 'Faction'}</span>
                          <span className="entity-title entity-title-sm entity-title-name">{group.name}</span>
                        </span>
                      </span>
                      <span className="synergy-buffs">
                        {tags.map((t) => <span key={t} className="synergy-buff">{t}</span>)}
                      </span>
                      <span className="technique-card-definition">
                        Granted by {givers.map((e) => e.operatorName).join(', ')}
                      </span>
                      <OperatorFaces faces={givers} max={7} />
                      <span className="synergy-card-reach">
                        {members > 0 ? `Reaches ${members} more ${group.type === 'class' ? group.name : 'member'}${members === 1 ? '' : 's'}` : 'Every member grants one'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <LoadOnScroll shown={visible} total={views.length} onMore={() => setShown({ key: listKey, count: visible + PAGE })} />
            </>
          )}
        </div>
      </main>

      {open && <SynergyRecord key={open.name} group={open} emblem={emblems[open.name] ?? null} onClose={() => setOpenName('')} />}
    </>
  );
}

/** A faction's emblem, where the asset index lists one; a class draws its glyph instead. */
async function readEmblems(groups: SynergyGroup[]): Promise<Record<string, string | null>> {
  const { getFactionIconPath } = await import('@/lib/operators/classBranchIcons');
  const { servedAssetExists } = await import('@/lib/assets/publicAssets');
  return Object.fromEntries(groups.filter((g) => g.type === 'faction').map((g) => {
    const path = getFactionIconPath(g.name);
    return [g.name, path && servedAssetExists(path) ? path : null];
  }));
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/synergies', async () => {
  const groups = buildSynergyGroups();
  return { props: { groups, emblems: await readEmblems(groups) } };
}, {
  // The asset index is compiled into the page, so a release of any age gets its emblems.
  finalize: async (props) => (props.emblems ? props : { ...props, emblems: await readEmblems(props.groups) }),
});
