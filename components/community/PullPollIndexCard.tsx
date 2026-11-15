import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useReaderClock} from '@/lib/time/readerClock';
import {PULL_POLL_DRAFT,bannerChoice,parseBallot,type Ballot,type PollBanner,type PollPortrait} from '@/lib/polls/pull-poll';
import {BannerArt,bannerTitle} from './PullPollVisuals';
import styles from './PullPollIndexCard.module.css';
import overview from './Polls.module.css';
export default function PullPollIndexCard({banners,portraits,now}:{banners:PollBanner[];portraits:Record<string,PollPortrait>;now:number}){
  const clock=useReaderClock(now,{onFocus:true}),[ballot,setBallot]=useState<Ballot>({});
  useEffect(()=>{try{const raw=localStorage.getItem(PULL_POLL_DRAFT);if(raw)setBallot(parseBallot(JSON.parse(raw),banners));}catch{}},[banners]);
  const upcoming=banners.filter(b=>Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>clock).sort((a,b)=>a.start.localeCompare(b.start,'en'));
  const featured=[...upcoming.filter(b=>b.image),...upcoming.filter(b=>!b.image)].slice(0,3),answered=upcoming.filter(b=>bannerChoice(ballot[b.id],b)).length;
  return <section className={`panel ${overview.feature}`} aria-labelledby="pull-poll-title">
    <div className={overview.featureBody}><div className={`${overview.copy} ${styles.copy}`}><span className="label-tag">Open poll</span><h2 id="pull-poll-title" className="entity-title entity-title-name">Pull or Skip</h2><p>Pull, maybe or skip? See where the community is spending.</p>
      <div className={styles.actions}><Link className="primary btn-sm" href="/polls/pull-or-skip">{answered?'Continue':'Make your picks'}</Link><Link className="ghost btn-sm" href="/polls/pull-or-skip?view=results">Results</Link></div>
      {answered>0&&<p className={`hint ${overview.access}`}>{answered} / {upcoming.length} answered · Draft saved</p>}
    </div>
    <div className={styles.strip} role="group" aria-label="Pull or Skip banners">{featured.map(b=><figure key={b.id}><div className={styles.preview}><BannerArt banner={b} portraits={portraits}/></div><figcaption>{bannerTitle(b)}</figcaption></figure>)}</div>
    </div>
    <dl className={overview.ratingFacts} aria-label="How the pull poll works"><div><dt>Upcoming</dt><dd>{upcoming.length} banners</dd></div><div><dt>No account needed</dt><dd>Anonymous</dd></div><div><dt>Community plans</dt><dd>Live results</dd></div></dl>
  </section>;
}
