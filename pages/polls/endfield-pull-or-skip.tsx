import { useEffect, useState } from 'react';
import PollGate from '@/components/community/PollGate';
import { ContentImg } from '@/components/content/ContentImage';
import PageHeader from '@/components/ui/PageHeader';
import PageMeta from '@/components/layout/PageMeta';
import ExternalLinkIcon from '@/components/ui/ExternalLinkIcon';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { ENDFIELD_POLL, ENDFIELD_SOURCE, endfieldArt, endfieldCards } from '@/lib/polls/endfield';
import { BANNER_INTENT, type Ballot, type PullPollResults } from '@/lib/polls/pull-poll';
import type { PublicPoll } from '@/lib/polls/settings';
import { usePollResults } from '@/lib/polls/usePollResults';
import styles from '@/components/community/EndfieldPoll.module.css';

const options = [{value:1,label:'Pull'}, {value:-1,label:'Maybe'}, {value:0,label:'Skip'}] as const;
const requestResults = (signal: AbortSignal) => fetch('/api/cloud-account/polls/endfield-pull-or-skip?view=results',{signal,cache:'no-store'});
const validResults = (data: PullPollResults) => Number.isInteger(data?.ballots) && Array.isArray(data.banners);

function Vote({owner, results, policy}: {owner:string|null; results:boolean; policy:PublicPoll}) {
  const [choices,setChoices] = useState<Ballot>({});
  const [revision,setRevision] = useState<number|null>(null), [dirty,setDirty] = useState(false);
  const [attempt,setAttempt] = useState(0), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  const ranking = usePollResults(requestResults,validResults,results);
  useEffect(() => {
    if (!policy.open) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/cloud-account/polls/endfield-pull-or-skip',{cache:'no-store',signal:controller.signal});
        const data = await response.json();
        if (!response.ok || data.owner !== owner) throw Error(data.error || 'Could not load your ballot.');
        if (!controller.signal.aborted) {setChoices(data.choices); setRevision(data.revision); setDirty(false); setMessage('');}
      } catch (e) { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : 'Could not load your ballot.'); }
    }
    void load();
    return () => controller.abort();
  },[owner,attempt,policy.open]);

  async function save() {
    if (busy || !policy.open || revision === null) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/cloud-account/polls/endfield-pull-or-skip',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,choices,revision})});
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) setRevision(null);
        throw Error(data.error || 'Could not save your ballot.');
      }
      setRevision(data.revision); setDirty(false); setMessage('Picks saved.');
    } catch (e) {setMessage(e instanceof Error ? e.message : 'Could not save your ballot.');}
    finally {setBusy(false);}
  }

  const answered = Object.keys(choices).length;
  return <section {...(policy.open && policy.results ? tabPanelProps('endfield',results?'results':'vote') : {})}>
    {results && <p role="status">{ranking.error ? <>{ranking.error} <button className="ghost btn-sm" onClick={ranking.retry}>Retry</button></> :
      !ranking.result ? 'Loading results…' : ranking.result.ballots === 0 ? 'No ballots yet.' : `${ranking.result.ballots} ${ranking.result.ballots === 1 ? 'ballot' : 'ballots'} submitted`}</p>}
    <div className={styles.grid}>{endfieldCards.map(card => {
      const selected = choices[card.id]?.[BANNER_INTENT];
      const totals = ranking.result?.banners.find(row => row.id === card.id);
      return <article key={card.id} aria-label={card.label} className={`panel ${styles.card}`}>
        <a href={endfieldArt(card.id,'orig')} target="_blank" rel="noreferrer" aria-label={`View full artwork for ${card.label}`}>
          <ContentImg alreadyPinned src={endfieldArt(card.id,'medium')} width={3840} height={1634} alt={card.description}/>
        </a>
        <div className={styles.controls}>
          <h2 className="entity-title entity-title-sm entity-title-name">{card.label}</h2>
          {results ? ranking.result && !ranking.error && <div className={styles.totals}>{options.map(({label}) => {
            const count = totals?.[label === 'Pull' ? 'pull' : label === 'Maybe' ? 'maybe' : 'skip'] ?? 0;
            return <span key={label}>{label} <strong>{count}</strong>{!!totals?.answers && ` · ${Math.round(100 * count / totals.answers)}%`}</span>;
          })}</div> : <SegmentedControl label={`Picks for ${card.label}`} options={options.map(option=>({...option,disabled:busy || revision === null}))}
            value={selected ?? ''} onChange={value => {
              const choice = options.find(option=>option.value === value);
              if (!choice) return;
              setChoices(current=>({...current,[card.id]:{[BANNER_INTENT]:choice.value}})); setDirty(true); setMessage('');
            }}/>}
        </div>
      </article>;
    })}</div>
    {!results && <div className={`panel ${styles.saveBar}`}>
      <span>{answered} / {endfieldCards.length} picked</span>
      <button className="primary btn-sm" disabled={!dirty || busy || revision === null} onClick={()=>void save()}>{busy ? 'Saving…' : revision ? 'Update picks' : owner ? 'Submit picks' : 'Submit anonymously'}</button>
      {message && <span role="status">{message}</span>}
      {revision === null && message && <button className="ghost btn-sm" onClick={()=>setAttempt(n=>n+1)}>Reload ballot</button>}
    </div>}
  </section>;
}

function EndfieldPoll({policy}: {policy:PublicPoll}) {
  const [view,setView] = useQueryState('view','vote'), {remote,status} = useCloudSync();
  const results = policy.results && (!policy.open || view === 'results');
  return <>
    <PageMeta title="Pull or Skip · Endfield" description="Choose which revealed Endfield operators you want to pull." path="/polls/endfield-pull-or-skip" noindex/>
    <PageHeader slim eyebrow="Endfield // Community Polls" back={{href:'/polls',label:'Community polls'}} title="Pull or Skip · Endfield"/>
    <main className={styles.page}>
      <div className={styles.intro}><p>{policy.open ? 'Who are you pulling for? Pick as many or as few as you like.' : 'Voting is closed.'}</p>
        <a className="ghost btn-sm" href={ENDFIELD_SOURCE} target="_blank" rel="noreferrer">Official reveal <ExternalLinkIcon/></a></div>
      {policy.open && policy.closesAt !== null && <p>Voting closes <time dateTime={new Date(policy.closesAt).toISOString()}>{new Date(policy.closesAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'long'})}</time>.</p>}
      {policy.open && policy.results && <Tabs id="endfield" label="Endfield poll sections" value={results?'results':'vote'} onChange={setView}
        options={[{value:'vote',label:'Your picks'},{value:'results',label:'Results'}]}/>}
      {status === 'loading' && !results ? <p role="status">Loading your ballot…</p> :
        <Vote key={remote?.user.id ?? 'guest'} owner={remote?.user.id ?? null} results={results} policy={policy}/>}
    </main>
  </>;
}
export default function EndfieldPullOrSkip() {
  return <PollGate id={ENDFIELD_POLL}>{policy=><EndfieldPoll policy={policy}/>}</PollGate>;
}
