import {useMemo,useRef,useState} from 'react';
import type {GetStaticProps} from 'next';
import Link from 'next/link';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import {matchesSearch} from '@/lib/search/searchNormalize';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import Tabs,{tabPanelProps} from '@/components/ui/Tabs';
import ImportDialog from '@/components/account/ImportDialog';
import {useSwitchHold} from '@/components/ui/useSwitchHold';
import SkinRatingResults from '@/components/community/SkinRatingResults';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import {useCloudSync} from '@/lib/cloud-account/SyncProvider';
import {useQueryRecord} from '@/lib/hooks/useQueryState';
import {withContentPage} from '@/lib/content/server';
import type {PollSkin} from '@/lib/polls/skin-poll';
import {useSkinRatings} from '@/lib/polls/useSkinRatings';
import styles from '@/components/community/SkinRatings.module.css';

interface Props {skins:PollSkin[]}
const defaults={q:'',view:'vote',rated:'all',skin:'',group:'skins',display:'podium',resultsQ:'',sort:'mean',order:'desc',detail:''};
const options=Array.from({length:10},(_,i)=>({value:i+1,label:String(i+1),ariaLabel:`${i+1} out of 10`}));
export default function FavouriteSkins(props:Props){
  const {remote,status}=useCloudSync();
  return <SkinRatings key={remote?.user.id??'guest'} {...props} owner={remote?.user.id??null} accountLoading={status==='loading'}/>;
}
function SkinRatings({skins,owner,accountLoading}:Props&{owner:string|null;accountLoading:boolean}){
  const toolbar=useRef<HTMLDivElement>(null);
  const [filters,set]=useQueryRecord(defaults),[shown,setShown]=useState(30);
  const {result,error,saved,draft,failures,pending,load,save,reloadSaved,ready}=useSkinRatings(owner),hold=useSwitchHold('skin-ratings');
  const catalogue=useMemo(()=>new Map(skins.map(skin=>[skin.id,skin])),[skins]);
  const selected=catalogue.get(filters.skin),results=filters.view==='results';
  const filtered=skins.filter(skin=>[skin.operator,skin.name,...skin.aliases].some(value=>matchesSearch(value,filters.q))&&(!owner||filters.rated==='all'||(filters.rated==='rated'?saved.get(skin.id)?.rating!=null:saved.get(skin.id)?.rating==null)));
  const rated=[...saved.values()].filter(row=>row.rating!==null).length;
  const change=(next:Partial<typeof defaults>)=>{hold.capture();setShown(30);set(next);};
  const vote=(skin:string,rating:number|null)=>{hold.capture();void save(skin,rating);};
  const displayRating=(id:string)=>Object.hasOwn(draft,id)?draft[id]:saved.get(id)?.rating??null;
  const navigate=(step:number)=>{
    const index=filtered.findIndex(skin=>skin.id===selected?.id),next=index<0?0:index+step;
    if(next>=0&&next<filtered.length)set({skin:filtered[next].id});
  };
  return <>
    <PageMeta title="Arkpedia Drip Awards — test poll" description="Rate Arknights skins from 1 to 10, save your progress and explore the community ranking." path="/polls/favourite-skins"/>
    <PageHeader slim eyebrow="Rhodes Island // Community Polls" title="Arkpedia Drip Awards" sub="A very serious poll, for serious poll testing"/>
    <main>
      <Tabs label="Poll sections" id="skin-poll" value={results?'results':'vote'} onChange={view=>change({view,skin:''})} options={[{value:'vote',label:'Rate skins'},{value:'results',label:'Live ranking'}]}/>
      <div ref={hold.ref} style={hold.style}>
        <section {...tabPanelProps('skin-poll','vote')} hidden={results} className={styles.ratePanel}>
          <div className={styles.intro}><p>Rate any outfit from 1 to 10. Each rating saves automatically, so you can come back whenever you like.</p>
            {!owner&&!accountLoading&&<Link className="ghost btn-sm" href="?settings=profile">Sign in to Arkpedia to rate skins</Link>}
          </div>
          <div className={styles.toolbar} ref={toolbar}><SearchInput label="Search by operator or skin name" placeholder="Search operator or skin name…" value={filters.q} onChange={q=>change({q})}/>
            {owner&&<SegmentedControl label="Show skins" value={filters.rated} onChange={rated=>change({rated})} options={[{value:'all',label:'All'},{value:'unrated',label:'Unrated'},{value:'rated',label:'Rated'}]}/>}</div>
          <div className={styles.progress}><span className="hint">{filtered.length.toLocaleString('en-US')} skins</span><span className="hint" role="status">{accountLoading?'Checking sign-in…':owner?!ready?'Loading saved ratings…':`${rated} / ${skins.length} rated${pending.size?' · Saving…':Object.keys(failures).length?' · Some ratings need attention':' · Saved to your account'}`:'Rankings are public · Sign in to save your ratings'}</span></div>
          {error&&<p className="notice notice-danger" role="status">{error} <button className="ghost btn-sm" onClick={()=>void load().catch(()=>{})}>Retry</button></p>}
          <div className={styles.catalogue}>{filtered.slice(0,shown).map(skin=><button type="button" key={skin.id} className={`pick-card pick-card-picture ${styles.skin}`} onClick={()=>set({skin:skin.id})} aria-haspopup="dialog" aria-label={`Rate ${skin.name} by ${skin.operator}`}>
            <div className={styles.art}>{skin.image&&<ResponsiveSkinArtwork src={skin.image} alt="" width={220} height={220} sizes="(max-width: 720px) 45vw, 240px"/>}{!skin.image&&<span className={`art-placeholder ${styles.missing}`}>Artwork unavailable</span>}</div>
            <span className={styles.skinCopy}><strong>{skin.name}</strong><small>{skin.operator}</small><span className={styles.ownRating}>{pending.has(skin.id)?'Saving…':failures[skin.id]?'Not saved':saved.get(skin.id)?.rating!=null?`Your rating ${saved.get(skin.id)!.rating}/10`:'Rate this skin'}</span></span>
          </button>)}</div>
          {!filtered.length&&<p className="notice" role="status">{filters.rated==='unrated'&&!filters.q?'You’ve rated every skin in this view. Come back when there are more!':'No skins match these filters.'}</p>}
          <LoadOnScroll shown={Math.min(shown,filtered.length)} total={filtered.length} onMore={()=>setShown(n=>n+30)}/>
        </section>
        <section {...tabPanelProps('skin-poll','results')} hidden={!results} className={styles.results}>
          {results&&<SkinRatingResults skins={skins} result={result} error={error} onRetry={()=>void load().catch(()=>{})} filters={filters} onChange={patch=>{hold.capture();set(patch);}}/>}
        </section>
      </div>
      {selected&&<ImportDialog title={selected.name} className={styles.ratingDialog} onClose={()=>{set({skin:''});if(!filtered.some(skin=>skin.id===selected.id))requestAnimationFrame(()=>toolbar.current?.querySelector('input')?.focus({preventScroll:true}));}}>
        <div className={styles.ratingLayout}><div className={styles.selectedArt}>{selected.image&&<ResponsiveSkinArtwork src={selected.image} alt={selected.name} width={400} height={400} sizes="(max-width: 720px) 80vw, 440px"/>}{!selected.image&&<span className={`art-placeholder ${styles.missing}`}>Artwork unavailable</span>}</div>
          <div className={styles.ratingEditor}><p className="entity-title entity-title-sm entity-title-name">{selected.operator}</p><div className={styles.ratingHeading}><p className={styles.ratingPrompt}>Your rating <strong>{displayRating(selected.id)===null?'—':`${displayRating(selected.id)}/10`}</strong></p>{owner&&<button className="ghost btn-sm" aria-label="Clear my rating" disabled={!ready||displayRating(selected.id)===null||pending.has(selected.id)||!!failures[selected.id]?.current} onClick={()=>vote(selected.id,null)}>Clear</button>}</div>
            {owner?<><SegmentedControl label="Rate this skin from 1 to 10" className={styles.ratingChoices} value={displayRating(selected.id)??0} onChange={rating=>vote(selected.id,rating)} options={options.map(option=>({...option,disabled:!ready||pending.has(selected.id)}))}/>
              <p className={`hint ${styles.ratingStatus}`} role="status">{pending.has(selected.id)?'Saving your rating…':!ready?'Loading saved rating…':failures[selected.id]?'Not saved':saved.has(selected.id)?saved.get(selected.id)!.rating===null?'Rating cleared.':'Saved to your account.':'Choose a rating.'}</p>
              {failures[selected.id]&&<div className="notice notice-danger" role="status"><p>{failures[selected.id].message}</p>{failures[selected.id].profile&&<Link className="ghost btn-sm" href="?settings=profile">Complete your profile</Link>}{failures[selected.id].current?<button className="ghost btn-sm" onClick={()=>reloadSaved(selected.id)}>Reload saved rating</button>:<button className="ghost btn-sm" onClick={()=>vote(selected.id,displayRating(selected.id))}>Retry saving</button>}</div>}
            </>:accountLoading?<p role="status">Checking sign-in…</p>:<><p className="hint">Sign in to save your ratings and continue on another visit.</p><Link className="primary btn-sm" href="?settings=profile">Sign in to Arkpedia to rate skins</Link></>}
            <div className={styles.navigation}><button className="ghost btn-sm" disabled={filtered.findIndex(skin=>skin.id===selected.id)<=0} onClick={()=>navigate(-1)}>Previous skin</button><button className="ghost btn-sm" disabled={!filtered.length||filtered.findIndex(skin=>skin.id===selected.id)===filtered.length-1} onClick={()=>navigate(1)}>Next skin</button></div>
          </div>
        </div>
      </ImportDialog>}
    </main>
  </>;
}
export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/polls/favourite-skins',async()=>{
  const {default:catalogue}=await import('@/data/community-poll-catalogue.json');
  return {props:{skins:catalogue.skins}};
},{bundledWhenUnpublished:true});
