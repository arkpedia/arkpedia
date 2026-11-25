import PollTiming from '@/components/community/PollTiming';
import PollGate from '@/components/community/PollGate';
import type { PublicPoll } from '@/lib/polls/settings';
import {useEffect,useMemo,useRef,useState} from 'react';
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
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import {useCloudSync} from '@/lib/cloud-account/SyncProvider';
import {useQueryRecord} from '@/lib/hooks/useQueryState';
import {withContentPage} from '@/lib/content/server';
import type {PollSkin} from '@/lib/polls/skin-poll';
import {useSkinRatingResults,useSkinRatings} from '@/lib/polls/useSkinRatings';
import styles from '@/components/community/SkinRatings.module.css';

interface Props {skins:PollSkin[]}
const defaults={q:'',view:'vote',rated:'all',ratedOrder:'desc',tierSize:'full',skin:'',group:'skins',display:'podium',resultsQ:'',sort:'score',order:'desc',weighted:'on',detail:''};
const options=Array.from({length:10},(_,i)=>({value:i+1,label:String(i+1),ariaLabel:`${i+1} out of 10`}));
export default function FavouriteSkins(props:Props){
  const {remote,status}=useCloudSync();
  return <PollGate id="favourite-skins">{policy => <SkinRatings policy={policy} key={remote?.user.id??'guest'} {...props} owner={remote?.user.id??null} accountLoading={status==='loading'}/>}</PollGate>;
}
function SkinRatings({policy,skins,owner,accountLoading}:Props&{policy:PublicPoll;owner:string|null;accountLoading:boolean}){
  const toolbar=useRef<HTMLDivElement>(null);
  const tiers=useRef<HTMLDivElement>(null);
  const tierOpener=useRef<{id:string;button:HTMLButtonElement}|null>(null);
  const [filters,set]=useQueryRecord(defaults),[shown,setShown]=useState(30),[zooming,setZooming]=useState(false);
  const {error,saved,draft,failures,pending,load,save,reloadSaved,ready}=useSkinRatings(owner),hold=useSwitchHold('skin-ratings');
  const catalogue=useMemo(()=>new Map(skins.map(skin=>[skin.id,skin])),[skins]);
  const selected=catalogue.get(filters.skin),results=policy.results && (!policy.open || filters.view==='results');
  const ranking=useSkinRatingResults(results);
  const tierList=!!owner&&filters.rated==='rated';
  const ratedOrder=filters.ratedOrder==='asc'?'asc':'desc';
  const compact=filters.tierSize==='compact';
  const imageSizes=tierList&&compact?'(max-width: 720px) 72px, 88px':'(max-width: 720px) 45vw, 240px';
  useEffect(()=>setZooming(false),[selected?.id]);
  const filtered=useMemo(()=>{
    const matching=skins.filter(skin=>{
      if(![skin.operator,skin.name,...skin.aliases].some(value=>matchesSearch(value,filters.q)))return false;
      if(!owner||filters.rated==='all')return true;
      const hasRating=saved.get(skin.id)?.rating!=null;
      return filters.rated==='rated'?hasRating:!hasRating;
    });
    if(tierList)matching.sort((a,b)=>{
      const difference=(saved.get(a.id)?.rating??0)-(saved.get(b.id)?.rating??0);
      return ratedOrder==='asc'?difference:-difference;
    });
    return matching;
  },[skins,filters.q,filters.rated,owner,saved,tierList,ratedOrder]);
  const rated=[...saved.values()].filter(row=>row.rating!==null).length;
  const visible=filtered.slice(0,shown);
  const groups=new Map<number,PollSkin[]>();
  if(tierList)for(const skin of visible){
    const score=saved.get(skin.id)?.rating;
    if(score==null)continue;
    const group=groups.get(score);
    if(group)group.push(skin);
    else groups.set(score,[skin]);
  }
  const change=(next:Partial<typeof defaults>)=>{hold.capture();setShown(30);set(next);};
  const vote=(skin:string,rating:number|null)=>{hold.capture();void save(skin,rating);};
  const displayRating=(id:string)=>Object.hasOwn(draft,id)?draft[id]:saved.get(id)?.rating??null;
  const closeSkin=()=>{
    const opener=tierOpener.current;
    tierOpener.current=null;
    setZooming(false);
    set({skin:''});
    requestAnimationFrame(()=>{
      // A saved score change can move the opener into a different row and remount it.
      if(opener?.button.isConnected)return;
      const moved=opener&&tiers.current?.querySelector<HTMLButtonElement>(`[data-skin-id="${CSS.escape(opener.id)}"]`);
      if(moved)moved.focus();
      else if(opener||!filtered.some(skin=>skin.id===selected?.id))toolbar.current?.querySelector('input')?.focus({preventScroll:true});
    });
  };
  const navigate=(step:number)=>{
    const index=filtered.findIndex(skin=>skin.id===selected?.id),next=index<0?0:index+step;
    if(next>=0&&next<filtered.length)set({skin:filtered[next].id});
  };
  const skinCard=(skin:PollSkin)=>{
    const score=saved.get(skin.id)?.rating;
    const status=pending.has(skin.id)?'Saving…':failures[skin.id]?'Not saved':tierList?null:score!=null?`Your rating ${score}/10`:'Rate this skin';
    return <button type="button" key={skin.id} className={`pick-card pick-card-picture ${styles.skin}`}
      data-skin-id={tierList?skin.id:undefined} onClick={event=>{
        tierOpener.current=tierList?{id:skin.id,button:event.currentTarget}:null;
        set({skin:skin.id});
      }} aria-haspopup="dialog" aria-label={`Rate ${skin.name} by ${skin.operator}`}>
      <div className={styles.art}>{skin.image?<ResponsiveSkinArtwork src={skin.image} alt="" width={220} height={220} sizes={imageSizes}/>:<span className={`art-placeholder ${styles.missing}`}>Artwork unavailable</span>}</div>
      <span className={styles.skinCopy}><strong>{skin.name}</strong><small>{skin.operator}</small>{status&&<span className={styles.ownRating}>{status}</span>}</span>
    </button>;
  };
  return <>
    <PageMeta title="Arkpedia Drip Awards — test poll" description="Rate Arknights skins from 1 to 10, save your progress and explore the community ranking." path="/polls/favourite-skins"/>
    <PageHeader slim back={{href:'/polls',label:'Community polls'}} eyebrow="Rhodes Island // Community Polls" title="Arkpedia Drip Awards" sub="A very serious poll, for serious poll testing"/>
    <main>
      {policy.open && <PollTiming poll={policy}/>}
      {policy.open && filters.view === 'results' && !policy.results && <p className="notice">Results are hidden. Voting is open.</p>}
      {!policy.open && <p className="notice">Voting is closed.</p>}
      {policy.open && policy.results && <Tabs label="Poll sections" id="skin-poll" value={results?'results':'vote'} onChange={view=>change({view,skin:''})} options={[{value:'vote',label:'Rate skins'},{value:'results',label:'Live ranking'}]}/>}
      <div ref={hold.ref} style={hold.style}>
        <section {...(policy.results && policy.open ? tabPanelProps('skin-poll','vote') : {})} hidden={results} className={styles.ratePanel}>
          <div className={styles.intro}><p>Rate any outfit from 1 to 10. Each rating saves automatically, so you can come back whenever you like.</p>
            {!owner&&!accountLoading&&<Link className="ghost btn-sm" href="?settings=profile">Sign in to Arkpedia to rate skins</Link>}
          </div>
          <div className={styles.toolbar} ref={toolbar}><SearchInput label="Search by operator or skin name" placeholder="Search operator or skin name…" value={filters.q} onChange={q=>change({q})}/>
            {owner&&<SegmentedControl label="Show skins" value={filters.rated} onChange={rated=>change({rated})} options={[{value:'all',label:'All'},{value:'unrated',label:'Unrated'},{value:'rated',label:'Rated'}]}/>}
          </div>
          <div className={styles.progress}>
            <span className="hint">{filtered.length.toLocaleString('en-US')} skins</span>
            <span className="hint" role="status">{accountLoading?'Checking sign-in…':owner?!ready?'Loading saved ratings…':`${rated} / ${skins.length} rated${pending.size?' · Saving…':Object.keys(failures).length?' · Some ratings need attention':' · Saved to your account'}`:'Sign in to save your ratings'}</span>
            {owner&&<div className={styles.tierOptions} inert={!tierList}>
              <SegmentedControl label="Rating order" value={ratedOrder} onChange={ratedOrder=>change({ratedOrder})} options={[{value:'desc',label:'Highest first'},{value:'asc',label:'Lowest first'}]}/>
              <label className="check">
                <input type="checkbox" aria-label="Compact tier list" checked={compact} onChange={event=>change({tierSize:event.target.checked?'compact':'full'})}/>
                <span>Compact<span className={styles.compactSuffix}> tier list</span></span>
              </label>
            </div>}
          </div>
          {error&&<p className="notice notice-danger" role="status">{error} <button className="ghost btn-sm" onClick={()=>void load().catch(()=>{})}>Retry</button></p>}
          {tierList?<div className={styles.ratedTiers} ref={tiers} role="group" aria-label="Your ratings tier list">
            {[...groups].map(([score,entries])=><section className={styles.tier} key={score} aria-label={`Your rating ${score} out of 10`}>
              <div className={styles.tierScore} aria-hidden="true">{score}/10</div>
              <div className={styles.catalogue} data-compact={compact||undefined}>{entries.map(skinCard)}</div>
            </section>)}
          </div>:<div className={styles.catalogue}>{visible.map(skinCard)}</div>}
          {!filtered.length&&(!tierList||ready)&&<p className="notice" role="status">{tierList&&!rated?'You haven’t rated any skins yet.':filters.rated==='unrated'&&!filters.q?'You’ve rated every skin in this view. Come back when there are more!':'No skins match these filters.'}</p>}
          <LoadOnScroll shown={Math.min(shown,filtered.length)} total={filtered.length} onMore={()=>setShown(n=>n+30)}/>
        </section>
        <section {...(policy.results && policy.open ? tabPanelProps('skin-poll','results') : {})} hidden={!results} className={styles.results}>
          {results&&<SkinRatingResults ownRatings={owner&&ready?saved:null} skins={skins} result={ranking.result} error={ranking.error} onRetry={ranking.retry} filters={filters} onChange={patch=>{hold.capture();set(patch);}}/>}
        </section>
      </div>
      {!results&&selected&&<ImportDialog title={selected.name} className={styles.ratingDialog} dismissible={!zooming} onClose={closeSkin} actions={!zooming&&<button className="ghost btn-sm" onClick={closeSkin}>Back to skins</button>}>
        <div className={styles.ratingLayout} inert={zooming}><div className={styles.selectedArt}>{selected.image&&<button type="button" className="btn-bare skin-detail-art-button" aria-label={`View full artwork of ${selected.name}`} onClick={()=>setZooming(true)}><ResponsiveSkinArtwork src={selected.image} alt={selected.name} width={400} height={400} sizes="(max-width: 720px) 80vw, 440px"/><span className="skin-detail-expand" aria-hidden="true">View full artwork ↗</span></button>}{!selected.image&&<span className={`art-placeholder ${styles.missing}`}>Artwork unavailable</span>}</div>
          <div className={styles.ratingEditor}><p className="entity-title entity-title-sm entity-title-name">{selected.operator}</p><div className={styles.ratingHeading}><p className={styles.ratingPrompt}>Your rating <strong>{displayRating(selected.id)===null?'—':`${displayRating(selected.id)}/10`}</strong></p>{owner&&<button className="ghost btn-sm" aria-label="Clear my rating" disabled={!ready||displayRating(selected.id)===null||pending.has(selected.id)||!!failures[selected.id]?.current} onClick={()=>vote(selected.id,null)}>Clear</button>}</div>
            {owner?<><SegmentedControl label="Rate this skin from 1 to 10" className={styles.ratingChoices} value={displayRating(selected.id)??0} onChange={rating=>vote(selected.id,rating)} options={options.map(option=>({...option,disabled:!ready||pending.has(selected.id)}))}/>
              <p className={`hint ${styles.ratingStatus}`} role="status">{pending.has(selected.id)?'Saving your rating…':!ready?'Loading saved rating…':failures[selected.id]?'Not saved':saved.has(selected.id)?saved.get(selected.id)!.rating===null?'Rating cleared.':'Saved to your account.':'Choose a rating.'}</p>
              {failures[selected.id]&&<div className="notice notice-danger" role="status"><p>{failures[selected.id].message}</p>{failures[selected.id].profile&&<Link className="ghost btn-sm" href="?settings=profile">Complete your profile</Link>}{failures[selected.id].current?<button className="ghost btn-sm" onClick={()=>reloadSaved(selected.id)}>Reload saved rating</button>:<button className="ghost btn-sm" onClick={()=>vote(selected.id,displayRating(selected.id))}>Retry saving</button>}</div>}
            </>:accountLoading?<p role="status">Checking sign-in…</p>:<><p className="hint">Sign in to save your ratings and continue on another visit.</p><Link className="primary btn-sm" href="?settings=profile">Sign in to Arkpedia to rate skins</Link></>}
            <div className={styles.navigation}><button className="ghost btn-sm" disabled={filtered.findIndex(skin=>skin.id===selected.id)<=0} onClick={()=>navigate(-1)}>Previous skin</button><button className="ghost btn-sm" disabled={!filtered.length||filtered.findIndex(skin=>skin.id===selected.id)===filtered.length-1} onClick={()=>navigate(1)}>Next skin</button></div>
          </div>
        </div>
        {zooming&&selected.image&&<SkinZoomOverlay image={selected.image} name={selected.name} voiceOperator={selected.operator} dynamic={selected.dynamic??null} alternate={selected.alternate??null} closeLabel="Back to rating" onClose={()=>setZooming(false)}/>}
      </ImportDialog>}
    </main>
  </>;
}
export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/polls/favourite-skins',async()=>{
  const {communityPoll}=await import('@/lib/community/catalogues');
  const catalogue=await communityPoll();
  const {withFriendDynamicArt}=await import('@/lib/skins/dynamicArtFallback');
  return {props:await withFriendDynamicArt({skins:catalogue.skins})};
},{bundledWhenUnpublished:true,finalize:async props=>{const {withFriendDynamicArt}=await import('@/lib/skins/dynamicArtFallback');return withFriendDynamicArt(props);}});
