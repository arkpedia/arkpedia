import type { ReactNode } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { profileArtPath } from '@/lib/account/portraits';
import styles from './Friends.module.css';
import { SupportTile } from '@/components/account/ProfileCard';
import type { SupportUnit } from '@/lib/account/accountStore';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

/** Shared friend-import presentation, also used by the public equipped-support finder. */
export default function FriendCard({name,avatar,background,metadata,supports,actions,onProfile,profileLabel}:{
  name:string;avatar?:string; background?:string;metadata:ReactNode;supports:ReactNode;actions:ReactNode;
  profileLabel?:string;
  onProfile?:(trigger:HTMLButtonElement)=>void;
}){
  const summary=<>
    <ContentImg className={styles.friendAvatar} src={avatar??'/essential-icons/Arkpedia.webp'} alt="" />
    <span className={styles.friendIdentity}><strong>{name}</strong>{metadata}</span>
    <span className={styles.friendSupportGroup}>{supports}</span>
  </>;
  return <article className={`panel profile-strip ${styles.friendRow}`}>
    <ContentImg className="profile-strip-background" src={background??profileArtPath('profile-namecards','nc_rhodes_default-strip')} alt="" aria-hidden="true" />
    {onProfile?<button type="button" className={`btn-bare ${styles.friendSummary}`} aria-label={profileLabel??`View ${name} profile`} aria-haspopup="dialog" onClick={event=>onProfile(event.currentTarget)}>{summary}</button>:<div className={styles.friendSummary}>{summary}</div>}
    <div className={`${styles.actions} ${styles.friendActions}`}>{actions}</div>
  </article>;
}

/** Exactly the same portrait row on imported friends and community listings. */
export function FriendSupports({units,map,onSelect}:{units:readonly SupportUnit[];map:GameAccountMap;onSelect?:(unit:SupportUnit)=>void}){
  if(!units.length)return null;
  return <span className={styles.friendSupports}>{units.map((unit,index)=>onSelect?
    <button key={index} type="button" className={`btn-bare ${styles.supportButton}`} aria-label={`View ${unit.name} support details`} aria-haspopup="dialog" onClick={()=>onSelect(unit)}>
      <SupportTile unit={unit} full={false} map={map} />
    </button>:<SupportTile key={index} unit={unit} full={false} map={map} />)}</span>;
}
