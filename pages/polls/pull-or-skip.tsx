import { useEffect, useRef, useState } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import Tabs,{tabPanelProps} from '@/components/ui/Tabs';
import PullPollResults from '@/components/community/PullPollResults';
import PullPollShareImage from '@/components/community/PullPollShareImage';
import {BannerArt,OperatorTile,bannerTitle} from '@/components/community/PullPollVisuals';
import {emptyPullPlan,plannerIntoPoll,pollIntoPlanner,PULL_POLL_SYNC,PULL_PLAN_EVENT} from '@/lib/polls/pull-poll-sync';
import ImportDialog from '@/components/account/ImportDialog';
import ProviderIcon from '@/components/account/ProviderIcon';
import { ContentImg } from '@/components/content/ContentImage';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import { useQueryRecord } from '@/lib/hooks/useQueryState';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { accountClient } from '@/lib/cloud-account/client';
import { accountReturnPath } from '@/lib/cloud-account/navigation';
import { nativeAccountAuth, nativeSignIn } from '@/lib/cloud-account/native-client';
import { formatDayMonthYear } from '@/lib/pulls/format';
import { parsePullPlan, PULL_PLAN_KEY, MAX_PLAN_FILE_SIZE } from '@/lib/pulls/plan';
import { withContentPage } from '@/lib/content/server';
import { useReaderClock } from '@/lib/time/readerClock';
import { bannerChoice, decodeBallot, encodeBallot, importGoals, parseBallot, PULL_POLL_DRAFT, setBannerChoice, walletMood, type PollPortrait, type Ballot, type PollBanner, type Want } from '@/lib/polls/pull-poll';
import styles from '@/components/community/PullPoll.module.css';

interface Props { banners: PollBanner[]; now: number; portraits?:Record<string,PollPortrait> }
export default function PullOrSkip(props: Props) {
  const sync = useCloudSync();
  return <PullPoll key={sync.remote?.user.id ?? 'anonymous'} {...props} owner={sync.remote?.user.id ?? null}/>;
}
function PullPoll({banners,now,owner,portraits={}}:Props&{owner:string|null}) {
  const router = useRouter(), sync = useCloudSync();
  const [filters,setFilters] = useQueryRecord({view:'vote'});
  const [ballot,setBallot] = useState<Ballot>({}), [hydrated,setHydrated] = useState(false);
  const [storageError,setStorageError] = useState(''), [notice,setNotice] = useState('');
  const [revision,setRevision] = useState(0), [ready,setReady] = useState(false), [error,setError] = useState(''), [reload,setReload] = useState(0);
  const [working,setWorking] = useState(false), [prompt,setPrompt] = useState(false), [importing,setImporting] = useState(false);
  const [submitted,setSubmitted] = useState('');
  const [expanded,setExpanded]=useState<Record<string,boolean>>({}),[linked,setLinked]=useState(false),[syncDismissed,setSyncDismissed]=useState(false),[imageOpen,setImageOpen]=useState(false);
  const ballotRef=useRef(ballot);ballotRef.current=ballot;
  const file = useRef<HTMLInputElement>(null), hadDraft = useRef(false), edited = useRef(false), request = useRef(false);
  const hold = useSwitchHold('pull-poll'), clock = useReaderClock(now,{onFocus:true,tickMs:60_000});
  const active = banners.filter(b => (b.endAt ? Date.parse(b.endAt) : Date.parse(`${b.end}T23:59:59-07:00`)) > clock);
  const visible = [...active].sort((a,b)=>a.start.localeCompare(b.start,'en')||a.id.localeCompare(b.id,'en'));
  const results = filters.view === 'results';
  const answered = visible.filter(b => Object.keys(ballot[b.id] ?? {}).length).length;
  const dirty = JSON.stringify(ballot) !== submitted;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PULL_POLL_DRAFT);
      if (raw) { hadDraft.current = true; const draft=parseBallot(JSON.parse(raw),banners);ballotRef.current=draft;setBallot(draft); }
      if(localStorage.getItem(PULL_POLL_SYNC)==='1'&&!window.location.hash.includes('plan=')){const plan=localStorage.getItem(PULL_PLAN_KEY);if(plan){const next=plannerIntoPoll(ballotRef.current,parsePullPlan(plan),banners);ballotRef.current=next;setBallot(next);setLinked(true);}}
    } catch { setStorageError('The saved draft could not be read. Your browser copy has not been replaced.'); }
    try {
      const shared = new URLSearchParams(window.location.hash.slice(1)).get('plan');
      if (shared) { setBallot(decodeBallot(shared,banners)); edited.current = true; setNotice('Shared choices loaded as a draft. Nothing has been submitted.'); }
    } catch { setNotice('This shared poll could not be opened. Your local draft is unchanged.'); }
    setHydrated(true);
  },[banners]);
  useEffect(() => {
    if (!hydrated || storageError) return;
    try { localStorage.setItem(PULL_POLL_DRAFT,JSON.stringify(ballot)); }
    catch { setStorageError('Browser storage is unavailable. Keep this tab open or copy a share link to keep your choices.'); }
  },[ballot,hydrated,storageError]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/cloud-account/polls/pull-or-skip',{credentials:'same-origin',cache:'no-store',signal:abort.signal}).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? 'Submissions are temporarily unavailable.');
      if (result.owner !== owner) throw Error('Your account changed. Reload the poll.');
      setRevision(result.revision); setReady(true); setSubmitted(JSON.stringify(result.choices));
      if (!edited.current && !hadDraft.current && Object.keys(result.choices).length) setBallot(parseBallot(result.choices,banners));
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error?e.message:'Could not load your submitted entry.'); });
    return () => abort.abort();
  },[owner,banners,reload]);
  useEffect(()=>{
    if(!linked||!hydrated)return;
    const receive=()=>{try{const raw=localStorage.getItem(PULL_PLAN_KEY);if(!raw)return;const next=plannerIntoPoll(ballotRef.current,parsePullPlan(raw),banners);if(JSON.stringify(next)!==JSON.stringify(ballotRef.current)){edited.current=true;ballotRef.current=next;setBallot(next);}}catch{setNotice('Your planner could not be read. Sync is paused; your draft stays here.');setLinked(false);}};
    const storage=(event:StorageEvent)=>{if(event.key===PULL_PLAN_KEY)receive();};
    window.addEventListener(PULL_PLAN_EVENT,receive);window.addEventListener('storage',storage);window.addEventListener('focus',receive);window.addEventListener('arkpedia:cloud-restored',receive);
    return()=>{window.removeEventListener(PULL_PLAN_EVENT,receive);window.removeEventListener('storage',storage);window.removeEventListener('focus',receive);window.removeEventListener('arkpedia:cloud-restored',receive);};
  },[linked,hydrated,banners]);
  useEffect(()=>{if(hydrated)try{localStorage.setItem(PULL_POLL_SYNC,linked?'1':'0');}catch{}},[linked,hydrated]);
  useEffect(()=>{
    const receive=()=>{const encoded=new URLSearchParams(window.location.hash.slice(1)).get('plan');if(!encoded)return;try{const next=decodeBallot(encoded,banners);edited.current=true;ballotRef.current=next;setBallot(next);setLinked(false);setNotice('Shared choices loaded as a draft. Nothing has been submitted.');}catch{setNotice('This shared poll could not be opened. Your local draft is unchanged.');}};
    window.addEventListener('hashchange',receive);return()=>window.removeEventListener('hashchange',receive);
  },[banners]);
  function writePlanner(next:Ballot){
    const raw=localStorage.getItem(PULL_PLAN_KEY),plan=raw?parsePullPlan(raw):emptyPullPlan();
    localStorage.setItem(PULL_PLAN_KEY,JSON.stringify(pollIntoPlanner(plan,next,visible)));window.dispatchEvent(new Event(PULL_PLAN_EVENT));
  }
  function change(next:Ballot) { const removed=Object.keys(ballotRef.current).filter(id=>!next[id]);edited.current = true; ballotRef.current=next;setBallot(next); setNotice('');if(linked)try{writePlanner({...Object.fromEntries(removed.map(id=>[id,{}])),...next});}catch(e){setLinked(false);setNotice(e instanceof Error?e.message:'Planner sync paused. Your draft is still here.');} }
  function linkPlanner(){
    try{const raw=localStorage.getItem(PULL_PLAN_KEY),plan=raw?parsePullPlan(raw):emptyPullPlan();const next=plan.goals.length?plannerIntoPoll(ballotRef.current,plan,visible):ballotRef.current;ballotRef.current=next;setBallot(next);edited.current=true;writePlanner(next);setLinked(true);setNotice('Synced with your pull planner. Only copy goals sync; Maybe stays in this poll. Nothing has been submitted.');}
    catch(e){setNotice(e instanceof Error?e.message:'Could not sync with your planner.');}
  }
  function chooseBanner(banner:PollBanner,choice:string){
    if(bannerChoice(ballot[banner.id],banner)===choice){const next={...ballot};delete next[banner.id];change(next);}
    else change(setBannerChoice(ballot,banner,choice));
  }
  function chooseOperator(banner:PollBanner,name:string,want:Want){
    const choices={...ballot[banner.id]};if(choices[name]===want)delete choices[name];else choices[name]=want;
    const next={...ballot};if(Object.keys(choices).length)next[banner.id]=choices;else delete next[banner.id];change(next);
  }
  function importPlan(raw:string) {
    try {
      const imported = importGoals(parsePullPlan(raw).goals,active);
      if (!Object.keys(imported).length) throw Error('No upcoming poll banners match this plan.');
      change({...ballot,...imported}); setNotice(`Imported ${Object.keys(imported).length} banner goals. Review them before submitting.`); setImporting(false);
    } catch(e) { setNotice(e instanceof Error?e.message:'This plan could not be imported.'); }
  }
  async function share() {
    try {
      const url = new URL(window.location.href); url.hash = `plan=${encodeBallot(ballot)}`;
      await navigator.clipboard.writeText(url.href); setNotice('Share link copied. It includes your draft choices without submitting them.');
    } catch { setNotice('Could not copy the link. Try again with clipboard access enabled.'); }
  }
  async function submit() {
    if (request.current || !ready) return;
    request.current = true; setWorking(true); setError('');
    const sent = ballot;
    try {
      const response = await fetch('/api/cloud-account/polls/pull-or-skip',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,revision,choices:sent})});
      const result = await response.json();
      if (!response.ok) { if(response.status===409)setReady(false); throw Error(result.error ?? 'Your entry could not be submitted.'); }
      setRevision(result.revision); setSubmitted(JSON.stringify(sent)); setNotice('Your poll entry has been submitted.'); if (!owner) setPrompt(true);
    } catch(e) { setError(e instanceof Error?e.message:'Submission failed. Your local draft is still here.'); }
    finally { setWorking(false); request.current = false; }
  }
  async function login(provider:'google'|'discord') {
    setWorking(true); setError('');
    try {
      const native = nativeAccountAuth();
      if (native) {
        sync.pause();
        try { const path = await nativeSignIn(native,provider,'sign-in',router.asPath); await router.replace(path,undefined,{scroll:false}); }
        finally { await sync.resume(); }
      } else {
        const result = await accountClient.signIn.social({provider,callbackURL:accountReturnPath(router.asPath),errorCallbackURL:accountReturnPath(router.asPath,true)});
        if (result.error) throw Error('Sign-in could not start. Please try again.');
      }
    } catch(e) { setError(e instanceof Error?e.message:'Sign-in could not start.'); }
    finally { setWorking(false); }
  }
  return <>
    <PageMeta title="Pull or Skip poll" description="Share your next Arknights pulls. Vote by banner or choose a potential for each featured operator." path="/polls/pull-or-skip"/>
    <PageHeader slim back={{href:'/polls',label:'Community polls'}} eyebrow="Rhodes Island // Community Polls" title="Pull or Skip" sub="Doctor, the next banners are lined up. Who gets your Orundum?"/>
    <main className={styles.page}>
      <Tabs label="Pull or Skip sections" id="pull-poll" value={results?'results':'vote'} onChange={view=>{hold.capture();setFilters({view});}} options={[{value:'vote',label:'Your picks'},{value:'results',label:'Results'}]}/>
      {results?<section {...tabPanelProps('pull-poll','results')}><PullPollResults banners={visible} portraits={portraits} ballot={ballot}/></section>:<section {...tabPanelProps('pull-poll','vote')}>
        <div className={styles.key} aria-label="How to vote">
          <span data-choice="pull"><ContentImg src="/material-icons/Headhunting%20Permit.webp" alt="" width="22" height="22"/><b>Pull</b>One copy of each featured operator.</span>
          <span data-choice="maybe"><b>Maybe</b>if the pity gods allow</span>
          <span data-choice="skip"><ContentImg src="/material-icons/Orundum.webp" alt="" width="22" height="22"/><b>Skip</b>my Orundum stays home</span>
          <div className={styles.tools}><button className="ghost btn-sm" onClick={()=>setImporting(true)} disabled={!hydrated}>Import plan</button></div>
        </div>
        {(!syncDismissed||linked)&&<div className={styles.sync} data-linked={linked}>
          <b className={styles.syncIcon} aria-hidden="true">⟲</b><span><strong>{linked?'Synced with your pull planner.':'Sync with your pull planner?'}</strong>{linked?'Copy goals follow changes on either page. Maybe stays here.':'Your copy goals here and your plan there become the same list. Change one, the other follows.'}</span>
          {linked?<><Link className="ghost btn-sm" href="/pull-planner">Open planner ↗</Link><button className="ghost btn-sm" onClick={()=>setLinked(false)}>Stop syncing</button></>:<><button className="primary btn-sm" onClick={linkPlanner} disabled={!hydrated}>Yes, sync</button><button className="ghost btn-sm" onClick={()=>setSyncDismissed(true)}>Not now</button></>}
        </div>}
        {storageError&&<p className="notice notice-danger" role="alert">{storageError}</p>}
        {notice&&<p className="notice" role="status">{notice}</p>}
        {error&&<p className="notice notice-danger" role="alert">{error} Your draft stays in this browser. <button className="ghost btn-sm" onClick={()=>{setReady(false);setError('');setReload(value=>value+1);}}>Refresh entry</button></p>}
        <div ref={hold.ref} style={hold.style} className={styles.banners}>
          {visible.map((banner,index)=>{const verdict=bannerChoice(ballot[banner.id],banner),open=!!expanded[banner.id];return <article key={banner.id} className={`${styles.banner} poll-banner-surface`} data-verdict={verdict} aria-label={banner.name}>
            <BannerArt banner={banner} choices={ballot[banner.id]} portraits={portraits}/>
            <div className={styles.identity}><div><h2 className="entity-title entity-title-sm entity-title-name">{bannerTitle(banner)}</h2><div className="hint"><time dateTime={banner.start}>{formatDayMonthYear(banner.start)}</time> – <time dateTime={banner.end}>{formatDayMonthYear(banner.end)}</time>{banner.estimated?' · estimated':''}</div></div>
              <div className={styles.portraits}>{banner.operators.map(name=><OperatorTile key={name} name={name} want={ballot[banner.id]?.[name]} portraits={portraits}/>)}{!banner.operators.length&&<span className="hint">Lineup still classified</span>}</div>
            </div>
            <div className={styles.bannerActions}>
              <div className="poll-choice-group" role="group" aria-label={`Plan for ${banner.name}`}>{(['pull','maybe','skip'] as const).map(choice=><button key={choice} type="button" data-choice={choice} aria-pressed={verdict===choice} onClick={()=>chooseBanner(banner,choice)}>{choice==='pull'&&<ContentImg src="/material-icons/Headhunting%20Permit.webp" alt="" width="22" height="22"/>}{choice[0].toUpperCase()+choice.slice(1)}</button>)}</div>
              {!!banner.operators.length&&<button className={`ghost ${styles.expand}`} aria-label={`${open?'Hide':'Choose'} per operator for ${bannerTitle(banner)}`} title="Choose per operator" aria-expanded={open} aria-controls={`pull-banner-detail-${index}`} onClick={()=>{hold.capture();setExpanded(prev=>({...prev,[banner.id]:!open}));}}>{open?'▴':'▾'}</button>}
            </div>
            {open&&<div id={`pull-banner-detail-${index}`} className={styles.details}>{banner.operators.map(name=>{
              const want=ballot[banner.id]?.[name];return <div key={name} className={styles.operator}><OperatorTile name={name} portraits={portraits} small/><strong className={styles.operatorName}>{name}</strong><div className={styles.pips}>
                <div className="poll-choice-group" role="group" aria-label={`Interest in ${name} on ${bannerTitle(banner)}`}><button data-choice="skip" aria-pressed={want===0} onClick={()=>chooseOperator(banner,name,0)}>Nope</button><button data-choice="maybe" aria-pressed={want===-1} onClick={()=>chooseOperator(banner,name,-1)}>Nice to have</button></div>
                <div className="poll-choice-group" role="group" aria-label={`Potential for ${name} on ${bannerTitle(banner)}`}>{([1,2,3,4,5,6] as Want[]).map(p=><button key={p} aria-pressed={want===p} aria-label={`Potential ${p} for ${name}`} title={`Potential ${p}`} onClick={()=>chooseOperator(banner,name,p)}>{p===6?'MAX':`P${p}`}</button>)}</div>
              </div></div>;
            })}</div>}
          </article>;})}
          {!visible.length&&<p className="notice">No upcoming banners are available. Check back when the Global schedule updates.</p>}
        </div>
        <div className={styles.dock} role="region" aria-label="Your pull plan actions"><div className={styles.dockInner}>
          <div className={styles.meter}><span className={styles.meterTitle}>{answered} / {visible.length} answered</span><span className={styles.mood}>{walletMood(ballot)}</span><div className={styles.ticks} aria-hidden="true">{visible.map(b=><span key={b.id} data-verdict={bannerChoice(ballot[b.id],b)}/>)}</div></div>
          <span className={styles.saveStatus} role="status">{!hydrated?'Loading draft…':storageError?'Draft needs attention':revision&&!dirty?'Submitted · Draft saved':linked?'Synced with pull planner':'Draft saved on this device'}</span>
          <button className="ghost btn-sm" aria-label="Copy share link" onClick={()=>void share()} disabled={!hydrated||!answered}>⧉ <span>Copy share link</span></button>
          <button className="ghost btn-sm" aria-label="Save as image" onClick={()=>setImageOpen(true)} disabled={!hydrated||!answered}>▣ <span>Save as image</span></button>
          <button className="primary btn-sm" disabled={working||!ready||!answered||!dirty} onClick={()=>void submit()}>{working?'Sending…':revision?'Update entry':'Send it'}</button>
        </div></div>
      </section>}
      {imageOpen&&<PullPollShareImage banners={visible} ballot={ballot} portraits={portraits} onClose={()=>setImageOpen(false)}/>}
      {importing&&<ImportDialog title="Import pull planner" onClose={()=>setImporting(false)}><p>Import banner and operator goals from your saved Arkpedia pull plan. Matching banners replace their poll choices; other choices stay.</p><div className={styles.actions}><button className="primary btn-sm" onClick={()=>{try{const raw=localStorage.getItem(PULL_PLAN_KEY);if(!raw)throw Error('No pull plan is saved in this browser.');importPlan(raw);}catch(e){setNotice(e instanceof Error?e.message:'Could not read your plan.');}}}>Use this browser’s plan</button><button className="ghost btn-sm" onClick={()=>file.current?.click()}>Choose plan file</button></div><input ref={file} type="file" accept=".json,application/json" hidden onChange={event=>{const chosen=event.target.files?.[0];if(!chosen)return;if(chosen.size>MAX_PLAN_FILE_SIZE){setNotice('This file is too large for a pull plan.');return;}void chosen.text().then(importPlan).catch(()=>setNotice('Could not read this file.'));}}/>{notice&&<p role="status" className="notice">{notice}</p>}<p className="hint">Your pull planner is unchanged. <Link className="ghost btn-sm" href="/pull-planner">Open pull planner</Link>.</p></ImportDialog>}
      {prompt&&!owner&&<ImportDialog title="Create an Arkpedia account" onClose={()=>setPrompt(false)}><p>Your anonymous entry is submitted. Want to use an Arkpedia account next time?</p><p className="hint">Continue with Google or Discord. Your local draft stays here; signing in does not submit it again.</p><div className={styles.actions}>{(['google','discord'] as const).filter(provider=>sync.providers.includes(provider)).map(provider=><button key={provider} className="ghost btn-sm" disabled={working} onClick={()=>void login(provider)}><ProviderIcon provider={provider}/>Continue with {provider==='google'?'Google':'Discord'}</button>)}</div>{!sync.providers.length&&<Link className="ghost btn-sm" href="?settings=profile">Open Arkpedia sign-in</Link>}{error&&<p role="alert">{error}</p>}<button className="ghost btn-sm" onClick={()=>setPrompt(false)}>Keep my entry anonymous</button></ImportDialog>}
    </main>
  </>;
}
export const getStaticProps:GetStaticProps<Props> = withContentPage<Props>('/polls/pull-or-skip',async()=>{
  const {pullPollPageCatalogue} = await import('@/lib/polls/pull-poll-catalogue');
  return {props:await pullPollPageCatalogue()};
},{bundledWhenUnpublished:true,finalize:async props=>props.portraits?props:{...props,portraits:await (await import('@/lib/polls/pull-poll-catalogue')).pullPollPortraits(props.banners)}});
