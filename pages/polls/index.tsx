import { usePublicPolls } from '@/lib/polls/usePublicPolls';
import PollTiming from '@/components/community/PollTiming';
import { pollNames } from '@/lib/polls/settings';
import { ENDFIELD_POLL, endfieldBanners } from '@/lib/polls/endfield';
import Link from 'next/link';
import PullPollIndexCard from '@/components/community/PullPollIndexCard';
import type {PollBanner,PollPortrait} from '@/lib/polls/pull-poll';
import {useMemo} from 'react';
import MakerSampleCards from '@/components/community/MakerSampleCards';
import {useSkinRatingResults} from '@/lib/polls/useSkinRatings';
import {skinRatingRows} from '@/lib/polls/skin-rating-statistics';
import type {PollSkin} from '@/lib/polls/skin-poll';
import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { withContentPage } from '@/lib/content/server';
import type { MakerSample } from '@/lib/tier-list/makerSamples';
import styles from '@/components/community/Polls.module.css';

interface Outfit {image:string;name:string;operator:string}
interface Leader {id:string;name:string;operator?:string;image:string|null;rank:number;href?:string}
interface Props {now:number;pullBanners?:PollBanner[];pullPortraits?:Record<string,PollPortrait>;showcase:Outfit[];previousArt:string[];skins?:PollSkin[];previousLeaders?:Leader[];makerSamples?:MakerSample[]}

function LeaderFigures({leaders}:{leaders:Leader[]}){
  return <>{[1,0,2].map((position,slot)=>{const leader=leaders[position];if(!leader)return <figure key={`empty-${slot}`} aria-hidden="true"/>;
    const art=leader.image?<ResponsiveSkinArtwork src={leader.image} alt={`${leader.name}${leader.operator?` by ${leader.operator}`:''}`} width={400} height={440} sizes="(max-width: 720px) 30vw, 240px"/>:<span className="art-placeholder">Artwork unavailable</span>;
    return <figure key={leader.id} data-rank={leader.rank} data-podium-slot={slot}>
      {leader.href?<Link className={`btn-bare ${styles.leaderImage}`} href={leader.href} aria-label={`View results for ${leader.name}`} title={leader.name}>{art}</Link>:<span className={styles.leaderImage}>{art}</span>}
      <figcaption className={`hint ${styles.leaderCaption}`}><strong>#{leader.rank}</strong><span>{leader.name}</span></figcaption>
    </figure>;
  })}</>;
}
export default function Polls({skins=[],previousLeaders=[],pullBanners=[],pullPortraits={},makerSamples=[],now}:Props){
  const {polls,error:settingsError}=usePublicPolls();
  const pull=polls?.['pull-or-skip'], drip=polls?.['favourite-skins'], power=polls?.['power-scale'];
  const endfield = polls?.[ENDFIELD_POLL];
  const resultPaths = {'pull-or-skip':'/polls/pull-or-skip?view=results','favourite-skins':'/polls/favourite-skins?view=results','power-scale':'/polls/power-scale',[ENDFIELD_POLL]:'/polls/endfield-pull-or-skip?view=results'};
  const closed=(['pull-or-skip','favourite-skins',ENDFIELD_POLL,'power-scale'] as const).filter(id => polls?.[id] && !polls[id]?.open);
  const featured = closed.filter(id => polls?.[id]?.featured);
  const previous = closed.filter(id => !polls?.[id]?.featured);
  const showPull = pull && (pull.open || pull.featured);
  const showEndfield = endfield && (endfield.open || endfield.featured);
  const hasOpen = pull?.open || drip?.open || endfield?.open;
  const heading = !featured.length ? 'Open now' : hasOpen ? 'Open now and recent results' : 'Recent results';
  function closedCard(id: typeof closed[number]) {
    const poll = polls?.[id];
    if (!poll) return null;
    return <section className={`panel ${styles.closedCard}`} key={id} aria-label={pollNames[id]}>
      <div><span className="label-tag">Closed poll</span><h3 className="entity-title">{pollNames[id]}</h3>
        <PollTiming poll={poll}/></div>
      {poll.results ? <Link className="ghost btn-sm" href={resultPaths[id]}>View results</Link> : <span className="hint">Results hidden</span>}
    </section>;
  }
  const {result,error}=useSkinRatingResults(!!drip?.results && drip.open);
  const leaders=useMemo(()=>skinRatingRows(result?.ranking??[],skins,'skins').slice(0,3).map(row=>({...row,href:`/polls/favourite-skins?view=results&detail=${encodeURIComponent(row.id)}`})),[result,skins]);
  return <>
    <PageMeta title="Community polls" description="Vote in Arkpedia community polls and explore previous results." path="/polls"/>
    <PageHeader slim eyebrow="Rhodes Island // Community" title="Community polls" sub="Pick your favourites. Follow the community’s verdict."/>
    <main className={styles.page}>
      <h2 className="section-title">{heading}</h2>
      {!hasOpen && !featured.length && <p className="hint" role="status">{settingsError ? 'Poll availability could not be loaded.' : polls ? 'No polls are open.' : 'Loading polls…'}</p>}
      {(showPull || showEndfield) && <div className={styles.pullEditions} data-paired={!!showPull && !!showEndfield}>
        {showPull && <PullPollIndexCard policy={pull} banners={pullBanners} portraits={pullPortraits} now={now}/>}
        {showEndfield && <PullPollIndexCard endfield policy={endfield} banners={endfieldBanners} portraits={{}} now={now}/>}
      </div>}
      {drip?.open && <section className={`panel ${styles.feature}`} aria-labelledby="drip-awards-title">
        <div className={styles.featureBody}>
          <div className={styles.copy}>
            <span className="label-tag">Open poll · Test poll</span>
            <h2 id="drip-awards-title" className={`entity-title entity-title-name ${styles.title}`}>Arkpedia Drip Awards</h2>
            <p className={styles.subtitle}>A very serious poll, for serious poll testing</p>
            <p className={styles.invitation}>Rate a few outfits now. Come back for the rest.</p>
            <PollTiming poll={drip}/>
            <div className={styles.actions}>
              <Link className="primary btn-sm" href="/polls/favourite-skins">Rate skins</Link>
              {drip.results && <Link className="ghost" href="/polls/favourite-skins?view=results">Live ranking</Link>}
            </div>
            <p className={`hint ${styles.access}`}>An Arkpedia account is required to vote.</p>
          </div>
          {drip.results && <div className={styles.showcase} role="group" aria-label="Current skin leaders">{leaders.length?<LeaderFigures leaders={leaders}/>:<p className={`hint ${styles.emptyLeaders}`} role="status">{error?'Live leaders are temporarily unavailable.':result?'No ratings yet. Be the first to rate a skin.':'Loading live leaders…'}</p>}</div>}
        </div>
        <dl className={styles.ratingFacts} aria-label="How skin ratings work">
          <div><dt>Rating scale</dt><dd>1–10</dd></div><div><dt>No limit</dt><dd>Any skin</dd></div><div><dt>Progress saved</dt><dd>Any time</dd></div>
        </dl>
      </section>}
      {featured.filter(id => id !== 'pull-or-skip' && id !== ENDFIELD_POLL).map(closedCard)}
      {previous.length > 0 && <section className={styles.previous} aria-labelledby="previous-polls-title">
        <h2 id="previous-polls-title" className="section-title">Previous results</h2>
        {previous.filter(id => id !== 'power-scale').map(closedCard)}
        {previous.includes('power-scale') && power && (power.results ? <Link className={`directory-card lift ${styles.archive}`} href="/polls/power-scale" aria-label="Power Scale results">
          <div className={styles.archiveCopy}>
            <span className="label-tag">Closed poll</span>
            <h3 className={`entity-title entity-title-name ${styles.archiveTitle}`}>Power Scale</h3>
            <p>How the community rated operator power.</p>
            <span className={styles.archiveAction}>Explore the results <span aria-hidden="true">↗</span></span>
          </div>
          <div className={styles.archiveArt} role="group" aria-label="Power Scale top three"><LeaderFigures leaders={previousLeaders}/></div>
        </Link> : <div className={`panel ${styles.archive}`}><h3 className="entity-title">Power Scale</h3><span className="hint">Voting closed · Results hidden</span></div>)}
      </section>}
      <MakerSampleCards samples={makerSamples}/>
    </main>
  </>;
}

async function loadMakerSamples() {
  const {tierListCatalogue}=await import('@/lib/community/catalogues');
  const {makeMakerSamples}=await import('@/lib/tier-list/makerSamples');
  return makeMakerSamples((await tierListCatalogue()).operators);
}

export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/polls',async()=>{
  const {communityPoll}=await import('@/lib/community/catalogues');
  const catalogue=await communityPoll();
  const {pullPollPageCatalogue}=await import('@/lib/polls/pull-poll-catalogue');const pull=await pullPollPageCatalogue();
  return {props:{...catalogue,pullBanners:pull.banners,pullPortraits:pull.portraits,makerSamples:await loadMakerSamples()}};
},{bundledWhenUnpublished:true,finalize:async props=>{
  const pull=props.pullBanners&&props.pullPortraits?null:await (await import('@/lib/polls/pull-poll-catalogue')).pullPollPageCatalogue();
  const makerSamples=props.makerSamples??await loadMakerSamples();
  if(props.skins&&props.previousLeaders)return {...props,makerSamples,...(pull?{pullBanners:pull.banners,pullPortraits:pull.portraits}:{})};
  const {communityPoll}=await import('@/lib/community/catalogues');const catalogue=await communityPoll();
  return {...props,makerSamples,skins:props.skins??catalogue.skins,previousLeaders:props.previousLeaders??catalogue.previousLeaders,...(pull?{pullBanners:pull.banners,pullPortraits:pull.portraits}:{})};
}});
