import { useEffect, useRef, useState } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
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
import { bannerChoice, decodeBallot, encodeBallot, importGoals, parseBallot, PULL_POLL_DRAFT, setBannerChoice, type Ballot, type PollBanner, type Want } from '@/lib/polls/pull-poll';
import styles from '@/components/community/PullPoll.module.css';

interface Props { banners: PollBanner[]; now: number }
const API = '/api/cloud-account/polls/pull-or-skip';
const wants = [{value:'',label:'Choose…'},{value:'0',label:'Not want'},{value:'-1',label:'Good to have'},...Array.from({length:6},(_,i)=>({value:String(i+1),label:`Potential ${i+1}${i===0?' · 1 copy':''}`}))];
const compact = [{value:'pull',label:'Pull'},{value:'maybe',label:'Maybe'},{value:'skip',label:'Skip'}];
export default function PullOrSkip(props: Props) {
  const sync = useCloudSync();
  return <PullPoll key={sync.remote?.user.id ?? 'anonymous'} {...props} owner={sync.remote?.user.id ?? null}/>;
}
function PullPoll({banners,now,owner}:Props&{owner:string|null}) {
  const router = useRouter(), sync = useCloudSync();
  const [filters,setFilters] = useQueryRecord({view:'compact'});
  const [ballot,setBallot] = useState<Ballot>({}), [hydrated,setHydrated] = useState(false);
  const [storageError,setStorageError] = useState(''), [notice,setNotice] = useState('');
  const [revision,setRevision] = useState(0), [ready,setReady] = useState(false), [error,setError] = useState('');
  const [working,setWorking] = useState(false), [prompt,setPrompt] = useState(false), [importing,setImporting] = useState(false);
  const [submitted,setSubmitted] = useState('');
  const file = useRef<HTMLInputElement>(null), hadDraft = useRef(false), edited = useRef(false), request = useRef(false);
  const hold = useSwitchHold('pull-poll'), clock = useReaderClock(now,{onFocus:true,tickMs:60_000});
  const active = banners.filter(b => (b.endAt ? Date.parse(b.endAt) : Date.parse(`${b.end}T23:59:59-07:00`)) > clock);
  const visible = [...active].sort((a,b)=>a.start.localeCompare(b.start,'en')||a.id.localeCompare(b.id,'en'));
  const detailed = filters.view === 'detailed';
  const answered = visible.filter(b => Object.keys(ballot[b.id] ?? {}).length).length;
  const dirty = JSON.stringify(ballot) !== submitted;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PULL_POLL_DRAFT);
      if (raw) { hadDraft.current = true; setBallot(parseBallot(JSON.parse(raw), banners)); }
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
    void fetch(API,{credentials:'same-origin',cache:'no-store',signal:abort.signal}).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? 'Submissions are temporarily unavailable.');
      if (result.owner !== owner) throw Error('Your account changed. Reload the poll.');
      setRevision(result.revision); setReady(true); setSubmitted(JSON.stringify(result.choices));
      if (!edited.current && !hadDraft.current && Object.keys(result.choices).length) setBallot(parseBallot(result.choices,banners));
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error?e.message:'Could not load your submitted entry.'); });
    return () => abort.abort();
  },[owner,banners]);
  function change(next:Ballot) { edited.current = true; setBallot(next); setNotice(''); }
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
      const response = await fetch(API,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,revision,choices:sent})});
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
    <PageHeader slim back={{href:'/polls',label:'Community polls'}} eyebrow="Rhodes Island // Community Polls" title="Pull or Skip" sub="Who are you saving for? Share your plans for the upcoming Global banners."/>
    <main>
      <section className={`panel ${styles.intro}`} aria-label="How to vote">
        <p><strong>Pull</strong>: 1 copy of every featured operator. <strong>Maybe</strong>: good to have. Choose potentials in Detailed.</p>
        <p className="hint">No account needed. Drafts save on this device. Share without submitting.</p>
      </section>
      <div className={styles.toolbar}>
        <SegmentedControl label="Poll view" value={detailed?'detailed':'compact'} onChange={view=>{hold.capture();setFilters({view});}} options={[{value:'compact',label:'Compact'},{value:'detailed',label:'Detailed'}]}/>
        <div className={styles.actions}><button className="ghost btn-sm" onClick={()=>setImporting(true)} disabled={!hydrated}>Import pull planner</button><button className="ghost btn-sm" onClick={()=>void share()} disabled={!hydrated || !Object.keys(ballot).length}>Copy share link</button></div>
      </div>
      <div className={styles.summary}><span className="hint">{answered} / {visible.length} banners answered</span><span className="hint" role="status">{hydrated ? storageError?'Draft needs attention':revision&&!dirty?'Submitted · Draft saved locally':'Draft saved locally · Not submitted':'Loading draft…'}</span></div>
      {storageError&&<p className="notice notice-danger" role="alert">{storageError}</p>}
      {notice&&<p className="notice" role="status">{notice}</p>}
      {error&&<p className="notice notice-danger" role="alert">{error} Your draft is kept in this browser. <button className="ghost btn-sm" onClick={()=>window.location.reload()}>Reload poll</button></p>}
      <div ref={hold.ref} style={hold.style} className={styles.banners}>
        {visible.map(banner=><article key={banner.id} className={`panel ${styles.banner}`} aria-label={banner.name}>
          <div className={styles.bannerRow}>
            {banner.image&&<ContentImg className={styles.art} src={banner.image} alt="" width="240" height="120"/>}
            <div className={styles.identity}><span className="label-tag">{banner.estimated?'Estimated Global dates':'Global banner'}</span><h2 className="entity-title entity-title-sm entity-title-name">{banner.name.replace(/^\[[^\]]*\]\s*/,'')}</h2><p className="hint"><time dateTime={banner.start}>{formatDayMonthYear(banner.start)}</time> — <time dateTime={banner.end}>{formatDayMonthYear(banner.end)}</time></p><p className={styles.names}>{banner.operators.join(' · ')}</p></div>
            {!detailed&&<div className={styles.choice}><SegmentedControl label={`Plan for ${banner.name}`} value={bannerChoice(ballot[banner.id],banner)} options={compact} onChange={choice=>change(setBannerChoice(ballot,banner,choice))}/>{bannerChoice(ballot[banner.id],banner)==='custom'&&<span className="hint">Custom operator choices · See Detailed</span>}</div>}
          </div>
          {detailed&&<div className={styles.operators}>{banner.operators.map(name=><div key={name} className={styles.operator}><strong>{name}</strong><StyledSelect label={`Want ${name} on ${banner.name}`} value={String(ballot[banner.id]?.[name]??'')} options={wants} onChange={raw=>{const choices={...ballot[banner.id]};if(raw==='')delete choices[name];else choices[name]=Number(raw) as Want;change({...ballot,[banner.id]:choices});}}/></div>)}</div>}
        </article>)}
        {!visible.length&&<p className="notice">No upcoming banners are available. Check back when the Global schedule updates.</p>}
      </div>
      <div className={`panel ${styles.submit}`}><div><strong>Ready to share your plans?</strong><p className="hint">Only answered operators are included. You can update your entry later.{!owner?' Anonymous entries belong to this browser.':''}</p></div><button className="primary btn-sm" disabled={working||!ready||!answered||!dirty} onClick={()=>void submit()}>{working?'Submitting…':revision?'Update entry':'Submit entry'}</button></div>
      {importing&&<ImportDialog title="Import pull planner" onClose={()=>setImporting(false)}><p>Import banner and operator goals from your saved Arkpedia pull plan. Matching banners replace their poll choices; other choices stay.</p><div className={styles.actions}><button className="primary btn-sm" onClick={()=>{try{const raw=localStorage.getItem(PULL_PLAN_KEY);if(!raw)throw Error('No pull plan is saved in this browser.');importPlan(raw);}catch(e){setNotice(e instanceof Error?e.message:'Could not read your plan.');}}}>Use this browser’s plan</button><button className="ghost btn-sm" onClick={()=>file.current?.click()}>Choose plan file</button></div><input ref={file} type="file" accept=".json,application/json" hidden onChange={event=>{const chosen=event.target.files?.[0];if(!chosen)return;if(chosen.size>MAX_PLAN_FILE_SIZE){setNotice('This file is too large for a pull plan.');return;}void chosen.text().then(importPlan).catch(()=>setNotice('Could not read this file.'));}}/>{notice&&<p role="status" className="notice">{notice}</p>}<p className="hint">Your pull planner is unchanged. <Link className="ghost btn-sm" href="/pull-planner">Open pull planner</Link>.</p></ImportDialog>}
      {prompt&&!owner&&<ImportDialog title="Create an Arkpedia account" onClose={()=>setPrompt(false)}><p>Your anonymous entry is submitted. Want to use an Arkpedia account next time?</p><p className="hint">Continue with Google or Discord. Your local draft stays here; signing in does not submit it again.</p><div className={styles.actions}>{(['google','discord'] as const).filter(provider=>sync.providers.includes(provider)).map(provider=><button key={provider} className="ghost btn-sm" disabled={working} onClick={()=>void login(provider)}><ProviderIcon provider={provider}/>Continue with {provider==='google'?'Google':'Discord'}</button>)}</div>{!sync.providers.length&&<Link className="ghost btn-sm" href="?settings=profile">Open Arkpedia sign-in</Link>}{error&&<p role="alert">{error}</p>}<button className="ghost btn-sm" onClick={()=>setPrompt(false)}>Keep my entry anonymous</button></ImportDialog>}
    </main>
  </>;
}
export const getStaticProps:GetStaticProps<Props> = withContentPage<Props>('/polls/pull-or-skip',async()=>{
  const {pullPollCatalogue} = await import('@/lib/polls/pull-poll-catalogue');
  return {props:await pullPollCatalogue()};
},{bundledWhenUnpublished:true});
