import { useCallback, useMemo, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import ProfileCard from '@/components/account/ProfileCard';
import SegmentedControl from '@/components/ui/SegmentedControl';
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

export function SharedProfileContent({record,operators,skins}:{record:SharedFriend;operators:FriendOperator[];skins:FriendSkin[]}) {
  const map=useReleaseTable<GameAccountMap>('game-account-map');
  const [view,setView]=useState<'operators'|'skins'>('operators'),[supportsOpen,setSupportsOpen]=useState(false);
  const closeSupports=useCallback(()=>setSupportsOpen(false),[]);
  const {outfitArt,outfitNames}=useMemo(()=>assistantCatalogue(map,skins),[map,skins]);
  const shared=record.profile;
  return <>
    {shared?<>
      <ProfileCard account={shared.account} map={map} outfits={shared.account.skins.length} outfitArt={outfitArt} outfitNames={outfitNames} onOperators={()=>setView('operators')} onSkins={()=>setView('skins')} />
      <p className="hint">Shared collection · imported {new Date(shared.account.importedAt).toLocaleDateString()}. Recorded builds are self-reported snapshots.</p>
      <SegmentedControl label="Shared collection" value={view} onChange={setView} options={[{value:'operators',label:'Operators',count:shared.account.operators.length},{value:'skins',label:'Skins',count:shared.account.skins.length}]} />
      <FriendCollection key={view} friend={shared} operators={operators} skins={skins} view={view} onClose={()=>{}} inline />
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
