import PollTiming from './PollTiming';
import { pollNames, type PublicPoll } from '@/lib/polls/settings';
import { ENDFIELD_DRAFT } from '@/lib/polls/endfield';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useReaderClock} from '@/lib/time/readerClock';
import {PULL_POLL_DRAFT,bannerChoice,parseBallot,type Ballot,type PollBanner,type PollPortrait} from '@/lib/polls/pull-poll';
import {BannerArt,bannerTitle} from './PullPollVisuals';
import styles from './PullPollIndexCard.module.css';
import overview from './Polls.module.css';
export default function PullPollIndexCard({banners,portraits,now,policy,endfield=false}:{endfield?:boolean;policy:PublicPoll;banners:PollBanner[];portraits:Record<string,PollPortrait>;now:number}){
  const path=endfield?'/polls/endfield-pull-or-skip':'/polls/pull-or-skip';
  const title=pollNames[endfield?'endfield-pull-or-skip':'pull-or-skip'];
  const headingId=endfield?'endfield-poll-title':'pull-poll-title';
  const clock=useReaderClock(now,{onFocus:true}),[ballot,setBallot]=useState<Ballot>({});
  useEffect(()=>{try{const raw=localStorage.getItem(endfield ? ENDFIELD_DRAFT : PULL_POLL_DRAFT);if(raw)setBallot(parseBallot(JSON.parse(raw),banners));}catch{}},[banners,endfield]);
  const ballotTime = !policy.open && policy.closesAt !== null ? policy.closesAt - 1 : clock;
  const upcoming=banners.filter(b=>b.artwork || Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>ballotTime).sort((a,b)=>a.start.localeCompare(b.start,'en'));
  const featured=[...upcoming.filter(b=>b.image),...upcoming.filter(b=>!b.image)].slice(0,3),answered=upcoming.filter(b=>bannerChoice(ballot[b.id],b)).length;
  return <section className={`panel ${overview.feature}${endfield ? ' endfield-poll' : ''}`} aria-labelledby={headingId}>
    <div className={overview.featureBody}><div className={`${overview.copy} ${styles.copy}`}><span className="label-tag">{policy.open ? 'Open poll' : 'Closed poll'}</span><h2 id={headingId} className="entity-title entity-title-name">{title}</h2>{policy.open && <p>Pull, maybe or skip? See where the community is spending.</p>}
      <PollTiming poll={policy}/>
      <div className={styles.actions}>
        {policy.open && <Link className="primary btn-sm" href={path}>{answered ? 'Continue' : 'Make your picks'}</Link>}
        {policy.results && <Link className={policy.open ? 'ghost btn-sm' : 'primary btn-sm'} href={path + '?view=results'}>{policy.open ? 'Results' : 'View results'}</Link>}
        {!policy.open && !policy.results && <span className="hint">Results hidden</span>}
      </div>
      {policy.open && answered>0&&<p className={`hint ${overview.access}`}>{answered} / {upcoming.length} answered · Draft saved</p>}
    </div>
    <div className={styles.strip} role="group" aria-label="Pull or Skip banners">{featured.map(b=><figure key={b.id}><div className={styles.preview}><BannerArt banner={b} portraits={portraits}/></div>{!b.artwork && <figcaption>{bannerTitle(b)}</figcaption>}</figure>)}</div>
    </div>
    {policy.open && <dl className={overview.ratingFacts} aria-label="How the pull poll works"><div><dt>{endfield?'Revealed':'Upcoming'}</dt><dd>{upcoming.length} {endfield?'operators':'banners'}</dd></div><div><dt>No account needed</dt><dd>Anonymous</dd></div>{policy.results && <div><dt>Community plans</dt><dd>Live results</dd></div>}</dl>}
  </section>;
}
