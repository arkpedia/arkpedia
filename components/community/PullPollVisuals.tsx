import {ApplicationImage,ContentImg} from '@/components/content/ContentImage';
import {STAMP_LABELS,stampKey,type PollBanner,type PollPortrait,type Want,type Stamp,type OwnedPotentials} from '@/lib/polls/pull-poll';
import {applicationBannerArt} from '@/lib/polls/pull-poll-art';
import styles from './PullPoll.module.css';
export function OperatorTile({name,want,portraits,small=false,owned=0}:{name:string;want?:Want;portraits:Record<string,PollPortrait>;small?:boolean;owned?:number}){
  const portrait=portraits[name],planned=(want??0)>owned,label=want===-1?'Nice to have':want===0?"Don't Want":want?`Potential ${want}`:'Unanswered';
  return <span className={styles.operatorTile}>
    <span className={`poll-portrait tier-${portrait?.rarity??6} ${small?styles.smallPortrait:''}`} role="img" aria-label={`${name}: ${label}${owned?`, owned P${owned}`:''}`} title={`${name} · ${label}`}>
      <span aria-hidden="true">{name.slice(0,2)}</span>{portrait?.icon&&<ContentImg src={portrait.icon} alt="" width="52" height="52" onError={e=>{e.currentTarget.style.visibility='hidden';}} onLoad={e=>{e.currentTarget.style.visibility='visible';}}/>}
      {(want!==undefined||owned>0)&&<span className="poll-potential" data-want={planned?'pull':owned?'owned':want===-1?'maybe':'skip'} aria-hidden="true">{planned?`P${want}`:owned?`P${owned}`:want===-1?'?':'×'}</span>}
    </span>
    {owned>0&&<span className="poll-owned">Owned</span>}
  </span>;
}
export function VerdictStamp({value,label}:{value:Stamp;label?:string}){
  return <span className="poll-stamp" data-stamp={value}>{label??STAMP_LABELS[value]}</span>;
}
export function BannerArt({banner,choices,portraits,stamp,owned={}}:{banner:PollBanner;choices?:Record<string,Want>;portraits:Record<string,PollPortrait>;stamp?:{value:Stamp;label:string};owned?:OwnedPotentials}){
  const value=stamp?.value??stampKey(choices,banner,portraits,owned),applicationArt=applicationBannerArt(banner);
  return <div className={styles.art}>
    {banner.artwork && banner.image ? <a href={banner.artwork.original} target="_blank" rel="noreferrer" aria-label={`View full artwork: ${banner.artwork.description}`}>
      <ContentImg alreadyPinned src={banner.image} width={3840} height={1634} alt={banner.artwork.description}/>
    </a> : banner.image?<ContentImg src={banner.image} alt="" width="1024" height="559" onError={e=>{e.currentTarget.style.visibility='hidden';}} onLoad={e=>{e.currentTarget.style.visibility='visible';}}/>:applicationArt?<ApplicationImage asset={applicationArt} alt="" width={1024} height={559}/>:<span className={styles.artFallback}>Banner artwork pending</span>}
    {value&&<VerdictStamp value={value} label={stamp?.label}/>}
  </div>;
}
export const bannerTitle=(banner:PollBanner)=>banner.name.replace(/^\[[^\]]*\]\s*/,'');
