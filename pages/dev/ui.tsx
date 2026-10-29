import { useMemo, useState, type CSSProperties } from 'react';
import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import StyledSelect, { type SelectOption } from '@/components/ui/StyledSelect';
import { renderMonthValue } from '@/components/schedule/CalendarMonthValue';
import SearchInput from '@/components/ui/SearchInput';
import XButton from '@/components/ui/XButton';
import ScrollRow from '@/components/ui/ScrollRow';
import Rarity, { type RarityLevel } from '@/components/ui/Rarity';
import { devOnlyStaticProps } from '@/lib/dev/devOnly';

export const getStaticProps = devOnlyStaticProps;

/*
 * The UI primitives, all on one page, for building and checking them under
 * `npm run dev` (it is a 404 in production, like every page under /dev). Each block is
 * the snippet docs/development/ui-primitives.md gives, so what you see here is what a
 * page gets. Layout here is inline on purpose: nothing on this page is a pattern.
 */
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 };
const card: CSSProperties = { width: 150, height: 96, display: 'grid', placeItems: 'center', background: 'var(--panel-grad)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-frame)' };

type Faction = SelectOption & { n: number };
const FACTIONS: Faction[] = [
  { value: '', label: 'All factions', n: 412 },
  { value: 'ri', label: 'Rhodes Island', group: 'Terra', n: 120 },
  { value: 'kj', label: 'Kjerag', group: 'Terra', n: 9 },
  { value: 'la', label: 'Laterano', group: 'Terra', n: 22 },
  { value: 'ab', label: 'Abyssal Hunters', group: 'Sea', n: 7, disabled: true },
  { value: 'ib', label: 'Iberia', group: 'Sea', n: 11 },
  ...Array.from({ length: 16 }, (_, i) => ({ value: `x${i}`, label: `Faction ${String.fromCharCode(65 + i)}`, group: 'More', n: i })),
];
const OPERATORS = ['Amiya', 'Amiya (Guard)', 'Angelina', 'Archetto', 'Ash', 'Aak', 'Blaze', 'Bagpipe', 'Ch\'en', 'Exusiai', 'Eyjafjalla', 'Surtr', 'Skadi'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m) => ({ value: m, label: m }));

export default function UiPrimitivesPage() {
  const [view, setView] = useState<'grid' | 'list' | 'table'>('grid');
  const [rarity, setRarity] = useState<number | 'all'>('all');
  const [tags, setTags] = useState<string[]>(['Healing']);
  const [preset, setPreset] = useState('a');
  const [tab, setTab] = useState<'overview' | 'skills' | 'modules'>('overview');
  const [faction, setFaction] = useState('');
  const [month, setMonth] = useState('September');
  const [plain, setPlain] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState('');
  const [options, setOptions] = useState<Record<string, boolean>>({ daily: true, weekly: true, monthly: false });
  const matches = useMemo(() => OPERATORS.filter((o) => query.trim() && o.toLowerCase().includes(query.trim().toLowerCase())), [query]);

  return (
    <>
      <Head><title>UI primitives — Arkpedia dev</title></Head>
      <PageHeader
        eyebrow="Rhodes Island // Development"
        title="UI primitives"
        sub="Every shared control, as components/ui renders it. Toggle the theme to check both."
        actions={<SegmentedControl label="View" value={view} onChange={setView} options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }, { value: 'table', label: 'Table' }]} />}
      />
      <main>
        <section className="op-section" id="buttons">
          <h2>Buttons</h2>
          <div style={row}>
            <button type="button" className="primary">Primary</button>
            <button type="button">Secondary</button>
            <button type="button" className="ghost">Ghost</button>
            <button type="button" className="danger">Reset base</button>
            <button type="button" className="primary" disabled>Disabled primary</button>
            <button type="button" disabled>Disabled</button>
          </div>
          <p className="hint">Four variants, two sizes: a base or primary button on its own is the 44px call to action; everything in a row of controls is var(--control-h), through .btn-sm; a square icon button is .btn-icon, and a close or remove × is XButton (.btn-x), with no border.</p>
          <div style={row} data-testid="control-row">
            <SearchInput label="Search in a row" value={plain} onChange={setPlain} placeholder="One control height…" />
            <StyledSelect label="Faction in a row" value={faction} onChange={setFaction} options={FACTIONS} />
            <button type="button" className="filter-chip" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Chip</button>
            <button type="button" className="ghost">Ghost</button>
            <button type="button" className="danger">Reset</button>
            <button type="button" className="btn-sm">Small</button>
            <button type="button" className="primary btn-sm">Primary small</button>
            <XButton label="Close" />
            <button type="button" className="btn-icon" aria-label="Next">›</button>
          </div>
          <div style={row}>
            <button type="button" className="btn-bare pick-card" style={{ ...card, border: undefined }} aria-pressed={preset === 'a'} onClick={() => setPreset('a')}>Preset A (pick-card)</button>
            <button type="button" className="btn-bare pick-card" style={{ ...card, border: undefined }} aria-pressed={preset === 'b'} onClick={() => setPreset('b')}>Preset B</button>
            <button type="button" className="btn-bare" style={card}>btn-bare: a card</button>
            <a className="lift" href="#buttons" style={{ ...card, border: '1px solid transparent', color: 'var(--text)', textDecoration: 'none' }}>.lift: rises on hover</a>
          </div>
          <p className="hint">Motion (rule 23, styles/core/motion.css, none under reduced motion): buttons, chips and tabs press in; picture cards rise 3px on hover and focus (.lift for a card whose class is a module&apos;s); the tab underline below slides; images fade in as they arrive; the LIVE dot blinks.</p>
        </section>

        <section className="op-section" id="tabs">
          <h2>Tabs</h2>
          {/* One of N panels in place: the first label starts on the heading's edge. */}
          <Tabs label="Example sections" id="dev-tabs" value={tab} onChange={setTab}
            options={[{ value: 'overview', label: 'Overview' }, { value: 'skills', label: 'Skills', count: 3 }, { value: 'modules', label: 'Modules', disabled: true }]} />
          <p {...tabPanelProps('dev-tabs', tab)} className="hint">The {tab} panel. Left/Right, Home and End move along the strip.</p>
          {/* Links between routes take the same classes, marked aria-current. */}
          <nav className="tabs" aria-label="Example routes" style={{ marginTop: 14 }}>
            <a className="tab" href="#tabs" aria-current="page">Terminal</a>
            <a className="tab" href="#tabs">Score</a>
            <a className="tab" href="#tabs">Supplies</a>
          </nav>
          <div style={{ ...row, marginTop: 14 }}>
            <span className="badge-live">Live now</span>
            <span className="badge-live">Running now</span>
            <span className="badge-upcoming">Starts in 3d 4h</span>
          </div>
        </section>

        <section className="op-section" id="chips">
          <h2>SegmentedControl and chips</h2>
          <div style={row}>
            <SegmentedControl label="Rarity" value={rarity} onChange={setRarity}
              options={[{ value: 'all', label: 'All' }, ...[6, 5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n}★`, ariaLabel: `${n}-star`, count: n * 7 }))]} />
          </div>
          <div style={row} role="group" aria-label="Tags">
            {['Healing', 'DPS', 'Crowd control', 'Support'].map((tag) => (
              <button key={tag} type="button" className="filter-chip" aria-pressed={tags.includes(tag)}
                onClick={() => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]))}>{tag}</button>
            ))}
            <button type="button" className="filter-chip" disabled>Disabled</button>
          </div>
        </section>

        <section className="op-section" id="checkboxes">
          <h2>Checkboxes</h2>
          <div style={row} role="group" aria-label="Options">
            {([['daily', 'Daily missions'], ['weekly', 'Weekly missions'], ['monthly', 'Monthly card']] as const).map(([key, label]) => (
              <label key={key} className="check"><input type="checkbox" checked={options[key]} onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))} />{label}</label>
            ))}
            <label className="check"><input type="checkbox" disabled />Disabled</label>
            <label className="check"><input type="checkbox" checked disabled readOnly />Disabled, checked</label>
          </div>
        </section>

        <section className="op-section" id="selects">
          <h2>StyledSelect</h2>
          <div style={row}>
            <StyledSelect<Faction> label="Filter by faction" value={faction} onChange={setFaction} options={FACTIONS} style={{ width: 240 }}
              renderOption={(o) => <><span style={{ flex: 1 }}>{o.label}</span><span className="filter-chip-count">{o.n}</span></>} />
            <StyledSelect label="Month" size="title" value={month} onChange={setMonth} options={MONTHS} renderValue={renderMonthValue} />
            <StyledSelect label="Empty" value="" onChange={() => {}} options={[]} placeholder="No options" style={{ width: 180 }} />
          </div>
        </section>

        <section className="op-section" id="search">
          <h2>SearchInput</h2>
          <div style={{ ...row, maxWidth: 420 }}>
            <SearchInput label="Search operators" value={plain} onChange={setPlain} placeholder="Search by name…" />
          </div>
          <div style={{ ...row, maxWidth: 420 }}>
            <SearchInput label="Guess an operator" value={query} onChange={setQuery} placeholder="Type an operator…"
              suggestions={matches} getKey={(o) => o} renderSuggestion={(o) => <span>{o}</span>}
              onPick={(o) => { setPicked(o); setQuery(''); }} suggestLabel="Matching operators" emptyText="No operators found." />
          </div>
          <p className="hint" data-testid="picked">Picked: {picked || 'nothing'}</p>
        </section>

        <section className="op-section" id="scroll">
          <h2>ScrollRow</h2>
          <ScrollRow label="Example cards">
            {Array.from({ length: 12 }, (_, i) => <div key={i} style={card}>Card {i + 1}</div>)}
          </ScrollRow>
          <p className="hint">With <code>controls</code>: previous/next buttons under the row, disabled at each end.</p>
          <ScrollRow label="Example cards with controls" controls>
            {Array.from({ length: 12 }, (_, i) => <div key={i} style={card}>Card {i + 1}</div>)}
          </ScrollRow>
        </section>

        {/* r9 headings-spacing: the four heading roles and the rhythm between them. */}
        <section className="op-section" id="headings">
          <h2>Headings and rhythm</h2>
          <p className="hint">A section h2 (.op-section h2, or .section-title outside one) sits --heading-gap (14px) above its content; sections stack --section-gap (36px) apart.</p>
          <h3>A sub-section: the global h3</h3>
          <div style={{ ...card, width: 'auto', height: 'auto', display: 'block', padding: 'var(--card-inset)' }}>
            <h3 className="entity-title">Entity title, 22px</h3>
            <h3 className="entity-title entity-title-sm">Under an 18px section h2: .entity-title-sm</h3>
            <h3 className="entity-title entity-title-xs">In a sheet: .entity-title-xs</h3>
          </div>
          <h3 className="label-tag">A micro-label: .label-tag</h3>
          <ul>
            <li>A list keeps its bullets in a 1.1em marker column at the text&apos;s edge.</li>
            <li>The text hangs after them.</li>
          </ul>
        </section>
        <section className="op-section" id="headings-next">
          <h2 className="section-title">.section-title, the same heading outside an .op-section</h2>
          <p className="hint">36px above this section is --section-gap.</p>
        </section>

        <section className="op-section" id="directories">
          <h2>Reference directories</h2>
          <p className="hint">Shared directory grid and card surfaces. These groups contain individual links; the group itself is not clickable. See docs/development/design-system.md for when to use cards or rows.</p>
          <ul className="directory-grid">
            {[
              { title: 'People', text: 'Named credits with their operators.', href: '/artists', label: 'Browse artists' },
              { title: 'Mechanics', text: 'A name, a brief definition and the operators it affects.', href: '/techniques', label: 'Browse techniques' },
              { title: 'Stories', text: 'Searchable records alongside a reading-order map.', href: '/story?view=list', label: 'Browse stories' },
            ].map(item => <li key={item.title} className="panel directory-card"><div>
              <h3 className="entity-title entity-title-sm entity-title-name">{item.title}</h3>
              <p>{item.text}</p>
              <a href={item.href}>{item.label}</a>
            </div></li>)}
          </ul>
        </section>

        <section className="op-section" id="rarity">
          <h2>Rarity</h2>
          <div style={row}>
            {([6, 5, 4, 3, 2, 1] as RarityLevel[]).map((n) => <Rarity key={n} n={n} />)}
            <Rarity n={6} format="stars" />
          </div>
          <div style={row}>
            {([6, 5, 4, 3, 2, 1] as RarityLevel[]).map((n) => <div key={n} className={`tier-${n}`} style={{ ...card, width: 64, height: 64, border: undefined }}>{n}</div>)}
            {([6, 5, 4, 3, 2, 1] as RarityLevel[]).map((n) => <div key={`f${n}`} className={`tier-fill-${n}`} style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-frame)', fontWeight: 700 }}>{n}★</div>)}
          </div>
          <div style={row}>
            {['blue', 'yellow', 'orange', 'green', 'red', 'grey'].map((c) => (
              <span key={c} style={{ color: `var(--cat-${c})`, border: `1px solid color-mix(in srgb, var(--cat-${c}) 45%, transparent)`, background: `color-mix(in srgb, var(--cat-${c}) 12%, transparent)`, padding: '4px 8px', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>--cat-{c}</span>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
