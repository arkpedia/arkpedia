import ProfileLink from '@/components/friends/ProfileLink';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from '@/lib/account/accountStore';
import { useCommunitySharing } from '@/lib/community/SharingProvider';
import { COMMUNITY_OFF, type CommunityChoices } from '@/lib/community/model';
import InfoPopover from '@/components/ui/InfoPopover';
import styles from './Community.module.css';
import { SERVERS } from '@/lib/account-import/yostar';

export default function CommunitySettings(){
  const account=useAccount(),sharing=useCommunitySharing();
  const [choices,setChoices]=useState<CommunityChoices>(COMMUNITY_OFF),[dirty,setDirty]=useState(false);
  useEffect(()=>{if(!dirty)setChoices(sharing.state?{stats:sharing.state.stats,allowFollowing:!!sharing.state.allowFollowing,profileLink:!!sharing.state.profileLink,profileAutoUpdate:!!sharing.state.profileAutoUpdate,shareTag:sharing.state.shareTag&&sharing.state.openRequests,openRequests:sharing.state.shareTag&&sharing.state.openRequests}:COMMUNITY_OFF);},[sharing.state,dirty]);
  const change=(key:'stats'|'supports'|'allowFollowing'|'profileLink'|'profileAutoUpdate',value:boolean)=>{
    setDirty(true);
    setChoices(previous=>({
      ...previous,
      ...(key==='supports'?{shareTag:value,openRequests:value}:{[key]:value}),
      ...(key==='profileLink'?{profileAutoUpdate:value&&(!sharing.state?.profileLink||!!sharing.state.profileAutoUpdate)}:{}),
    }));
  };
  const slots=account?.profile?.friendSlots,available=slots?Math.max(0,slots.limit-slots.used):null;
  const onlyWithdrawing=!!sharing.state&&Object.entries(choices).every(([key,value])=>!value||sharing.state![key as keyof CommunityChoices]);
  return <div className={`${styles.sharing} reading-copy`}>
    <div className="account-shortcuts"><h3>Community sharing</h3><InfoPopover label="How community sharing works"><p>Optional and separate from private cloud saving. Nothing is shared until you save these choices. You can stop sharing at any time.</p></InfoPopover></div>
    <div className="account-shortcuts">
      <label className="check"><input type="checkbox" checked={choices.stats} disabled={sharing.busy} onChange={e=>change('stats',e.target.checked)} />Contribute to community stats</label>
      <InfoPopover label="About community stats"><p>Shares operator ownership, promotions and levels, masteries, module stages, owned outfits and equipped outfits and saved auto-deploy squad, deployment and recorded skill-activation counts for aggregate statistics. The daily music chart also counts your synced song favourites once per track. Names and friend tags are not included in the public statistics.</p><p>Each opted-in game account contributes its latest import, regardless of age. Stats appear once the selected region or combined All group has 10 contributors, including percentages from smaller owner groups. Unknown builds are excluded. Small samples are for curiosity, not a picture of all players.</p><p>Turning this off removes your contribution. This does not change private cloud saving.</p></InfoPopover>
    </div>
    <div className="account-shortcuts">
      <label className="check"><input type="checkbox" checked={choices.shareTag&&choices.openRequests} disabled={sharing.busy} onChange={e=>change('supports',e.target.checked)} />Share my friend tag and support units</label>
      <InfoPopover label="About support listings"><p>Lists you as accepting friend requests. Your friend tag and equipped support units are shared together; turning this off removes your support-finder listing.</p><p>Imported friend tag: <strong>{account?.doctor??'Import your game account first'}</strong>{account?` · ${SERVERS[account.server].label}`:''}</p><p>Uses the Doctor name and #number from your selected game import. This is self-reported data, not proof of game-account ownership. Public listings can be copied by visitors.</p><p>Makes your imported friend tag, avatar, banner, account level, operator and skin counts, server, three equipped supports, their skill ranks and masteries, selected skills, potentials, equipped outfits and modules, open-slot count and import date public in the support finder.</p><p>Only listings with a confirmed open friend slot and an import from the last seven days appear. Slots can change in-game after import. Full or unknown friend lists stay hidden. No background game-server polling occurs.</p><p>Members can report availability after checking in-game. Three recent full reports, outnumbering Has room reports, temporarily hide your listing. Reports expire after 24 hours; a new import clears them.</p><p>New imports update an existing choice. A different imported game account needs your review. Turning this off removes the support listing; Allow following is separate. Stop all sharing also removes the statistics contribution. Clearing browser data does not withdraw sharing.</p></InfoPopover>
    </div>
    <div className="account-shortcuts">
      <label className="check"><input type="checkbox" checked={choices.allowFollowing} disabled={sharing.busy} onChange={e=>change('allowFollowing',e.target.checked)} />Allow following</label>
      <InfoPopover label="About following"><p>Lets people find and follow your basic profile on Arkpedia: your imported friend tag, server, avatar, banner, account level, operator and skin counts, and import date.</p><p>Independent of support searchability and in-game friend slots. Following saves a profile link in the viewer’s browser; it sends no friend request. Your equipped supports appear only if you also share them.</p><p>Your full operators, builds and skins need separate Direct profile link consent below. Turning off Allow following removes your profile from discovery and followed lists. Your direct link has its own switch.</p></InfoPopover>
    </div>
    <div className="account-shortcuts">
      <label className="check"><input type="checkbox" checked={choices.profileLink} disabled={sharing.busy||!sharing.state||(!account&&!choices.profileLink)} onChange={e=>change('profileLink',e.target.checked)} />Direct profile link</label>
      <InfoPopover label="About direct profile links"><p>Anyone with the link can view your Profile Card, owned operators, recorded builds and owned skins. Save community choices to publish or revoke the link. Allow following and support searchability have their own settings.</p><p>Enable Update after each import to publish future imports of this game account at the same link. With updates off, save these choices again to publish a newer import.</p><p>Your game UID, resources, pull history, biography and login details stay private.</p></InfoPopover>
      {choices.profileLink&&sharing.state?.profileLink&&<ProfileLink label="Copy link" />}
    </div>
    {choices.profileLink&&<div className="account-shortcuts">
      <label className="check"><input type="checkbox" checked={choices.profileAutoUpdate} disabled={sharing.busy||(!account&&!choices.profileAutoUpdate)} onChange={e=>change('profileAutoUpdate',e.target.checked)} />Update after each import</label>
    </div>}
    <p role="status">{sharing.state?.reportedFull?'Your listing is hidden after recent full friend-list reports. Re-import to update availability.':sharing.state?.listed?'Your equipped supports are listed.':choices.openRequests
      ? available===null?'Re-import to check your friend slots. Your listing stays hidden until availability is known.':available===0?'Your friend list is full. Your listing stays hidden.':`${available} open friend slots in the last import. Save your choices to publish; listings expire after seven days.`
      :'Your support listing is off.'}</p>
    {sharing.error&&<p role="alert">{sharing.error}</p>}
    <div className="account-shortcuts">
      <button type="button" className="primary btn-sm" disabled={sharing.busy||!sharing.state||(!dirty&&(!choices.profileLink||account?.importedAt===sharing.state?.profileImportedAt))||(!account&&!onlyWithdrawing)} onClick={()=>void sharing.save(choices).then(ok=>{if(ok)setDirty(false);})}>{sharing.busy?'Saving…':'Save community choices'}</button>
      <button type="button" className="ghost btn-sm" disabled={sharing.busy||!sharing.state} onClick={()=>void sharing.stop().then(ok=>{if(ok){setDirty(false);setChoices(COMMUNITY_OFF);}})}>Stop all sharing</button>
      {(!sharing.state||sharing.error)&&<button type="button" className="ghost btn-sm" disabled={sharing.busy} onClick={()=>{setDirty(false);void sharing.refresh();}}>Reload choices</button>}
      <Link href="/community/support-units">Find support units</Link>
    </div>
  </div>;
}
