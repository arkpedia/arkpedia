import Link from 'next/link';
import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { withContentPage } from '@/lib/content/server';
import styles from '@/components/community/Polls.module.css';

interface Outfit {image:string;name:string;operator:string}
interface Props {showcase:Outfit[];previousArt:string[]}

export default function Polls({showcase,previousArt}:Props){
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
          <div className={styles.showcase} role="group" aria-label="Outfit showcase">{showcase.map(outfit=><figure key={outfit.image}>
            <ResponsiveSkinArtwork src={outfit.image} alt={`${outfit.name} by ${outfit.operator}`} width={400} height={440} sizes="(max-width: 720px) 65vw, 440px"/>
          </figure>)}</div>
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
          <span className={styles.archiveArt} aria-hidden="true">{previousArt.map(src=><ResponsiveSkinArtwork key={src} src={src} alt="" width={180} height={180} sizes="180px"/>)}</span>
        </Link>
      </section>
    </main>
  </>;
}

export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/polls',async()=>{
  const {communityPoll}=await import('@/lib/community/catalogues');
  const catalogue=await communityPoll();
  return {props:{showcase:catalogue.showcase,previousArt:catalogue.previousArt}};
},{bundledWhenUnpublished:true});
