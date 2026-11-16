import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { fetchAsset } from '@/lib/assets/assetRetry';
import Image, { ApplicationImage, ApplicationArt } from '@/components/content/ContentImage';
import gameArt from '@/config/is-game-art.json';
import ModeMark from '@/components/stages/ModeMark';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import SearchInput from '@/components/ui/SearchInput';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { matchesSearch } from '@/lib/search/searchNormalize';
import type { IsTopic, IsRecord } from '@/lib/gamemodes/integratedStrategies';
import ScrollRow from '@/components/ui/ScrollRow';
import SegmentedControl from '@/components/ui/SegmentedControl';
import RecordDialog from '@/components/ui/RecordDialog';
import endingRequirements from '@/config/is-ending-requirements.json';
import styles from './integrated-strategies.module.css';

/** Reader-facing text added by the redesign, kept together for the planned site-language layer. */
const T = {
  themes: 'Integrated Strategies themes',
  number: (n: number) => `Integrated Strategies #${n}`,
  categories: { collectibles: 'Collectibles', coins: 'Coins', vouchers: 'Vouchers', other: 'Other' } as Record<string, string>,
  itemCategory: 'Item category',
  ending: (n: number) => `Ending ${n}`,
  requirements: 'Ending Requirements',
  needs: 'Before this run',
  avoid: 'Do not pick up',
  steps: 'In one run',
  noRequirements: 'How to reach this ending is not recorded yet.',
  requirementsSource: 'Summarised from the community wiki; the game data does not record it.',
  story: 'Ending text (spoiler)',
  randomEffects: (n: number) => `${n} possible effects`,
  randomEffectsTitle: 'Possible random effects',
  upgraded: 'Upgraded',
  unlock: 'Unlock',
  cnOnly: 'CN',
  dataNote: (source: string) => `${source} game data. CN records fill gaps until Global has them, so unreleased content can appear.`,
};
/** Global numbering: Ceobe's Fungimist counts as #1, so the game's rogue_1 is #2. */
const art = (path: string) => ({ ...gameArt, repository: 'arkpedia-image-assets' as const, path });
const themeNumber = (id: string) => Number(id.split('_')[1]) + 1;
const DEFAULT_THEME = 'rogue_5';
const REQUIREMENTS = endingRequirements.endings as Record<string, { needs?: string; avoid?: string[]; steps: string[] }>;


type Theme = Omit<IsTopic, 'sections'> & { counts: Record<string, number> };
const SECTIONS = ['overview', 'stages', 'items', 'squads', 'encounters', 'mechanics', 'endings'] as const;
// Public catalogue and revealed batches survive a detail-page round trip in this tab.
const topicCache = new Map<string, IsTopic>();
const revealed = new Map<string, number>();
const LABELS = ['Overview', 'Stages', 'Items', 'Squads', 'Encounters', 'Special mechanics', 'Endings'];
/** Game markup remains text: no injected HTML or internal colour tags. */
const plain = (value: string) => value.replace(/<\/>|<\/?(?:@[^>]*|color(?:=[^>]*)?|size(?:=[^>]*)?|b|i)>/gi, '').replace(/\\n/g, '\n');
export default function IntegratedStrategies({ themes }: { themes: Theme[] }) {
  const router = useRouter();
  const initial = (key: string, fallback: string) => typeof router.query[key] === 'string' ? router.query[key] as string : fallback;
  const [themeId, setTheme] = useQueryState('theme', initial('theme', themes.find(t => t.id === DEFAULT_THEME)?.id ?? themes.find(t => t.source === 'Global')?.id ?? themes[0]?.id ?? ''));
  const [tab, setTab] = useQueryState('tab', initial('tab', 'overview'));
  const [query, setQuery] = useQueryState('q', initial('q', ''));
  const [kind, setKind] = useQueryState('kind', initial('kind', 'collectibles'));
  const [loadedTopic, setTopic] = useState<IsTopic | null>(() => topicCache.get(themeId) ?? null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState({ key: '', count: 60 });
  const [open, setOpen] = useState<IsRecord | null>(null);
  const ordered = useMemo(() => [...themes].sort((a, b) => themeNumber(a.id) - themeNumber(b.id)), [themes]);
  const hold = useSwitchHold('is-reference');
  const choose = (set: (value: string) => void) => (value: string) => { hold.capture(); set(value); };
  const theme = themes.find(t => t.id === themeId) ?? themes[0];
  const topic = loadedTopic?.id === theme.id ? loadedTopic : topicCache.get(theme.id) ?? null;
  const section = SECTIONS.includes(tab as typeof SECTIONS[number]) ? tab : 'overview';
  useEffect(() => {
    const controller = new AbortController(); setError(false);
    const cached = topicCache.get(theme.id);
    if (cached) { setTopic(cached); return; }
    setTopic(null);
    fetchAsset(`/_is/${theme.id}.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('catalogue'); return response.json(); }).then((value: IsTopic) => { topicCache.set(theme.id, value); setTopic(value); }).catch(e => { if (e.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [theme.id, attempt]);
  const listKey = JSON.stringify([theme.id, section, query, kind]);
  const shown = limit.key === listKey ? limit.count : revealed.get(listKey) ?? 60;
  const more = () => {
    const count = shown + 60;
    revealed.delete(listKey); revealed.set(listKey, count);
    if (revealed.size > 50) revealed.delete(revealed.keys().next().value!);
    setLimit({ key: listKey, count });
  };
  const categories = useMemo(() => Object.keys(T.categories).filter(value => topic?.sections.items.some(r => r.category === value)), [topic]);
  const category = categories.includes(kind) ? kind : categories[0] ?? 'collectibles';
  const records = useMemo(() => (topic?.sections[section] ?? []).filter(r => (section !== 'items' || r.category === category) && (section === 'overview' || matchesSearch(`${r.name} ${r.text}`, query))), [topic, section, query, category]);
  const glyph = (path: string) => <ApplicationArt asset={art(path)} className={`mode-mark ${styles.nodeIcon}`} aria-hidden="true" />;
  const picture = (r: IsRecord) => !r.image ? null : r.imageKind === 'map'
    ? <Image src={r.image} className={styles.mapArt} alt="" width={480} height={240} />
    : r.imageKind === 'mask' ? glyph(r.image)
    : <ApplicationImage asset={art(r.image)} className={styles.itemArt} alt="" width={96} height={96} />;
  const render = (r: IsRecord) => <article className="panel" key={r.id}>
    {r.imageKind === 'map' && picture(r)}
    <div className={r.image && r.imageKind !== 'map' ? styles.illustrated : undefined}>
      {r.imageKind !== 'map' && picture(r)}
      <div><div className={styles.recordHead}><h3>{r.href ? <Link href={r.href} prefetch={false} className={styles.titleLink}>{plain(r.name)}<span aria-hidden="true"> ↗</span></Link> : plain(r.name)}{r.upgraded && <span className={styles.tag}>{T.upgraded}</span>}</h3><span className="hint">{r.source} data</span></div><p className={styles.text}>{plain(r.text) || 'No description in the published game data.'}</p>{r.unlock && section === 'squads' && <p className={styles.unlock}><b>{T.unlock}</b> {plain(r.unlock)}</p>}{!!r.variants?.length && <button type="button" className="btn btn-sm" onClick={() => setOpen(r)}>{T.randomEffects(r.variants.length)}</button>}</div>
    </div>
  </article>;
  return <><PageMeta title="Integrated Strategies" description="Themes, stages, collectibles and special mechanics from the game data." path="/game-modes/integrated-strategies" /><PageHeader title="Integrated Strategies" eyebrow={<><ModeMark name="integrated-strategies.svg" className="head-mark" />Rhodes Island // Game modes</>} sub="Explore each theme’s stages, collectibles, squads and special mechanics." /><main className={styles.page}>
    <Link className={`btn ${styles.back}`} href="/game-modes">← Game Modes</Link>
    <section className={styles.themeHero} aria-label={theme.name}>
      <div className={styles.themeArt} key={theme.id}>{theme.keyArt?.art.map(path => <ApplicationImage key={path} asset={art(path)} alt="" width={theme.keyArt!.art.length > 1 ? 780 : 1560} height={960} sizes="(max-width: 720px) 100vw, 1300px" />)}{theme.keyArt?.figure && <ApplicationImage asset={art(theme.keyArt.figure)} alt="" width={788} height={522} className={styles.themeFigure} />}</div>
      <div className={styles.themeCopy}>
        <span className={styles.kicker}>{T.number(themeNumber(theme.id))}{theme.source === 'CN' && <span className={styles.cn}>{T.cnOnly}</span>}</span>
        {theme.keyArt?.logo ? <h2 className={styles.logoHeading}><ApplicationImage asset={art(theme.keyArt.logo)} alt={theme.name} width={450} height={250} className={styles.themeLogo} /></h2> : <h2 className={styles.themeName}>{theme.name}</h2>}
        <p className={styles.text}>{plain(theme.intro)}</p>
        <p className={styles.themeNote}>{T.dataNote(theme.source)} <a className={styles.textLink} href="https://github.com/Kengxxiao/ArknightsGameData" target="_blank" rel="noopener noreferrer">CN source ↗</a> · <a className={styles.textLink} href="https://github.com/PuppiizSunniiz/ArknightsGameData_YoStar" target="_blank" rel="noopener noreferrer">Global source ↗</a></p>
      </div>
    </section>
    <ScrollRow label={T.themes} className={styles.rail}>
      {ordered.map(t => <button type="button" key={t.id} className={`btn-bare ${styles.themeCard}`} aria-pressed={t.id === theme.id} onClick={() => choose(setTheme)(t.id)}>
        <span className={styles.themeThumb}>{t.keyArt?.art.map(path => <ApplicationImage key={path} asset={art(path)} alt="" width={t.keyArt!.art.length > 1 ? 195 : 390} height={240} sizes="240px" />)}</span>
        <span className={styles.kicker}>{T.number(themeNumber(t.id))}{t.source === 'CN' && <span className={styles.cn}>{T.cnOnly}</span>}</span>
        <strong>{t.name}</strong>
      </button>)}
    </ScrollRow>
    <Tabs id="is-reference" label="Integrated Strategies sections" value={section} onChange={choose(setTab)} options={SECTIONS.map((value, i) => ({ value, label: <>{theme.tabIcons?.[value] && glyph(theme.tabIcons[value])}{LABELS[i]}</>, count: theme.counts[value] }))} />
    <div ref={hold.ref} style={hold.style}><section {...tabPanelProps('is-reference', section)}>
      {section !== 'overview' && <div className={styles.controls}><SearchInput label={`Search ${section}`} value={query} onChange={choose(setQuery)} placeholder={`Search ${LABELS[SECTIONS.indexOf(section as typeof SECTIONS[number])].toLowerCase()}`} />{section === 'items' && categories.length > 1 && <SegmentedControl label={T.itemCategory} value={category} onChange={choose(setKind)} options={categories.map(value => ({ value, label: T.categories[value] }))} />}</div>}
      {error ? <div className="panel"><p role="alert">The theme could not be loaded.</p><button className="btn" onClick={() => setAttempt(n => n + 1)}>Try again</button></div> : !topic ? <p role="status">Loading theme…</p> : <>
        {section === 'overview' && !!topic.resources?.length && <div className={styles.resources} aria-label="Exploration resources">{topic.resources.map(r => <div className="panel" key={r.id}>{picture(r)}<span>{plain(r.name)}</span></div>)}</div>}
        {section === 'overview' && <p className="hint">Difficulty rules from the game. Choose a tab above for the full reference.</p>}
        <p className="hint" role="status">{records.length.toLocaleString()} {section === 'overview' ? 'difficulty settings' : section}</p>
        <div className={styles.grid}>{records.slice(0, shown).map(r => section === 'endings' ? <article className={styles.ending} key={r.id}>
          {r.cg ? <ApplicationImage asset={art(r.cg)} alt="" className={styles.endingArt} width={640} height={360} sizes="(max-width: 720px) 100vw, 420px" /> : <span className={styles.endingArt} aria-hidden="true" />}
          <div className={styles.endingBody}><span className={styles.kicker}>{T.ending(r.number ?? 0)}</span><h3>{plain(r.name)}</h3><button type="button" className="btn btn-sm" onClick={() => setOpen(r)}>{T.requirements}</button></div>
        </article> : render(r))}</div>
        {!records.length && <p>No matching records in this theme.</p>}
        <LoadOnScroll shown={shown} total={records.length} onMore={more} />
      </>}
    </section></div>
    {open && <RecordDialog label={open.variants ? T.randomEffectsTitle : T.requirements} onClose={() => setOpen(null)} className={styles.dialog}>
      {open.variants ? <>
        <h2>{plain(open.name)}</h2><p className="hint">{T.randomEffectsTitle}</p>
        <ol className={styles.steps}>{open.variants.map((v, i) => <li key={i}>{plain(v.text)}</li>)}</ol>
      </> : <>
        <span className={styles.kicker}>{T.ending(open.number ?? 0)}</span><h2>{plain(open.name)}</h2>
        {open.cg && <ApplicationImage asset={art(open.cg)} alt="" className={styles.endingArt} width={1280} height={720} sizes="(max-width: 720px) 100vw, 640px" />}
        {REQUIREMENTS[open.id] ? <>
          {REQUIREMENTS[open.id].needs && <p><b>{T.needs}:</b> {REQUIREMENTS[open.id].needs}</p>}
          {!!REQUIREMENTS[open.id].avoid?.length && <p><b>{T.avoid}:</b> {REQUIREMENTS[open.id].avoid!.join(', ')}</p>}
          <p className={styles.kicker}>{T.steps}</p>
          <ol className={styles.steps}>{REQUIREMENTS[open.id].steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
          <p className="hint">{T.requirementsSource} <a className={styles.textLink} href={endingRequirements.source} target="_blank" rel="noopener noreferrer">Wiki ↗</a></p>
        </> : <p>{T.noRequirements}</p>}
        {open.unlock && <p className={styles.unlock}>{plain(open.unlock)}</p>}
        <details><summary>{T.story}</summary><p className={styles.text}>{plain(open.text)}</p></details>
      </>}
    </RecordDialog>}
  </main></>;
}
export const getStaticProps: GetStaticProps = async () => {
  const { readPublicJson } = await import('@/lib/content/shippedTable');
  return { props: { themes: await readPublicJson('_is/manifest.json') } };
};
