import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { OperatorPreview, type OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
import XButton from '@/components/ui/XButton';
import type { FriendFile } from '@/lib/account/friendFile';
import type { FriendOperator, FriendSkin } from '@/lib/account/friendCatalogue';
import { matchesSearch } from '@/lib/search/searchNormalize';
import styles from './Friends.module.css';

export default function FriendCollection({ friend, operators, skins, view, onClose, own = false }: {
  friend: FriendFile; operators: FriendOperator[]; skins: FriendSkin[]; view: 'operators' | 'skins'; onClose: () => void; own?: boolean;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('all');
  const [sort, setSort] = useState('built');
  const [preview, setPreview] = useState<OperatorPreviewItem | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const [skin, setSkin] = useState<FriendSkin | null>(null);
  const collection = useRef<HTMLDivElement>(null);
  const skinTrigger = useRef<HTMLButtonElement | null>(null);
  const skinScroll = useRef(0);
  const skinBack = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (skin) skinBack.current?.focus();
    else if (skinTrigger.current) {
      if (collection.current) collection.current.scrollTop = skinScroll.current;
      // The gallery was remounted: resolve the same skin by its stable game id.
      collection.current?.querySelector<HTMLButtonElement>(`[data-skin-id="${skinTrigger.current.dataset.skinId}"]`)?.focus({preventScroll:true});
    }
  }, [skin]);
  const known = useMemo(() => new Map(operators.map(op => [op.name, op])), [operators]);
  const owned = useMemo(() => [...new Set(friend.account.operators)].map(name => known.get(name) ?? {
    name, rarity: 0, icon: '/essential-icons/Arkpedia.webp', className: null, skills: 0, modules: [],
  }).filter(op => matchesSearch(op.name, query) && (rarity === 'all' || String(op.rarity) === rarity))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'rarity' ? b.rarity - a.rarity || a.name.localeCompare(b.name)
      : (friend.roster[b.name]?.elite ?? -1) - (friend.roster[a.name]?.elite ?? -1)
        || (friend.roster[b.name]?.level ?? -1) - (friend.roster[a.name]?.level ?? -1) || b.rarity - a.rarity || a.name.localeCompare(b.name)),
    [friend, known, query, rarity, sort]);
  const outfits = useMemo(() => {
    const catalogue = new Map(skins.map(outfit => [outfit.id, outfit]));
    return [...new Set(friend.account.skins)].map(id => catalogue.get(id) ?? { id, name: id, model: null, series: '', image: null })
      .filter(outfit => matchesSearch(`${outfit.name} ${outfit.model ?? ''} ${outfit.series}`, query))
      .sort((a, b) => (a.model ?? '').localeCompare(b.model ?? '') || a.name.localeCompare(b.name));
  }, [friend.account.skins, skins, query]);
  useEffect(() => {
    const element = modal.current!;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; focus?.focus({ preventScroll: true }); };
  }, []);
  const heading = `${friend.account.doctor ?? 'Friend'} · ${view === 'operators' ? 'Operators' : 'Skins'}`;
  return <>
    <dialog ref={modal} className={styles.dialog} aria-label={heading} onCancel={event => {
      event.preventDefault(); if (skin) setSkin(null); else onClose();
    }} onClick={event => {
      if (event.target !== modal.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
      <div className={styles.dialogHead}><h2 className="entity-title">{heading}</h2><XButton onClick={onClose} label={`Close ${own ? 'your' : "friend's"} ${view}`} /></div>
      {skin ? <div className={styles.skinDetail}>
        <button ref={skinBack} type="button" className="btn" onClick={() => setSkin(null)}>← Skins</button>
        <h3>{skin.model} · {skin.name}</h3>
        {skin.image && <ContentImg src={skin.image} alt={`${skin.model} — ${skin.name}`} />}
      </div> : <>
        <div className={styles.filters}>
          <SearchInput label={`Search ${own ? 'your' : 'friend'} ${view}`} placeholder={view === 'operators' ? 'Search operators…' : 'Search skins…'} value={query} onChange={setQuery} />
          {view === 'operators' && <>
            <StyledSelect label="Operator rarity" value={rarity} onChange={setRarity} options={[{value:'all',label:'All rarities'}, ...[6,5,4,3,2,1].map(n=>({value:String(n),label:`${n}★`}))]} />
            <StyledSelect label="Sort operators" value={sort} onChange={setSort} options={[{value:'built',label:'Built level'},{value:'rarity',label:'Rarity'},{value:'name',label:'Name'}]} />
          </>}
        </div>
        <div ref={collection} className={styles.collection} tabIndex={0} aria-label={`${own ? 'Your' : 'Friend'} ${view === 'operators' ? 'operator' : 'skin'} collection`}>
          {view === 'operators' ? <div className={styles.operatorGrid}>
            {owned.map(op => {
              const build = friend.roster[op.name];
              const summary = build ? `E${build.elite} Level ${build.level}, skill rank ${build.skillLevel}` : 'Build level not recorded';
              return <button key={op.name} type="button" className={`btn-bare ${styles.operator}`} disabled={op.rarity < 1 || op.rarity > 6} aria-haspopup="dialog" aria-label={`${op.name}: ${summary}. Open operator preview`}
                onClick={() => setPreview({name:op.name,rarity:op.rarity,icon:op.icon})}>
                <span className={styles.buildMarks}>
                  {build ? <><ContentImg src={`/profile-ui/elite_${build.elite}.webp`} alt={`Elite ${build.elite}`} /><span>LV <b>{build.level}</b></span>
                    {build.potential != null && <ContentImg src={`/profile-ui/potential_${build.potential - 1}_small.webp`} alt={`Potential ${build.potential}`} />}</> : <span>Build unknown</span>}
                </span>
                <span className={styles.portrait} data-rarity={op.rarity}><ContentImg src={op.icon} alt="" /></span>
                <span className={styles.operatorName}>{op.name}</span>
                <span className={styles.skills}>
                  {build && Array.from({length:Math.max(op.skills, ...Object.keys(build.masteries).map(i=>Number(i)+1), 0)}, (_, i) => <span key={i} title={`Skill ${i + 1}: ${build.masteries[i] ? `Mastery ${build.masteries[i]}` : `Rank ${build.skillLevel}`}`}>
                    <small>S{i+1}</small>{build.masteries[i] ? <ContentImg src={`/essential-icons/M${build.masteries[i]}.webp`} alt={`Skill ${i+1} Mastery ${build.masteries[i]}`} /> : <b>{build.skillLevel}</b>}
                  </span>)}
                </span>
                <span className={styles.modules}>{build && Object.entries(build.modules ?? {}).map(([index, stage]) => {
                  const mod = op.modules.find(module => module.index === Number(index));
                  return <span key={index} title={`${mod?.label ?? `Module ${Number(index)+1}`} Stage ${stage+1}`}>
                    {mod?.mark && <ContentImg src={mod.mark} alt={mod.label} />}<small>{mod?.label.split('-').pop() ?? `Mod ${Number(index)+1}`}<b>{stage+1}</b></small>
                  </span>;
                })}</span>
              </button>;
            })}
            {!owned.length && <p className="hint">No operators match.</p>}
          </div> : <div className={styles.skinGrid}>
            {outfits.map(outfit => <button type="button" key={outfit.id} data-skin-id={outfit.id} className={`btn-bare ${styles.skin}`} onClick={event => {
              skinTrigger.current = event.currentTarget; skinScroll.current = collection.current?.scrollTop ?? 0; setSkin(outfit);
            }} disabled={!outfit.image}>
              <span>{outfit.image ? <ContentImg src={outfit.image} alt="" /> : <small>Artwork unavailable</small>}</span>
              <b>{outfit.model ?? 'Unknown operator'}</b><span>{outfit.name}</span>
            </button>)}
            {!outfits.length && <p className="hint">No skins match.</p>}
          </div>}
        </div>
      </>}
    </dialog>
    {preview && <OperatorPreview item={preview} onClose={closePreview} nativeModal />}
  </>;
}
