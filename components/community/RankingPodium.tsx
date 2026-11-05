import { ContentImg } from '@/components/content/ContentImage';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import Link from 'next/link';
import styles from './Statistics.module.css';

type Entry = {id:string;rank:number;name:string;operator?:string;image:string|null;href?:string;onClick?:()=>void;unit?:string;skillIcon?:string|null}&({points:number;firsts:number;value?:never;detail?:never}|{value:string;detail:string;points?:never;firsts?:never});
export default function RankingPodium({entries,portrait=false}:{entries:Entry[];portrait?:boolean}){
  return <ol className={`${styles.podium}${portrait?` ${styles.portraitPodium}`:''}`} aria-label="Top three results">{entries.slice(0,3).map(entry=><li key={entry.id} value={entry.rank} data-rank={entry.rank} className={styles.podiumEntry}>
    <div className={styles.podiumDisplay}>
      <div className={styles.podiumArt}>{entry.image&&<ResponsiveSkinArtwork src={entry.image} alt="" width={180} height={180} sizes="180px"/>}</div>
      <div className={`${styles.podiumName} reading-copy`}><strong className="entity-title entity-title-sm entity-title-name">{entry.href?<Link href={entry.href}>{entry.name}</Link>:entry.onClick?<button className="btn-bare" onClick={entry.onClick} aria-haspopup="dialog" aria-label={`${entry.name}: show rating statistics`}>{entry.name}</button>:entry.name}</strong>{entry.operator&&<small className={styles.podiumSkill}>{entry.skillIcon&&<ContentImg src={entry.skillIcon} alt="" width={28} height={28}/>} {entry.operator}</small>}</div>
      <div className={styles.podiumStep}><strong className={styles.podiumRank}>#{entry.rank}</strong></div>
    </div>
    <div className={styles.podiumScore}><span className={styles.podiumValue}>{entry.value??`${entry.points.toLocaleString('en-US')} points`}</span>{entry.unit&&<small>{entry.unit}</small>}{entry.value!==undefined?entry.detail&&<small>{entry.detail}</small>:<small>{entry.firsts} first-place {entry.firsts===1?'vote':'votes'}</small>}</div>
  </li>)}</ol>;
}
