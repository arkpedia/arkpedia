import { ENDFIELD_DRAFT } from '@/lib/polls/endfield';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useReaderClock} from '@/lib/time/readerClock';
import {PULL_POLL_DRAFT,bannerChoice,parseBallot,type Ballot,type PollBanner,type PollPortrait} from '@/lib/polls/pull-poll';
import {BannerArt,bannerTitle} from './PullPollVisuals';
import styles from './PullPollIndexCard.module.css';
import overview from './Polls.module.css';
export default function PullPollIndexCard({banners,portraits,now,showResults,endfield=false}:{endfield?:boolean;showResults:boolean;banners:PollBanner[];portraits:Record<string,PollPortrait>;now:number}){
  const path=endfield?'/polls/endfield-pull-or-skip':'/polls/pull-or-skip';
  const title=endfield?'Pull or Skip · Endfield':'Pull or Skip';
  const headingId=endfield?'endfield-poll-title':'pull-poll-title';
  const clock=useReaderClock(now,{onFocus:true}),[ballot,setBallot]=useState<Ballot>({});
  useEffect(()=>{try{const raw=localStorage.getItem(endfield ? ENDFIELD_DRAFT : PULL_POLL_DRAFT);if(raw)setBallot(parseBallot(JSON.parse(raw),banners));}catch{}},[banners,endfield]);
  const upcoming=banners.filter(b=>b.artwork || Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>clock).sort((a,b)=>a.start.localeCompare(b.start,'en'));
  const featured=[...upcoming.filter(b=>b.image),...upcoming.filter(b=>!b.image)].slice(0,3),answered=upcoming.filter(b=>bannerChoice(ballot[b.id],b)).length;
  return <section className={`panel ${overview.feature}`} aria-labelledby={headingId}>
    <div className={overview.featureBody}><div className={`${overview.copy} ${styles.copy}`}><span className="label-tag">Open poll</span><h2 id={headingId} className="entity-title entity-title-name">{title}</h2><p>Pull, maybe or skip? See where the community is spending.</p>
      <div className={styles.actions}><Link className="primary btn-sm" href={path}>{answered?'Continue':'Make your picks'}</Link>{showResults && <Link className="ghost btn-sm" href={endfield ? "/polls/endfield-pull-or-skip?view=results" : "/polls/pull-or-skip?view=results"}>Results</Link>}</div>
      {answered>0&&<p className={`hint ${overview.access}`}>{answered} / {upcoming.length} answered · Draft saved</p>}
    </div>
    <div className={styles.strip} role="group" aria-label="Pull or Skip banners">{featured.map(b=><figure key={b.id}><div className={styles.preview}><BannerArt banner={b} portraits={portraits}/></div>{!b.artwork && <figcaption>{bannerTitle(b)}</figcaption>}</figure>)}</div>
    </div>
    <dl className={overview.ratingFacts} aria-label="How the pull poll works"><div><dt>Upcoming</dt><dd>{upcoming.length} banners</dd></div><div><dt>No account needed</dt><dd>Anonymous</dd></div>{showResults && <div><dt>Community plans</dt><dd>Live results</dd></div>}</dl>
  </section>;
}
