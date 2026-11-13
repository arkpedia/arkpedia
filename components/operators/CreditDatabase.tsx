import { useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { ContentImg } from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import { rarityLevel } from '@/components/ui/Rarity';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import FilterSheet, { INLINE_RESET, type ActiveFilter } from '@/components/ui/FilterSheet';
import { operatorHref } from '@/lib/operators/operatorHref';
import { getClassIconPath } from '@/lib/operators/classBranchIcons';
import { sortClasses } from '@/lib/operators/classOrder';
import { operatorBelongsToFaction } from '@/lib/operators/factionAliases';
import { isReleasedAt } from '@/lib/operators/operatorAvailability';
import type { CreditDatabaseData, CreditEntry, CreditKind, CreditOperator } from '@/lib/operators/creditDatabase';
import { artCreditKind, letterGroup, letterGroupLabel, letterGroupRank, shortArtCredit, type ArtCreditKind } from '@/lib/operators/creditNames';
import { useQueryRecord } from '@/lib/hooks/useQueryState';
import { useReaderClock } from '@/lib/time/readerClock';
import { matchesSearch } from '@/lib/search/searchNormalize';

/** The page's data, as getStaticProps hands it over: the credits, and the request's clock. */
export type CreditPageProps = CreditDatabaseData & { now: number };

/**
 * Every filter and the order live in the address (one record, so Reset reaches it whole),
 * so a filtered view can be shared. `lang` only means something on /voice-actors and
 * `credit` only on /artists.
 */
const QUERY = { q: '', lang: 'all', credit: 'all', rarity: 'all', class: 'all', faction: 'all', server: 'all', sort: 'name', letter: 'all' } as const;
type Query = Record<keyof typeof QUERY, string>;

const PAGE_SIZE = 40;
const RARITIES = [6, 5, 4, 3, 2, 1];
/** The groups the count order is shown in, largest first: [least operators, heading, key]. */
const COUNT_BANDS = [[20, '20 or more operators', '20'], [10, '10 to 19 operators', '10'], [5, '5 to 9 operators', '5'], [2, '2 to 4 operators', '2'], [1, '1 operator', '1']] as const;
const ART_CREDITS: { value: 'all' | ArtCreditKind; label: string }[] = [
  { value: 'all', label: 'Any credit' }, { value: 'art', label: 'Operator art' }, { value: 'outfit', label: 'Outfits' }, { value: 'design', label: 'Original design' },
];

interface Shown { name: string; entries: CreditEntry[]; total: number }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function CreditDatabase({ people, uncredited, operators, now, kind }: CreditPageProps & { kind: CreditKind }) {
  const voices = kind === 'voice-actors';
  const title = voices ? 'Voice actors' : 'Artists';
  const noun = voices ? 'voice actor' : 'artist';
  const [query, setQuery] = useQueryRecord<keyof typeof QUERY>(QUERY);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const clock = useReaderClock(now);
  // Filtering can leave the list a fraction of its height: the hold keeps the document
  // reaching the bottom of the reader's screen, so the toolbar they pressed stays put
  // (the Anti-Page Jump rule), and melts as they scroll back up.
  const hold = useSwitchHold(kind);
  const change = (patch: Partial<Query>) => { hold.capture(); setLimit(PAGE_SIZE); setQuery(patch); };

  const byName = useMemo(() => new Map(operators.map(op => [op.name, op])), [operators]);
  const classes = useMemo(() => sortClasses(operators.map(op => op.class).filter((c): c is string => !!c)), [operators]);
  const factions = useMemo(() => [...new Set(operators.flatMap(op => [op.faction, ...op.umbrellaFactions, ...op.connectedFactions]).filter((f): f is string => !!f))].sort(), [operators]);
  const languages = useMemo(() => {
    if (!voices) return [];
    const count = new Map<string, number>();
    for (const person of people) for (const language of new Set(person.operators.flatMap(op => op.credits))) count.set(language, (count.get(language) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [people, voices]);

  const lang = voices && languages.some(([l]) => l === query.lang) ? query.lang : 'all';
  const credit = !voices && ART_CREDITS.some(c => c.value === query.credit) ? query.credit as ArtCreditKind | 'all' : 'all';
  const sort = query.sort === 'count' ? 'count' : 'name';

  /** The operators a filter keeps, with only the credits it asked about. */
  const keep = useMemo(() => {
    const opOk = (op: CreditOperator | undefined) => !!op
      && (query.rarity === 'all' || String(op.rarity) === query.rarity)
      && (query.class === 'all' || op.class === query.class)
      && (query.faction === 'all' || operatorBelongsToFaction(op, query.faction))
      && (query.server === 'all' || (query.server === 'cn') !== isReleasedAt(op, clock));
    const creditOk = (c: string) => voices ? (lang === 'all' || c === lang) : (credit === 'all' || artCreditKind(c) === credit);
    return (entries: CreditEntry[]): CreditEntry[] => entries.flatMap(entry => {
      if (!opOk(byName.get(entry.name))) return [];
      const credits = entry.credits.filter(creditOk);
      return credits.length ? [{ name: entry.name, credits }] : [];
    });
  }, [query.rarity, query.class, query.faction, query.server, clock, voices, lang, credit, byName]);

  // Everyone the filters keep, before the letter: the letter row counts from this.
  const matched = useMemo(() => {
    const q = query.q.trim();
    const out: (Shown & { group: string })[] = [];
    for (const person of people) {
      const byPerson = !q || matchesSearch(person.name, q);
      const entries = keep(byPerson ? person.operators : person.operators.filter(op => matchesSearch(op.name, q)));
      if (entries.length) out.push({ name: person.name, entries, total: person.operators.length, group: letterGroup(person.name) });
    }
    return out;
  }, [people, keep, query.q]);

  const letters = useMemo(() => {
    const all = [...new Set(people.map(p => letterGroup(p.name)))].sort((a, b) => letterGroupRank(a) - letterGroupRank(b));
    const count = new Map<string, number>();
    for (const p of matched) count.set(p.group, (count.get(p.group) ?? 0) + 1);
    return all.map(group => ({ group, n: count.get(group) ?? 0 }));
  }, [people, matched]);
  const letter = letters.some(l => l.group === query.letter) ? query.letter : 'all';

  const list = useMemo(() => {
    const rows = letter === 'all' ? matched : matched.filter(p => p.group === letter);
    const band = (n: number) => COUNT_BANDS.find(([least]) => n >= least)!;
    const keyed = rows.map(p => ({ ...p, key: sort === 'count' ? band(p.entries.length)[2] : p.group }));
    return keyed.sort(sort === 'count'
      ? (a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name)
      : (a, b) => letterGroupRank(a.group) - letterGroupRank(b.group) || a.name.localeCompare(b.name));
  }, [matched, letter, sort]);

  const groups = useMemo(() => {
    const out: { key: string; heading: string; people: typeof list; size: number }[] = [];
    const sizes = new Map<string, number>();
    for (const p of list) sizes.set(p.key, (sizes.get(p.key) ?? 0) + 1);
    for (const p of list.slice(0, limit)) {
      let group = out[out.length - 1];
      if (!group || group.key !== p.key) {
        const heading = sort === 'count' ? COUNT_BANDS.find(b => b[2] === p.key)![1] : letterGroupLabel(p.key);
        group = { key: p.key, heading, people: [], size: sizes.get(p.key) ?? 0 };
        out.push(group);
      }
      group.people.push(p);
    }
    return out;
  }, [list, limit, sort]);

  const unnamed = useMemo(() => {
    if (letter !== 'all') return [];
    const q = query.q.trim();
    return keep(q ? uncredited.filter(op => matchesSearch(op.name, q)) : uncredited);
  }, [uncredited, keep, letter, query.q]);

  const credited = list.reduce((n, p) => n + p.entries.length, 0);
  const filtered = (Object.keys(QUERY) as (keyof typeof QUERY)[]).some(key => key !== 'sort' && query[key] !== QUERY[key]);
  const reset = () => change({ q: '', lang: 'all', credit: 'all', rarity: 'all', class: 'all', faction: 'all', server: 'all', letter: 'all' });
  const allShown = limit >= list.length;

  // The phone's Filters sheet (components/ui/FilterSheet): one chip per filter that is on.
  // The search keeps its own ×, and the order is not a filter.
  const activeFilters: ActiveFilter[] = [
    ...(lang !== 'all' ? [{ key: 'lang', label: lang, remove: () => change({ lang: 'all' }) }] : []),
    ...(credit !== 'all' ? [{ key: 'credit', label: ART_CREDITS.find(c => c.value === credit)!.label, remove: () => change({ credit: 'all' }) }] : []),
    ...(query.faction !== 'all' ? [{ key: 'faction', label: query.faction, remove: () => change({ faction: 'all' }) }] : []),
    ...(query.rarity !== 'all' ? [{ key: 'rarity', label: `${query.rarity}★`, remove: () => change({ rarity: 'all' }) }] : []),
    ...(query.class !== 'all' ? [{ key: 'class', label: query.class, remove: () => change({ class: 'all' }) }] : []),
    ...(query.server === 'global' || query.server === 'cn' ? [{ key: 'server', label: query.server === 'cn' ? 'CN only' : 'On Global', remove: () => change({ server: 'all' }) }] : []),
    ...(letter !== 'all' ? [{ key: 'letter', label: `Letter ${letterGroupLabel(letters.find(l => l.group === letter)!.group)}`, remove: () => change({ letter: 'all' }) }] : []),
  ];
  /** The sheet's Reset: every filter a chip shows, in one write. */
  const resetSheet = () => change({ lang: 'all', credit: 'all', rarity: 'all', class: 'all', faction: 'all', server: 'all', letter: 'all' });

  const tile = (entry: CreditEntry) => {
    const op = byName.get(entry.name);
    const tier = op?.rarity ? ` tier-${rarityLevel(op.rarity)}` : '';
    const cnOnly = op && !isReleasedAt(op, clock);
    const label = voices ? entry.credits.join(' · ') : entry.credits.map(shortArtCredit).join(' · ');
    return (
      <li key={entry.name}>
        <Link prefetch={false} className="credit-op" href={operatorHref(entry.name, voices ? 'voiceLines' : 'artwork')} title={`${entry.name}: ${entry.credits.join(', ')}`}>
          <span className={`credit-op-art${tier}`}>
            {op?.icon ? <ContentImg src={op.icon} alt="" width={48} height={48} /> : <span className="art-placeholder">No art yet</span>}
          </span>
          <span className="credit-op-text">
            <span className="credit-op-name">{entry.name}</span>
            <span className="credit-op-credit">{label}{cnOnly ? <span className="credit-op-cn"> · CN only</span> : null}</span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <Head><title>{`${title} — Arkpedia`}</title></Head>
      <PageHeader stickyActions
        eyebrow={voices ? 'Rhodes Island // Voice credits' : 'Rhodes Island // Art credits'}
        title={title}
        sub={voices ? 'Everyone credited with an operator’s voice, in every language the game ships.' : 'Everyone credited with an operator’s artwork, its promotions and its outfits.'}
        actions={<div className="roster-controls credit-controls">
          <nav className="tabs credit-switch" aria-label="Credits">
            <Link prefetch={false} className="tab" href="/artists" aria-current={voices ? undefined : 'page'}>Artists</Link>
            <Link prefetch={false} className="tab" href="/voice-actors" aria-current={voices ? 'page' : undefined}>Voice actors</Link>
          </nav>
          <SearchInput className="roster-search" label={`Search ${title.toLowerCase()}`} placeholder={`${voices ? 'Actor' : 'Artist'} or operator`} value={query.q} onChange={q => change({ q })} />
          {/* On a phone everything but the page switch and the search folds into the sheet. */}
          <FilterSheet controlsClassName="roster-controls credit-controls" active={activeFilters} onReset={resetSheet} hold={hold} controls={<>
          {voices
            ? <StyledSelect className="credit-filter" menuMinWidth={200} menuMaxHeight={280} label="Filter by language" value={lang} onChange={value => change({ lang: value })}
                options={[{ value: 'all', label: 'All languages' }, ...languages.map(([value, n]) => ({ value, label: `${value} (${n})` }))]} />
            : <StyledSelect className="credit-filter" menuMinWidth={200} menuMaxHeight={280} label="Filter by credit" value={credit} onChange={value => change({ credit: value })} options={ART_CREDITS} />}
          <StyledSelect className="credit-filter" menuMinWidth={200} menuMaxHeight={280} label="Filter by faction" value={query.faction} onChange={value => change({ faction: value })}
            options={[{ value: 'all', label: 'All factions' }, ...factions.map(f => ({ value: f, label: f }))]} />
          <div className="roster-rarity-class-row">
            {/* Independent filter chips: pressing the lit one clears it, as on /operators. */}
            <div className="roster-button-group" role="group" aria-label="Rarity">
              {RARITIES.map(r => (
                <button type="button" key={r} className="filter-chip" aria-label={`${r}-star`} aria-pressed={query.rarity === String(r)}
                  onClick={() => change({ rarity: query.rarity === String(r) ? 'all' : String(r) })}>{r}★</button>
              ))}
            </div>
            <div className="roster-button-group" role="group" aria-label="Class">
              {classes.map(c => (
                <button type="button" key={c} className="filter-chip roster-icon-chip" aria-label={c} aria-pressed={query.class === c}
                  onClick={() => change({ class: query.class === c ? 'all' : c })}>
                  <OperatorGameIcon src={getClassIconPath(c)!} label={c} size={24} />
                </button>
              ))}
            </div>
          </div>
          <div className="roster-filter-row">
            <SegmentedControl label="Server" value={query.server === 'global' || query.server === 'cn' ? query.server : 'all'} onChange={server => change({ server })}
              options={[{ value: 'all', label: 'All' }, { value: 'global', label: 'On Global' }, { value: 'cn', label: 'CN only' }]} />
            <span className="toolbar-spacer" aria-hidden="true" />
            <SegmentedControl label="Sort by" value={sort} onChange={value => change({ sort: value })}
              options={[{ value: 'name', label: 'Name' }, { value: 'count', label: 'Most operators' }]} />
            <button type="button" className={`ghost ${INLINE_RESET}`} onClick={reset} disabled={!filtered} title={filtered ? undefined : 'No filter to reset'}>Reset</button>
          </div>
          <div className="credit-letters sidescroll">
            <SegmentedControl className="credit-letter-row" label="First letter" value={letter} onChange={value => change({ letter: value })}
              options={[{ value: 'all', label: 'All' }, ...letters.map(({ group, n }) => ({
                value: group, label: letterGroupLabel(group), disabled: !n && group !== letter,
                title: n ? `${plural(n, noun)} under ${letterGroupLabel(group)}` : `No ${noun}s under ${letterGroupLabel(group)} with these filters`,
              }))]} />
          </div>
          </>} />
        </div>}
      />
      <main>
        <div ref={hold.ref} style={hold.style}>
          <p className="hint credit-summary" aria-live="polite">
            {list.length
              ? `${plural(list.length, noun)} · ${plural(credited, 'operator credit')}${filtered ? ' match' : ''}`
              : `No ${noun}s match${unnamed.length ? '' : ' these filters'}.`}
          </p>
          {groups.map(group => (
            <section key={group.key} className="op-section credit-group" id={`credits-${group.key}`} aria-labelledby={`credits-${group.key}-h`}>
              <div className="credit-group-head">
                <h2 id={`credits-${group.key}-h`}>{group.heading}</h2>
                <span className="hint">{plural(group.size, noun)}</span>
              </div>
              <ul className="directory-grid credit-people">
                {group.people.map(person => (
                  <li key={person.name} className="panel directory-card credit-person">
                    <div className="credit-person-head">
                      <h3 className="entity-title entity-title-sm entity-title-name">{person.name}</h3>
                      <p className="hint credit-person-meta">
                        {person.entries.length === person.total ? plural(person.total, 'operator') : `${person.entries.length} of ${plural(person.total, 'operator')}`}
                        {voices ? ` · ${[...new Set(person.entries.flatMap(e => e.credits))].join(', ')}` : ''}
                      </p>
                    </div>
                    <ul className="credit-ops">{person.entries.map(tile)}</ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <LoadOnScroll shown={Math.min(limit, list.length)} total={list.length} onMore={() => setLimit(value => value + PAGE_SIZE)} />
          {allShown && unnamed.length > 0 && (
            <section className="op-section credit-group credit-uncredited" id="credits-uncredited" aria-labelledby="credits-uncredited-h">
              <div className="credit-group-head">
                <h2 id="credits-uncredited-h">Uncredited</h2>
                <span className="hint">{plural(unnamed.length, 'operator')}</span>
              </div>
              <p className="hint credit-uncredited-note">The game’s files name no {noun} for these{voices ? ' recordings' : ''}.</p>
              <ul className="credit-ops">{unnamed.map(tile)}</ul>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
