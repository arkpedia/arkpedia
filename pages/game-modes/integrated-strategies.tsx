import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchAsset } from '@/lib/assets/assetRetry';
import Image from '@/components/content/ContentImage';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import StyledSelect from '@/components/ui/StyledSelect';
import SearchInput from '@/components/ui/SearchInput';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { matchesSearch } from '@/lib/search/searchNormalize';
import type { IsTopic, IsRecord } from '@/lib/gamemodes/integratedStrategies';
import styles from './integrated-strategies.module.css';

type Theme = Omit<IsTopic, 'sections'> & { counts: Record<string, number> };
const SECTIONS = ['overview', 'stages', 'items', 'squads', 'encounters', 'mechanics', 'endings'] as const;
const LABELS = ['Overview', 'Stages', 'Items', 'Squads', 'Encounters', 'Special mechanics', 'Endings'];
/** Game markup remains text: no injected HTML or internal colour tags. */
const plain = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\\n/g, '\n');
export default function IntegratedStrategies({ themes }: { themes: Theme[] }) {
  const [themeId, setTheme] = useQueryState('theme', themes.find(t => t.source === 'Global')?.id ?? themes[0]?.id ?? '');
  const [tab, setTab] = useQueryState('tab', 'overview');
  const [query, setQuery] = useQueryState('q', '');
  const [kind, setKind] = useQueryState('kind', 'RELIC');
  const [topic, setTopic] = useState<IsTopic | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(60);
  const theme = themes.find(t => t.id === themeId) ?? themes[0];
  const section = SECTIONS.includes(tab as typeof SECTIONS[number]) ? tab : 'overview';
  useEffect(() => {
    const controller = new AbortController(); setTopic(null); setError(false);
    fetchAsset(`/_is/${theme.id}.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('catalogue'); return response.json(); }).then(setTopic).catch(e => { if (e.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [theme.id, attempt]);
  useEffect(() => setShown(60), [theme.id, section, query, kind]);
  const records = useMemo(() => (topic?.sections[section] ?? []).filter(r => (section !== 'items' || !kind || r.type === kind) && (section === 'overview' || matchesSearch(`${r.name} ${r.text}`, query))), [topic, section, query, kind]);
  const types = useMemo(() => [...new Set(topic?.sections.items.map(r => r.type).filter((type): type is string => !!type))], [topic]);
  const render = (r: IsRecord) => <article className="panel" key={r.id}><div className={styles.recordHead}><h3>{r.href ? <Link href={r.href} prefetch={false}>{plain(r.name)} ↗</Link> : plain(r.name)}</h3><span className="hint">{r.source} data</span></div><p className={styles.text}>{plain(r.text) || 'No description in the published game data.'}</p></article>;
  return <><PageMeta title="Integrated Strategies" description="Themes, stages, collectibles and special mechanics from the game data." path="/game-modes/integrated-strategies" /><PageHeader title="Integrated Strategies" eyebrow="Rhodes Island // Game modes" sub="Explore each theme’s stages, collectibles, squads and special mechanics." /><main className={styles.page}>
    <Link className={`btn ${styles.back}`} href="/game-modes">← Game Modes</Link>
    <div className={styles.controls}><StyledSelect label="Integrated Strategies theme" value={theme.id} onChange={setTheme} options={themes.map(t => ({ value: t.id, label: `${t.name}${t.source === 'CN' ? ' [CN]' : ''}` }))} /></div>
    <section className={`panel ${styles.intro}`}><div><h2>{theme.name}</h2><p className={styles.text}>{plain(theme.intro)}</p><p className="hint">{theme.source} game data · CN records fill gaps until matching Global records are available. Game data can include unreleased content.</p><p className="hint"><a href="https://github.com/Kengxxiao/ArknightsGameData" target="_blank" rel="noopener noreferrer">CN source ↗</a> · <a href="https://github.com/PuppiizSunniiz/ArknightsGameData_YoStar" target="_blank" rel="noopener noreferrer">Global source ↗</a></p></div>{theme.source === 'Global' && <Image className={styles.hero} src={`/content-art/${theme.id}.webp`} alt={theme.name} width={960} height={320} />}</section>
    <Tabs id="is-reference" label="Integrated Strategies sections" value={section} onChange={setTab} options={SECTIONS.map((value, i) => ({ value, label: LABELS[i], count: theme.counts[value] }))} />
    <section {...tabPanelProps('is-reference', section)}>
      {section !== 'overview' && <div className={styles.controls}><SearchInput label={`Search ${section}`} value={query} onChange={setQuery} placeholder={`Search ${LABELS[SECTIONS.indexOf(section as typeof SECTIONS[number])].toLowerCase()}`} />{section === 'items' && <StyledSelect label="Item category" value={kind} onChange={setKind} options={[{ value: '', label: 'All items' }, ...types.map(value => ({ value, label: value === 'RELIC' ? 'Collectibles' : value.toLowerCase().replaceAll('_', ' ') }))]} />}</div>}
      {error ? <div className="panel"><p role="alert">The theme could not be loaded.</p><button className="btn" onClick={() => setAttempt(n => n + 1)}>Try again</button></div> : !topic ? <p role="status">Loading theme…</p> : <>
        {section === 'overview' && <p className="hint">Difficulty rules from the game. Choose a tab above for the full reference.</p>}
        {section === 'endings' && <p className="hint">Spoilers: expand an ending to read its description.</p>}
        <p className="hint" role="status">{records.length.toLocaleString()} {section === 'overview' ? 'difficulty settings' : section}</p>
        <div className={styles.grid}>{records.slice(0, shown).map(r => section === 'endings' ? <details className="panel" key={r.id}><summary>{r.name} · {r.source}</summary><p className={styles.text}>{plain(r.text)}</p></details> : render(r))}</div>
        {!records.length && <p>No matching records in this theme.</p>}
        <LoadOnScroll shown={shown} total={records.length} onMore={() => setShown(n => n + 60)} />
      </>}
    </section>
  </main></>;
}
export const getStaticProps: GetStaticProps = async () => {
  const fs = await import('node:fs/promises');
  return { props: { themes: JSON.parse(await fs.readFile('public/_is/manifest.json', 'utf8')) } };
};
