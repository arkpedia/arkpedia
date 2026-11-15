import {ApplicationImage,ContentImg} from '@/components/content/ContentImage';
import {STAMP_LABELS,stampKey,type PollBanner,type PollPortrait,type Want,type Stamp} from '@/lib/polls/pull-poll';
import {applicationBannerArt} from '@/lib/polls/pull-poll-art';
import styles from './PullPoll.module.css';
export function OperatorTile({name,want,portraits,small=false}:{name:string;want?:Want;portraits:Record<string,PollPortrait>;small?:boolean}){
  const portrait=portraits[name],label=want===-1?'Good to have':want===0?'Not want':want?`Potential ${want}`:'Unanswered';
  return <span className={`poll-portrait tier-${portrait?.rarity??6} ${small?styles.smallPortrait:''}`} role="img" aria-label={`${name}: ${label}`} title={`${name} · ${label}`}>
    <span aria-hidden="true">{name.slice(0,2)}</span>{portrait?.icon&&<ContentImg src={portrait.icon} alt="" width="52" height="52" onError={e=>{e.currentTarget.style.visibility='hidden';}} onLoad={e=>{e.currentTarget.style.visibility='visible';}}/>}
    {want!==undefined&&<span className="poll-potential" data-want={want===-1?'maybe':want===0?'skip':'pull'} aria-hidden="true">{want===-1?'?':want===0?'×':`P${want}`}</span>}
  </span>;
}
export function VerdictStamp({value,label}:{value:Stamp;label?:string}){
  return <span className="poll-stamp" data-stamp={value}>{label??STAMP_LABELS[value]}</span>;
}
export function BannerArt({banner,choices,portraits,stamp}:{banner:PollBanner;choices?:Record<string,Want>;portraits:Record<string,PollPortrait>;stamp?:{value:Stamp;label:string}}){
  const value=stamp?.value??stampKey(choices,banner,portraits),applicationArt=applicationBannerArt(banner);
  return <div className={styles.art}>
    {banner.image?<ContentImg src={banner.image} alt="" width="1024" height="559" onError={e=>{e.currentTarget.style.visibility='hidden';}} onLoad={e=>{e.currentTarget.style.visibility='visible';}}/>:applicationArt?<ApplicationImage asset={applicationArt} alt="" width={1024} height={559}/>:<span className={styles.artFallback}>Banner artwork pending</span>}
    <span className={`poll-banner-tag${banner.limited?' tier-fill-6':''}`} data-limited={!!banner.limited}>{banner.category||'Global banner'}</span>
    {value&&<VerdictStamp value={value} label={stamp?.label}/>}
  </div>;
}
export const bannerTitle=(banner:PollBanner)=>banner.name.replace(/^\[[^\]]*\]\s*/,'');
