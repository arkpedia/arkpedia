import Link from 'next/link';
import {useMemo} from 'react';
import {useSkinRatings} from '@/lib/polls/useSkinRatings';
import {skinRatingRows} from '@/lib/polls/skin-rating-statistics';
import type {PollSkin} from '@/lib/polls/skin-poll';
import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { withContentPage } from '@/lib/content/server';
import styles from '@/components/community/Polls.module.css';

interface Outfit {image:string;name:string;operator:string}
interface Leader {id:string;name:string;operator?:string;image:string|null;rank:number;href?:string}
interface Props {showcase:Outfit[];previousArt:string[];skins?:PollSkin[];previousLeaders?:Leader[]}

function LeaderFigures({leaders}:{leaders:Leader[]}){
  return <>{[1,0,2].map((position,slot)=>{const leader=leaders[position];if(!leader)return <figure key={`empty-${slot}`} aria-hidden="true"/>;
    const art=leader.image?<ResponsiveSkinArtwork src={leader.image} alt={`${leader.name}${leader.operator?` by ${leader.operator}`:''}`} width={400} height={440} sizes="(max-width: 720px) 30vw, 240px"/>:<span className="art-placeholder">Artwork unavailable</span>;
    return <figure key={leader.id} data-rank={leader.rank} data-podium-slot={slot}>
      {leader.href?<Link className={`btn-bare ${styles.leaderImage}`} href={leader.href} aria-label={`View results for ${leader.name}`} title={leader.name}>{art}</Link>:<span className={styles.leaderImage}>{art}</span>}
      <figcaption className={`hint ${styles.leaderCaption}`}><strong>#{leader.rank}</strong><span>{leader.name}</span></figcaption>
    </figure>;
  })}</>;
}
export default function Polls({skins=[],previousLeaders=[]}:Props){
  const {result,error}=useSkinRatings(null);
  const leaders=useMemo(()=>skinRatingRows(result?.ranking??[],skins,'skins').slice(0,3).map(row=>({...row,href:`/polls/favourite-skins?view=results&detail=${encodeURIComponent(row.id)}`})),[result,skins]);
  return <>
    <PageMeta title="Community polls" description="Vote in Arkpedia community polls and explore previous results." path="/polls"/>
    <PageHeader slim eyebrow="Rhodes Island // Community" title="Community polls" sub="Pick your favourites. Follow the community’s verdict."/>
    <main className={styles.page}>
      <section className={`panel ${styles.feature}`} aria-labelledby="drip-awards-title">
        <div className={styles.featureBody}>
          <div className={styles.copy}>
            <span className="label-tag">Open poll · Test poll</span>
            <h2 id="drip-awards-title" className={`entity-title entity-title-name ${styles.title}`}>Arkpedia Drip Awards</h2>
            <p className={styles.subtitle}>A very serious poll, for serious poll testing</p>
            <p className={styles.invitation}>Rate a few outfits now. Come back for the rest.</p>
            <div className={styles.actions}>
              <Link className="primary btn-sm" href="/polls/favourite-skins">Rate skins</Link>
              <Link className="ghost" href="/polls/favourite-skins?view=results">Live ranking</Link>
            </div>
            <p className={`hint ${styles.access}`}>Rankings are public.<br/>An Arkpedia account is required to vote.</p>
          </div>
          <div className={styles.showcase} role="group" aria-label="Current skin leaders">{leaders.length?<LeaderFigures leaders={leaders}/>:<p className={`hint ${styles.emptyLeaders}`} role="status">{error?'Live leaders are temporarily unavailable.':result?'No ratings yet. Be the first to rate a skin.':'Loading live leaders…'}</p>}</div>
        </div>
        <dl className={styles.ratingFacts} aria-label="How skin ratings work">
          <div><dt>Rating scale</dt><dd>1–10</dd></div><div><dt>No limit</dt><dd>Any skin</dd></div><div><dt>Progress saved</dt><dd>Any time</dd></div>
        </dl>
      </section>
      <section className={styles.previous} aria-labelledby="previous-polls-title">
        <h2 id="previous-polls-title" className="section-title">Previous results</h2>
        <Link className={`directory-card lift ${styles.archive}`} href="/polls/power-scale" aria-label="Power Scale results">
          <div className={styles.archiveCopy}>
            <span className="label-tag">Closed poll</span>
            <h3 className={`entity-title entity-title-name ${styles.archiveTitle}`}>Power Scale</h3>
            <p>How the community rated operator power.</p>
            <span className={styles.archiveAction}>Explore the results <span aria-hidden="true">↗</span></span>
          </div>
          <div className={styles.archiveArt} role="group" aria-label="Power Scale top three"><LeaderFigures leaders={previousLeaders}/></div>
        </Link>
      </section>
    </main>
  </>;
}

export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/polls',async()=>{
  const {communityPoll}=await import('@/lib/community/catalogues');
  const catalogue=await communityPoll();
  return {props:catalogue};
},{bundledWhenUnpublished:true,finalize:async props=>{
  if(props.skins&&props.previousLeaders)return props;
  const {communityPoll}=await import('@/lib/community/catalogues');const catalogue=await communityPoll();
  return {...props,skins:props.skins??catalogue.skins,previousLeaders:props.previousLeaders??catalogue.previousLeaders};
}});
