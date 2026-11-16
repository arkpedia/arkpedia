import { useEffect, useRef, useState } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import {useAccountActions} from '@/components/account/AccountActions';
import {PULL_POLL_SUBMISSION,PULL_POLL_SUBMIT_PARAM,SUBMISSION_TTL,submissionIntent,submissionReturnPath,type PollSubmissionIntent} from '@/lib/polls/pull-poll-submission';
import {readPollOwnedPotentials,useOwnedPotentials} from '@/lib/polls/useOwnedPotentials';
import SegmentedControl from '@/components/ui/SegmentedControl';
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
import { nativeAccountAuth, nativeSignIn } from '@/lib/cloud-account/native-client';
import { formatDayMonthYear } from '@/lib/pulls/format';
import { parsePullPlan, PULL_PLAN_KEY, MAX_PLAN_FILE_SIZE } from '@/lib/pulls/plan';
import { withContentPage } from '@/lib/content/server';
import { useReaderClock } from '@/lib/time/readerClock';
import { bannerChoice, decodeBallot, encodeBallot, importGoals, currentBallot, constrainOwned, activePollBanners, PULL_POLL_DRAFT, pullWant, setBannerChoice, walletMood, type PollPortrait, type Ballot, type PollBanner, type Want } from '@/lib/polls/pull-poll';
import styles from '@/components/community/PullPoll.module.css';

interface Props { banners: PollBanner[]; now: number; portraits?:Record<string,PollPortrait> }
export default function PullOrSkip(props: Props) {
  const sync = useCloudSync();
  return <PullPoll key={sync.remote?.user.id ?? 'anonymous'} {...props} owner={sync.remote?.user.id ?? null}/>;
}
function PullPoll({banners,now,owner,portraits={}}:Props&{owner:string|null}) {
  const router = useRouter(), sync = useCloudSync(), accountActions=useAccountActions();
  const [filters,setFilters] = useQueryRecord({view:'vote',display:'simple'});
  const [ballot,setBallot] = useState<Ballot>({}), [hydrated,setHydrated] = useState(false);
  const [storageError,setStorageError] = useState(''), [notice,setNotice] = useState('');
  const [revision,setRevision] = useState(0), [ready,setReady] = useState(false), [error,setError] = useState(''), [reload,setReload] = useState(0);
  const [working,setWorking] = useState(false), [prompt,setPrompt] = useState(false), [importing,setImporting] = useState(false);
  const [submitted,setSubmitted] = useState(''),[continuation,setContinuation]=useState<PollSubmissionIntent|null>(null);
  const mounted=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({}),[linked,setLinked]=useState(false),[syncDismissed,setSyncDismissed]=useState(false),[imageOpen,setImageOpen]=useState(false);
  const owned=useOwnedPotentials(portraits);
  const ballotRef=useRef(ballot);ballotRef.current=ballot;
  const file = useRef<HTMLInputElement>(null), hadDraft = useRef(false), edited = useRef(false), request = useRef(false);
  const hold = useSwitchHold('pull-poll'), clock = useReaderClock(now,{onFocus:true,tickMs:1000});
  const active = activePollBanners(banners,clock);
  const visible = [...active].sort((a,b)=>a.start.localeCompare(b.start,'en')||a.id.localeCompare(b.id,'en'));
  const results = filters.view === 'results', detailed = filters.display === 'detailed';
  const answered = visible.filter(b => Object.keys(ballot[b.id] ?? {}).length).length;
  const dirty = JSON.stringify(ballot) !== submitted;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PULL_POLL_DRAFT);
      if (raw) { hadDraft.current = true; const draft=currentBallot(JSON.parse(raw),banners);ballotRef.current=draft;setBallot(draft); }
      if(localStorage.getItem(PULL_POLL_SYNC)==='1'&&!window.location.hash.includes('plan=')){const plan=localStorage.getItem(PULL_PLAN_KEY);if(plan){const next=plannerIntoPoll(ballotRef.current,parsePullPlan(plan),banners);ballotRef.current=next;setBallot(next);setLinked(true);}}
    } catch { setStorageError('The saved draft could not be read. Your browser copy has not been replaced.'); }
    try {
      const shared = new URLSearchParams(window.location.hash.slice(1)).get('plan');
      if (shared) { setBallot(decodeBallot(shared,banners)); edited.current = true; setNotice('Shared choices loaded as a draft. Nothing has been submitted.'); }
    } catch { setNotice('This shared poll could not be opened. Your local draft is unchanged.'); }
    const params=new URLSearchParams(window.location.search),nonce=params.get(PULL_POLL_SUBMIT_PARAM);
    if(nonce){
      let pending:PollSubmissionIntent|null=null;try{pending=submissionIntent(sessionStorage.getItem(PULL_POLL_SUBMISSION),nonce,activePollBanners(banners));}catch{}
      if(pending){ballotRef.current=pending.choices;setBallot(pending.choices);hadDraft.current=true;}
      if(params.get('signin')==='failed'||!pending){try{sessionStorage.removeItem(PULL_POLL_SUBMISSION);}catch{}setNotice(params.get('signin')==='failed'?'Sign-in did not finish. Your draft is saved; choose how to submit again.':'Your sign-in submission expired. Review your draft and send it again.');}
      else setContinuation(pending);
    }
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
      if (!edited.current && !hadDraft.current && Object.keys(result.choices).length) setBallot(currentBallot(result.choices,banners));
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error?e.message:'Could not load your submitted entry.'); });
    return () => abort.abort();
  },[owner,banners,reload]);
  useEffect(()=>{
    if(!linked||!hydrated)return;
    const receive=()=>{try{const raw=localStorage.getItem(PULL_PLAN_KEY);if(!raw)return;const next=plannerIntoPoll(ballotRef.current,parsePullPlan(raw),banners,owned);if(JSON.stringify(next)!==JSON.stringify(ballotRef.current)){edited.current=true;ballotRef.current=next;setBallot(next);}}catch{setNotice('Your planner could not be read. Sync is paused; your draft stays here.');setLinked(false);}};
    const storage=(event:StorageEvent)=>{if(event.key===PULL_PLAN_KEY)receive();};
    receive();window.addEventListener(PULL_PLAN_EVENT,receive);window.addEventListener('storage',storage);window.addEventListener('focus',receive);window.addEventListener('arkpedia:cloud-restored',receive);
    return()=>{window.removeEventListener(PULL_PLAN_EVENT,receive);window.removeEventListener('storage',storage);window.removeEventListener('focus',receive);window.removeEventListener('arkpedia:cloud-restored',receive);};
  },[linked,hydrated,banners,owned]);
  useEffect(()=>{if(hydrated)try{localStorage.setItem(PULL_POLL_SYNC,linked?'1':'0');}catch{}},[linked,hydrated]);
  useEffect(()=>{
    const receive=()=>{const encoded=new URLSearchParams(window.location.hash.slice(1)).get('plan');if(!encoded)return;try{const next=decodeBallot(encoded,banners);edited.current=true;ballotRef.current=next;setBallot(next);setLinked(false);setNotice('Shared choices loaded as a draft. Nothing has been submitted.');}catch{setNotice('This shared poll could not be opened. Your local draft is unchanged.');}};
    window.addEventListener('hashchange',receive);return()=>window.removeEventListener('hashchange',receive);
  },[banners]);
  useEffect(()=>{if(!hydrated)return;setBallot(previous=>{const next=constrainOwned(currentBallot(previous,activePollBanners(banners,clock)),owned);if(JSON.stringify(next)===JSON.stringify(previous))return previous;ballotRef.current=next;return next;});},[owned,hydrated,ballot,banners,clock]);
  function writePlanner(next:Ballot){
    const raw=localStorage.getItem(PULL_PLAN_KEY),plan=raw?parsePullPlan(raw):emptyPullPlan();
    localStorage.setItem(PULL_PLAN_KEY,JSON.stringify(pollIntoPlanner(plan,next,visible,owned)));window.dispatchEvent(new Event(PULL_PLAN_EVENT));
  }
  function change(next:Ballot) { next=constrainOwned(next,owned); const removed=Object.keys(ballotRef.current).filter(id=>!next[id]);edited.current = true; ballotRef.current=next;setBallot(next); setNotice('');if(linked)try{writePlanner({...Object.fromEntries(removed.map(id=>[id,{}])),...next});}catch(e){setLinked(false);setNotice(e instanceof Error?e.message:'Planner sync paused. Your draft is still here.');} }
  function linkPlanner(){
    try{const raw=localStorage.getItem(PULL_PLAN_KEY),plan=raw?parsePullPlan(raw):emptyPullPlan();const next=plan.goals.length?plannerIntoPoll(ballotRef.current,plan,visible,owned):ballotRef.current;ballotRef.current=next;setBallot(next);edited.current=true;writePlanner(next);setLinked(true);setNotice('Synced with your pull planner. Only copy goals sync; Maybe stays in this poll. Nothing has been submitted.');}
    catch(e){setNotice(e instanceof Error?e.message:'Could not sync with your planner.');}
  }
  function chooseBanner(banner:PollBanner,choice:string){
    if(bannerChoice(ballot[banner.id],banner,owned)===choice){const next={...ballot};delete next[banner.id];change(next);}
    else change(setBannerChoice(ballot,banner,choice,owned));
  }
  function chooseOperator(banner:PollBanner,name:string,want:Want){
    if(want>0&&want<=(owned[name]??0))return;
    const choices={...ballot[banner.id]};if(choices[name]===want)delete choices[name];else choices[name]=want;
    const next={...ballot};if(Object.keys(choices).length)next[banner.id]=choices;else delete next[banner.id];change(next);
  }
  function importPlan(raw:string) {
    try {
      const imported = importGoals(parsePullPlan(raw).goals,active,owned);
      if (!Object.keys(imported).length) throw Error('No upcoming poll banners match this plan.');
      change({...ballot,...imported}); setNotice(`Imported ${Object.keys(imported).length} banner goals. Review them before submitting.`); setImporting(false);
    } catch(e) { setNotice(e instanceof Error?e.message:'This plan could not be imported.'); }
  }
  async function share() {
    try {
      const url = new URL(window.location.href); url.hash = `plan=${encodeBallot(currentBallot(ballot,visible))}`;
      await navigator.clipboard.writeText(url.href); setNotice('Share link copied. It includes your draft choices without submitting them.');
    } catch { setNotice('Could not copy the link. Try again with clipboard access enabled.'); }
  }
  async function submit(choices=ballot) {
    if (request.current || !ready) return;
    request.current = true; setContinuation(null);try{sessionStorage.removeItem(PULL_POLL_SUBMISSION);}catch{}setWorking(true); setError('');
    const sent = constrainOwned(currentBallot(choices,activePollBanners(banners)),readPollOwnedPotentials(portraits));
    ballotRef.current=sent;setBallot(sent);
    try {
      const response = await fetch('/api/cloud-account/polls/pull-or-skip',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,revision,choices:sent})});
      const result = await response.json();
      if (!response.ok) { if(response.status===409){setReady(false);setPrompt(false);} throw Error(result.error ?? 'Your entry could not be submitted.'); }
      setRevision(result.revision); setSubmitted(JSON.stringify(sent)); setNotice(owner?'Your poll entry has been submitted with your Arkpedia account.':'Your anonymous poll entry has been submitted.'); setPrompt(false);if(owner&&router.query[PULL_POLL_SUBMIT_PARAM])void accountActions.close([PULL_POLL_SUBMIT_PARAM]).catch(()=>{});
    } catch(e) { setError(e instanceof Error?e.message:'Submission failed. Your local draft is still here.'); }
    finally { setWorking(false); request.current = false; }
  }
  async function login(provider:'google'|'discord') {
    setWorking(true); setError('');
    try {
      const choices=constrainOwned(currentBallot(ballotRef.current,activePollBanners(banners)),readPollOwnedPotentials(portraits));
      const nonce=crypto.randomUUID(),intent:PollSubmissionIntent={nonce,createdAt:clock,choices};
      sessionStorage.setItem(PULL_POLL_SUBMISSION,JSON.stringify(intent));localStorage.setItem(PULL_POLL_DRAFT,JSON.stringify(choices));
      const returnPath=submissionReturnPath(router.asPath,nonce);
      const native = nativeAccountAuth();
      if (native) {
        sync.pause();
        try { const path = await nativeSignIn(native,provider,'sign-in',returnPath); await router.replace(path,undefined,{scroll:false}); }
        finally { await sync.resume(); }
      } else {
        const result = await accountClient.signIn.social({provider,callbackURL:returnPath,errorCallbackURL:submissionReturnPath(router.asPath,nonce,true)});
        if (result.error) throw Error('Sign-in could not start. Please try again.');
      }
    } catch(e) { try{sessionStorage.removeItem(PULL_POLL_SUBMISSION);}catch{}setError(e instanceof Error?e.message:'Sign-in could not start.'); }
    finally { setWorking(false); }
  }
  useEffect(()=>{
    if(continuation&&owner&&hydrated&&ready&&router.isReady&&sync.status==='setup'&&!sync.remote?.profile&&router.query.account!=='welcome'){
      setContinuation(null);try{sessionStorage.removeItem(PULL_POLL_SUBMISSION);}catch{}setNotice('Account setup was cancelled. Your draft is saved; press Send it when you are ready.');
    }
  },[continuation,owner,hydrated,ready,router.isReady,router.query.account,sync.status,sync.remote?.profile]);
  const submitRef=useRef(submit);submitRef.current=submit;
  useEffect(()=>{
    if(!continuation||!owner||!hydrated||!ready||!router.isReady||!sync.remote?.profile||!sync.remote.syncReviewed||!['ready','paused'].includes(sync.status))return;
    setContinuation(null);
    if(clock-continuation.createdAt>SUBMISSION_TTL){try{sessionStorage.removeItem(PULL_POLL_SUBMISSION);}catch{}setNotice('Your sign-in submission expired. Review your draft and send it again.');return;}
    void accountActions.close().then(()=>{if(mounted.current)void submitRef.current(continuation.choices);}).catch(()=>setNotice('Your draft is saved. Press Send it to finish submitting.'));
  },[continuation,owner,hydrated,ready,router.isReady,sync.remote?.profile,sync.remote?.syncReviewed,sync.status,accountActions,clock]);
  function closeSubmission(){setPrompt(false);setContinuation(null);try{sessionStorage.removeItem(PULL_POLL_SUBMISSION);}catch{}}
  return <>
    <PageMeta title="Pull or Skip poll" description="Share your next Arknights pulls. Vote by banner or choose a potential for each featured operator." path="/polls/pull-or-skip"/>
    <PageHeader slim back={{href:'/polls',label:'Community polls'}} eyebrow="Rhodes Island // Community Polls" title="Pull or Skip" sub="Doctor, the next banners are lined up. Who gets your Orundum?"/>
    <main className={styles.page}>
      <Tabs label="Pull or Skip sections" id="pull-poll" value={results?'results':'vote'} onChange={view=>{hold.capture();setFilters({view});}} options={[{value:'vote',label:'Your picks'},{value:'results',label:'Results'}]}/>
      {results&&<div className={styles.viewTools}><SegmentedControl label="Results display" value={detailed?'detailed':'simple'} onChange={display=>{hold.capture();setFilters({display});}} options={[{value:'simple',label:'Simple'},{value:'detailed',label:'Detailed'}]}/></div>}
      {results?<section {...tabPanelProps('pull-poll','results')}><PullPollResults banners={visible} portraits={portraits} ballot={ballot} detailed={detailed} owned={owned}/></section>:<section {...tabPanelProps('pull-poll','vote')}>
        <div className={styles.key} aria-label="How to vote">
          <span data-choice="pull"><ContentImg src="/material-icons/Headhunting%20Permit.webp" alt="" width="22" height="22"/><b>Pull</b>One copy of each new operator; featured operators on reruns.</span>
          <span data-choice="maybe"><b>Maybe</b>if the pity gods allow</span>
          <span data-choice="skip"><ContentImg src="/material-icons/Orundum.webp" alt="" width="22" height="22"/><b>Skip</b>my Orundum stays home</span>
          <button className="ghost btn-sm" onClick={()=>setImporting(true)} disabled={!hydrated}>Import plan</button>
        </div>
        {(!syncDismissed||linked)&&<div className={styles.sync} data-linked={linked}>
          <b className={styles.syncIcon} aria-hidden="true">⟲</b><span><strong>{linked?'Synced with your pull planner.':'Sync with your pull planner?'}</strong>{linked?'Copy goals follow changes on either page. Maybe stays here.':'Your copy goals here and your plan there become the same list. Change one, the other follows.'}</span>
          {linked?<><Link className="ghost btn-sm" href="/pull-planner">Open planner ↗</Link><button className="ghost btn-sm" onClick={()=>setLinked(false)}>Stop syncing</button></>:<><button className="primary btn-sm" onClick={linkPlanner} disabled={!hydrated}>Yes, sync</button><button className="ghost btn-sm" onClick={()=>setSyncDismissed(true)}>Not now</button></>}
        </div>}
        {storageError&&<p className="notice notice-danger" role="alert">{storageError}</p>}
        {notice&&<p className="notice" role="status">{notice}</p>}
        {error&&<p className="notice notice-danger" role="alert">{error} Your draft stays in this browser. <button className="ghost btn-sm" onClick={()=>{setReady(false);setError('');setReload(value=>value+1);}}>Refresh entry</button></p>}
        <div ref={hold.ref} style={hold.style} className={styles.banners}>
          {visible.map((banner,index)=>{const verdict=bannerChoice(ballot[banner.id],banner,owned),open=!!expanded[banner.id];return <article key={banner.id} className={`${styles.banner} poll-banner-surface`} data-verdict={verdict} aria-label={banner.name}>
            <BannerArt banner={banner} choices={ballot[banner.id]} portraits={portraits} owned={owned}/>
            <div className={styles.identity}><div><h2 className="entity-title entity-title-sm entity-title-name">{bannerTitle(banner)}</h2><div className="hint"><time dateTime={banner.start}>{formatDayMonthYear(banner.start)}</time> – <time dateTime={banner.end}>{formatDayMonthYear(banner.end)}</time>{banner.estimated?' · estimated':''}</div></div>
              <div className={styles.portraits}>{banner.operators.map(name=><OperatorTile key={name} name={name} want={ballot[banner.id]?.[name]} portraits={portraits} owned={owned[name]??0}/>)}{!banner.operators.length&&<span className="hint">Lineup still classified</span>}</div>
            </div>
            <div className={styles.bannerActions}>
              <div className="poll-choice-group" role="group" aria-label={`Plan for ${banner.name}`}>{(['pull','maybe','skip'] as const).map(choice=><button key={choice} type="button" data-choice={choice} aria-pressed={verdict===choice} disabled={choice==='pull'&&banner.operators.length>0&&banner.operators.every(name=>pullWant(banner,name)<=0||(owned[name]??0)>=6)} onClick={()=>chooseBanner(banner,choice)}>{choice==='pull'&&<ContentImg src="/material-icons/Headhunting%20Permit.webp" alt="" width="22" height="22"/>}{choice[0].toUpperCase()+choice.slice(1)}</button>)}</div>
              {!!banner.operators.length&&<button className={`ghost ${styles.expand}`} aria-label={`${open?'Hide':'Choose'} per operator for ${bannerTitle(banner)}`} title="Choose per operator" aria-expanded={open} aria-controls={`pull-banner-detail-${index}`} onClick={()=>{hold.capture();setExpanded(prev=>({...prev,[banner.id]:!open}));}}>{open?'▴':'▾'}</button>}
            </div>
            {open&&<div id={`pull-banner-detail-${index}`} className={styles.details}>{banner.operators.map(name=>{
              const want=ballot[banner.id]?.[name];return <div key={name} className={styles.operator}><OperatorTile name={name} want={ballot[banner.id]?.[name]} portraits={portraits} small owned={owned[name]??0}/><strong className={styles.operatorName}>{name}</strong><div className={styles.pips}>
                <div className="poll-choice-group" role="group" aria-label={`Interest in ${name} on ${bannerTitle(banner)}`}><button data-choice="skip" aria-pressed={want===0} onClick={()=>chooseOperator(banner,name,0)}>{"Don't Want"}</button><button data-choice="maybe" aria-pressed={want===-1} onClick={()=>chooseOperator(banner,name,-1)}>Nice to have</button></div>
                <div className="poll-choice-group" role="group" aria-label={`Potential for ${name} on ${bannerTitle(banner)}`}>{([1,2,3,4,5,6] as Want[]).map(p=><button key={p} aria-pressed={want===p} aria-label={`Potential ${p} for ${name}`} title={`Potential ${p}`} disabled={p<=(owned[name]??0)} onClick={()=>chooseOperator(banner,name,p)}><OperatorGameIcon label={`Potential ${p}`} size={16}/>{`P${p}`}</button>)}</div>
              </div></div>;
            })}</div>}
          </article>;})}
          {!visible.length&&<p className="notice">No upcoming banners are available. Check back when the Global schedule updates.</p>}
        </div>
        <div className={styles.dock} role="region" aria-label="Your pull plan actions"><div className={styles.dockInner}>
          <div className={styles.meter}><span className={styles.meterTitle}>{answered} / {visible.length} answered</span><span className={styles.mood}>{walletMood(ballot,owned)}</span></div>
          <span className={styles.saveStatus} role="status">{!hydrated?'Loading draft…':storageError?'Draft needs attention':revision&&!dirty?'Submitted · Draft saved':linked?'Synced with pull planner':'Draft saved on this device'}</span>
          <button className="ghost btn-sm" aria-label="Copy share link" onClick={()=>void share()} disabled={!hydrated||!answered}>⧉ <span>Copy share link</span></button>
          <button className="ghost btn-sm" aria-label="Save as image" onClick={()=>setImageOpen(true)} disabled={!hydrated||!answered}>▣ <span>Save as image</span></button>
          <button className="primary btn-sm" disabled={working||sync.status==='loading'||!ready||!answered||!dirty} onClick={()=>{if(owner)void submit();else setPrompt(true);}}>{working?'Sending…':revision?'Update entry':'Send it'}</button>
        </div></div>
      </section>}
      {imageOpen&&<PullPollShareImage banners={visible} ballot={ballot} portraits={portraits} owned={owned} onClose={()=>setImageOpen(false)}/>}
      {importing&&<ImportDialog title="Import pull planner" onClose={()=>setImporting(false)}><p>Import banner and operator goals from your saved Arkpedia pull plan. Matching banners replace their poll choices; other choices stay.</p><div className={styles.actions}><button className="primary btn-sm" onClick={()=>{try{const raw=localStorage.getItem(PULL_PLAN_KEY);if(!raw)throw Error('No pull plan is saved in this browser.');importPlan(raw);}catch(e){setNotice(e instanceof Error?e.message:'Could not read your plan.');}}}>Use this browser’s plan</button><button className="ghost btn-sm" onClick={()=>file.current?.click()}>Choose plan file</button></div><input ref={file} type="file" accept=".json,application/json" hidden onChange={event=>{const chosen=event.target.files?.[0];if(!chosen)return;if(chosen.size>MAX_PLAN_FILE_SIZE){setNotice('This file is too large for a pull plan.');return;}void chosen.text().then(importPlan).catch(()=>setNotice('Could not read this file.'));}}/>{notice&&<p role="status" className="notice">{notice}</p>}<p className="hint">Your pull planner is unchanged. <Link className="ghost btn-sm" href="/pull-planner">Open pull planner</Link>.</p></ImportDialog>}
      {prompt&&!owner&&<ImportDialog title="Submit your pull plan" onClose={closeSubmission}>
        <p>How would you like to submit this entry?</p><p className="hint">Sign in or create an account with Google or Discord. You will return to this plan and it will submit with your account after setup.</p>
        <div className={styles.actions}>{(['google','discord'] as const).filter(provider=>sync.providers.includes(provider)).map(provider=><button key={provider} className="primary btn-sm" disabled={working} onClick={()=>void login(provider)}><ProviderIcon provider={provider}/>Continue with {provider==='google'?'Google':'Discord'}</button>)}</div>
        <p className="hint">Or confirm an anonymous entry. No account is required.</p><button className="ghost btn-sm" disabled={working} onClick={()=>void submit()}>Submit anonymously</button>
        {error&&<p role="alert" className="notice notice-danger">{error}</p>}
      </ImportDialog>}
    </main>
  </>;
}
export const getStaticProps:GetStaticProps<Props> = withContentPage<Props>('/polls/pull-or-skip',async()=>{
  const {pullPollPageCatalogue} = await import('@/lib/polls/pull-poll-catalogue');
  return {props:await pullPollPageCatalogue()};
},{bundledWhenUnpublished:true,finalize:async props=>props.portraits?props:{...props,portraits:await (await import('@/lib/polls/pull-poll-catalogue')).pullPollPortraits(props.banners)}});
