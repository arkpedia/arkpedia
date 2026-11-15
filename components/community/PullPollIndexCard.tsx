import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useReaderClock} from '@/lib/time/readerClock';
import {usePullPollResults} from '@/lib/polls/usePullPollResults';
import {PULL_POLL_DRAFT,bannerChoice,parseBallot,type Ballot,type PollBanner,type PollPortrait} from '@/lib/polls/pull-poll';
import {BannerArt,OperatorTile,bannerTitle} from './PullPollVisuals';
import {ResultSplit,resultVerdict} from './PullPollResults';
import styles from './PullPollIndexCard.module.css';
export default function PullPollIndexCard({banners,portraits,now}:{banners:PollBanner[];portraits:Record<string,PollPortrait>;now:number}){
  const clock=useReaderClock(now,{onFocus:true}),{result,error}=usePullPollResults(),[ballot,setBallot]=useState<Ballot>({});
  useEffect(()=>{try{const raw=localStorage.getItem(PULL_POLL_DRAFT);if(raw)setBallot(parseBallot(JSON.parse(raw),banners));}catch{}},[banners]);
  const upcoming=banners.filter(b=>Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>clock).sort((a,b)=>a.start.localeCompare(b.start,'en'));
  const featured=[...upcoming.filter(b=>b.image),...upcoming.filter(b=>!b.image)].slice(0,3),answered=upcoming.filter(b=>bannerChoice(ballot[b.id],b)).length;
  return <section className={`poll-banner-surface ${styles.card}`} aria-labelledby="pull-poll-title">
    <div className={styles.copy}><span className="label-tag">Open poll</span><h2 id="pull-poll-title" className="entity-title entity-title-name">Pull or Skip</h2><p>Pull, maybe or skip? See where the community is spending.</p>
      <div className={styles.facts}><span>{upcoming.length} banners</span><span>No account needed</span><span>Live results</span>{answered>0&&<span className="poll-your-choice">{answered} / {upcoming.length} answered · draft</span>}</div>
      <div className={styles.actions}><Link className="primary btn-sm" href="/polls/pull-or-skip">{answered?'Continue':'Make your picks'}</Link><Link className="ghost btn-sm" href="/polls/pull-or-skip?view=results">Results</Link></div>
      {error&&<span className="hint">Live results are temporarily unavailable.</span>}
    </div>
    <div className={styles.strip} role="group" aria-label="Pull or Skip banners">{featured.map(b=>{const row=result?.banners.find(r=>r.id===b.id);return <figure key={b.id}><div className={styles.preview}><BannerArt banner={b} portraits={portraits} stamp={row?.answers?resultVerdict(row):undefined}/><div className={styles.operators}>{b.operators.slice(0,5).map(name=><OperatorTile key={name} name={name} portraits={portraits} small/>)}</div></div>{row?.answers?<ResultSplit row={row}/>:null}<figcaption>{bannerTitle(b)}</figcaption></figure>;})}</div>
  </section>;
}
