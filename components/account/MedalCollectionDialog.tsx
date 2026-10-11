import { useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';
import ImportDialog from './ImportDialog';
import { ContentImg } from '@/components/content/ContentImage';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { ContentContext, useContentUrl } from '@/lib/content/context';
import { loadMedalCatalogue } from '@/lib/account/medalCatalogue';
import { medalSetProgress, obtainedMedal, type Medal, type MedalCatalogue, type MedalSet } from '@/lib/account/medals';
import type { AccountRecord } from '@/lib/account/accountStore';
import styles from './MedalCollectionDialog.module.css';

function Icon({ medal, owned }: { medal: Medal; owned: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [medal.icon]);
  return <span className={`${styles.icon}${owned ? '' : ` ${styles.unowned}`}`}>
    {medal.icon && !broken ? <ContentImg src={medal.icon} alt="" onError={() => setBroken(true)} /> : <span aria-label="Medal artwork unavailable">◇</span>}
  </span>;
}
/** A newly introduced catalogue may fall back from an older content release. Keep
 * its explicitly pinned background at the commit that actually contains the file. */
function Background({ src, name, onError }: { src: string; name: string; onError: () => void }) {
  const release = useContext(ContentContext);
  const pin = src.match(/^https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-image-assets\/([a-f0-9]{40})\//)?.[1];
  const artRelease = pin ? { release: release?.release ?? 'medal-art', baseUrl: release?.baseUrl ?? '', assets: { ...release?.assets, 'arkpedia-image-assets': pin } } : release;
  return <ContentContext.Provider value={artRelease}><ContentImg className={styles.background} src={src} alt={`${name} official background`} onError={onError} /></ContentContext.Provider>;
}
/** Coordinates use the game's bottom-left origin and the icon's original sprite crop. */
function SetArtwork({ set, medals, owned, fullCollection }: { set: MedalSet; medals: ReadonlyMap<string, Medal>; owned: ReadonlyMap<string, { id: string; obtainedAt: string | null }>; fullCollection: boolean }) {
  const [broken, setBroken] = useState(false);
  const layout = set.layout;
  return <div className={layout ? styles.canvas : styles.cluster} style={layout ? { aspectRatio: `${layout.width} / ${layout.height}` } : undefined}>
    {set.background && layout && !broken && <Background src={set.background} name={set.name} onError={() => setBroken(true)} />}
    {set.medals.map(id => {
      const base = medals.get(id)!;
      const medal = base.advanced && owned.has(base.advanced) ? medals.get(base.advanced) ?? base : base;
      const position = layout?.positions.find(p => p.id === id);
      const size = medal.size ?? base.size;
      const height = size?.height ?? (base.rarity.startsWith('T3') ? 249 : base.rarity.startsWith('T2') ? 180 : 114);
      const width = size?.width ?? height * 0.88;
      const style = layout && position ? { left: `${(position.x + (size?.x ?? 0)) / layout.width * 100}%`, top: `${(1 - (position.y + (size?.y ?? 0)) / layout.height) * 100}%`, width: `${width / layout.width * 100}%`, height: `${height / layout.height * 100}%` } : undefined;
      return <span className={layout ? styles.placed : undefined} key={id} data-medal-id={id} style={style} title={`${base.name} · ${obtainedMedal(base, owned) ? 'Obtained' : fullCollection ? 'Unobtained' : 'Not in this import'}`}><Icon medal={medal} owned={!!obtainedMedal(base, owned)} /></span>;
    })}
  </div>;
}
const day = (date: string) => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function MedalCollectionDialog({ account, onClose }: { account: AccountRecord; onClose: () => void }) {
  const url = useContentUrl();
  const source = url('/medal-catalogue.json');
  const [catalogue, setCatalogue] = useState<MedalCatalogue | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<'sets' | 'list'>('sets');
  const [filter, setFilter] = useState('obtained');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [setId, setSetId] = useState<string | null>(null);
  const [shown, setShown] = useState(40);
  const fullCollection = account.profile?.medalCollection !== undefined;
  const owned = useMemo(() => new Map((account.profile?.medalCollection ?? account.profile?.medals?.map(m => ({ id: m.id, obtainedAt: null })) ?? []).map(m => [m.id, m])), [account.profile]);
  useEffect(() => {
    let active = true;
    setError(''); setCatalogue(null);
    loadMedalCatalogue(source).then(data => { if (active) setCatalogue(data); }, () => { if (active) setError('Medal details could not be loaded. Please try again.'); });
    return () => { active = false; };
  }, [source, retry]);
  useEffect(() => { setShown(40); }, [view, filter, category, search, setId]);
  const medalMap = useMemo(() => new Map(catalogue?.medals.map(m => [m.id, m]) ?? []), [catalogue]);
  const selectedSet = catalogue?.sets.find(s => s.id === setId);
  const query = search.trim().toLocaleLowerCase();
  const matches = (name: string, type: string, count: number) => (category === 'all' || category === type)
    && (!query || name.toLocaleLowerCase().includes(query)) && (filter === 'all' || (filter === 'obtained' ? count > 0 : count === 0));
  const sets = (catalogue?.sets ?? []).map(set => ({ set, progress: medalSetProgress(set, medalMap, owned) }))
    .filter(({ set, progress }) => matches(set.name, set.type, progress.count))
    .sort((a, b) => (b.progress.completedAt ?? '').localeCompare(a.progress.completedAt ?? ''));
  const unknown: Medal[] = [...owned.keys()].filter(id => !medalMap.has(id)).map(id => ({ id, name: id, type: 'unknown', rarity: '', description: 'This medal is not yet in the current catalogue.', requirement: '', icon: null, advanced: null, origin: null }));
  const medals = selectedSet ? selectedSet.medals.flatMap(id => medalMap.get(id) ? [medalMap.get(id)!] : [])
    : [...(catalogue?.medals ?? []), ...unknown].filter(m => matches(m.name, m.type, obtainedMedal(m, owned) ? 1 : 0));
  const switchView = (next: 'sets' | 'list') => { setView(next); setSetId(null); };

  return <ImportDialog title={`${account.doctor ?? 'Doctor'} · Medals`} onClose={onClose} className={styles.dialog}>
    <div className={styles.controls}>
      <div className={styles.switch} aria-label="Medal display">
        <button type="button" className="btn ghost" aria-pressed={view === 'sets'} onClick={() => switchView('sets')}>Medal sets</button>
        <button type="button" className="btn ghost" aria-pressed={view === 'list'} onClick={() => switchView('list')}>Full medal list</button>
      </div>
      <p className={styles.total}>{owned.size} medals obtained</p>
    </div>
    {!fullCollection && <p className={styles.notice}>This older import only contains displayed medals. Re-import this account, or ask your friend for a new export, to see the full collection.</p>}
    {!selectedSet && <div className={styles.filters}>
      <input type="search" aria-label="Search medals" placeholder={view === 'sets' ? 'Search medal sets…' : 'Search medals…'} value={search} onChange={e => setSearch(e.target.value)} />
      <StyledSelect label="Medal category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...(catalogue?.categories.map(c => ({ value: c.id, label: c.name })) ?? [])]} />
      <StyledSelect label="Medal ownership" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'obtained', label: 'Obtained' }, { value: 'unobtained', label: 'Unobtained', disabled: !fullCollection }]} />
    </div>}
    {error ? <div role="alert"><p>{error}</p><button type="button" className="btn ghost" onClick={() => setRetry(n => n + 1)}>Try again</button></div>
      : !catalogue ? <p role="status">Loading medal collection…</p>
      : view === 'sets' ? <>
        <div className={styles.sets}>{sets.slice(0, shown).map(({ set, progress }) => <article className={styles.set} key={set.id}>
          <div className={styles.setArt} style={{ '--medal-set-color': set.color } as CSSProperties}>
            <span className={styles.completion}>{progress.complete ? '✓ Completed' : `${progress.count} / ${set.medals.length} obtained`}{progress.completedAt && <small>{day(progress.completedAt)}</small>}</span>
            <SetArtwork set={set} medals={medalMap} owned={owned} fullCollection={fullCollection} />
          </div>
          <div className={styles.setInfo}><h3>{set.name}</h3><p>{set.description}</p><button type="button" className="btn ghost" onClick={() => { setSetId(set.id); setView('list'); }}>Medal list</button></div>
        </article>)}</div>
        {!sets.length && <p role="status">{owned.size && !fullCollection ? 'No sets match the displayed medals in this import. Try the full medal list.' : 'No medal sets match.'}</p>}
        <LoadOnScroll shown={shown} total={sets.length} onMore={() => setShown(n => n + 40)} />
      </> : <>
        {selectedSet && <div className={styles.setHeading}><button type="button" className="btn ghost" onClick={() => switchView('sets')}>← Back to sets</button><h3>{selectedSet.name}</h3></div>}
        <div className={styles.list}>{medals.slice(0, shown).map(medal => {
          const got = obtainedMedal(medal, owned);
          const trimmed = !!medal.advanced && owned.has(medal.advanced);
          const art = trimmed ? medalMap.get(medal.advanced!) ?? medal : medal;
          return <article className={`${styles.medal}${got ? '' : ` ${styles.missing}`}`} key={medal.id}>
            <Icon medal={art} owned={!!got} />
            <div><h3>{medal.name}</h3><p>{medal.description}</p>{medal.requirement && <small>{medal.requirement}</small>}</div>
            <span className={styles.status}>{got ? `✓ Obtained${trimmed || medal.origin ? ' · Trimmed' : ''}` : fullCollection ? 'Unobtained' : 'Not in this import'}{got?.obtainedAt && <small>{day(got.obtainedAt)}</small>}</span>
          </article>;
        })}</div>
        {!medals.length && <p role="status">No medals match.</p>}
        <LoadOnScroll shown={shown} total={medals.length} onMore={() => setShown(n => n + 40)} />
      </>}
  </ImportDialog>;
}
