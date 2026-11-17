import { useCallback, useMemo, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import ProfileCard from '@/components/account/ProfileCard';
import { tabPanelProps } from '@/components/ui/Tabs';
import AccountContentTabs from '@/components/account/AccountContentTabs';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import FriendCollection from './FriendCollection';
import FriendSupportDetails from './FriendSupportDetails';
import SharedFriendCard from './SharedFriendCard';
import { assistantCatalogue } from '@/lib/account/portraits';
import type { FriendOperator, FriendSkin } from '@/lib/account/friendCatalogue';
import { useReleaseTable } from '@/lib/content/context';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { playerSupportUnits } from '@/lib/community/supportUnits';
import { useSharedFriend } from '@/lib/friends/useSharedFriends';
import type { SharedFriend } from '@/lib/friends/sharedProfile';
import styles from './Friends.module.css';

export function SharedProfileContent({record,operators,skins,standalone=false}:{record:SharedFriend;operators:FriendOperator[];skins:FriendSkin[];standalone?:boolean}) {
  const map=useReleaseTable<GameAccountMap>('game-account-map');
  const [view,setView]=useState<'profile'|'operators'|'skins'>(standalone?'profile':'operators'),[supportsOpen,setSupportsOpen]=useState(false);
  const closeSupports=useCallback(()=>setSupportsOpen(false),[]);
  const {outfitArt,outfitNames}=useMemo(()=>assistantCatalogue(map,skins),[map,skins]);
  const shared=record.profile;
  const floor=useHeightFloor(record.player.id);
  const tabId=standalone?'shared-account-content':'shared-profile-content';
  const tabs=shared&&<AccountContentTabs id={tabId} label="Shared profile" sticky={standalone} value={view} onChange={setView} options={[
    {value:'profile',label:'Profile'}, {value:'operators',label:'Operators'}, {value:'skins',label:'Skins'},
  ]} />;
  return <>
    {shared?<>
      {tabs}
      <div ref={standalone?floor.ref:undefined} {...tabPanelProps(tabId,view)} className="account-tab-content">
        {view==='profile'?<section className="op-section">
          <ProfileCard account={shared.account} map={map} outfits={shared.account.skins.length} outfitArt={outfitArt} outfitNames={outfitNames} onOperators={()=>setView('operators')} onSkins={()=>setView('skins')} />
          <p className="hint">Shared collection · imported {new Date(shared.account.importedAt).toLocaleDateString()}. Recorded builds are self-reported snapshots.</p>
        </section>:<FriendCollection key={view} friend={shared} operators={operators} skins={skins} view={view} onClose={()=>{}} inline />}
        {standalone&&floor.spacer}
      </div>
    </>:<>
      <p>This player shares their equipped supports. Their full collection is not public.</p>
      <SharedFriendCard summary={record} map={map} operators={operators} onOpen={()=>setSupportsOpen(true)} actions={<button type="button" className="btn-sm" onClick={()=>setSupportsOpen(true)}>View support builds</button>} />
    </>}
    {supportsOpen&&<FriendSupportDetails name={record.player.friendTag} units={playerSupportUnits(record.player,operators)} map={map} operators={operators} onClose={closeSupports} />}
  </>;
}

export default function SharedProfileDialog({id,operators,skins,onClose}:{id:string;operators:FriendOperator[];skins:FriendSkin[];onClose:()=>void}) {
  const {record,error,retry}=useSharedFriend(id);
  return <ImportDialog title={record?`${record.player.friendTag} · Shared profile`:'Shared profile'} onClose={onClose} className={styles.profileDialog}>
    {record?<SharedProfileContent record={record} operators={operators} skins={skins} />:error?<p role="alert">{error} <button className="btn-sm" type="button" onClick={retry}>Retry</button></p>:<p role="status">Checking shared profile…</p>}
  </ImportDialog>;
}
