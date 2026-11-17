import { useCallback, useEffect, useRef, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import DataLink from '@/components/account/DataLink';
import { useAccountActions } from '@/components/account/AccountActions';
import { useAccount, useOtherAccounts } from '@/lib/account/accountStore';
import { makeFriendFile, shareableRoster } from '@/lib/account/friendFile';
import { readRoster } from '@/lib/planner/roster';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { useCommunitySharing } from '@/lib/community/SharingProvider';
import { friendRequest } from '@/lib/friends/useSharedFriends';
import { publicFriendFile, type ProfileSharingState } from '@/lib/friends/sharedProfile';

export default function ProfileLink({manage=false,onMessage}:{manage?:boolean;onMessage?:(text:string,error?:boolean)=>void}) {
  const account=useAccount(),others=useOtherAccounts(),sync=useCloudSync(),sharing=useCommunitySharing(),actions=useAccountActions();
  const owner=sync.remote?.user.id??null;
  const identity=`${owner}:${account?.server}:${account?.profile?.uid}:${account?.importedAt}`;
  const identityRef=useRef(identity);identityRef.current=identity;
  const generation=useRef(0),notice=useRef(onMessage);notice.current=onMessage;
  const [loaded,setLoaded]=useState<{identity:string;state:ProfileSharingState}|null>(null);
  const state=loaded?.identity===identity?loaded.state:null;
  const [open,setOpen]=useState(false),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const announce=useCallback((text:string,error=false)=>{setMessage(text);setFailed(error);notice.current?.(text,error);},[]);
  const readFresh=useCallback(async(signal?:AbortSignal)=>{
    const result=await friendRequest<ProfileSharingState>('?mine=1',{signal:signal??AbortSignal.timeout(15000)});
    if(result.owner!==owner)throw Error('Your signed-in account changed. Reopen profile sharing.');
    return result;
  },[owner]);
  useEffect(()=>{
    ++generation.current;setLoaded(null);setOpen(false);setChecked(false);setBusy(false);setMessage('');setFailed(false);
  },[identity]);
  const copy=async(result:ProfileSharingState)=>{
    if(!result.id||!result.enabled)throw Error('Publish your collection before copying a profile link.');
    const link=new URL('/friends/profile',window.location.origin);link.searchParams.set('id',result.id);
    try{await navigator.clipboard.writeText(link.href);announce('Profile link copied.');return true;}
    catch{announce('The clipboard is unavailable. Open the profile link below to copy it.',true);return false;}
  };
  async function prepare(){
    if(!owner||!sync.remote?.profile){actions.open('settings');announce('Sign in or finish your Arkpedia account, then create your profile link.');return;}
    const request=++generation.current,capture=identity;setBusy(true);announce('');
    try{
      const fresh=await readFresh();
      if(generation.current!==request||identityRef.current!==capture)return;
      setLoaded({identity:capture,state:fresh});
      const current=fresh.enabled&&(!account||(fresh.server===account.server&&fresh.importedAt===account.importedAt));
      if(!manage&&current){if(!await copy(fresh))setOpen(true);}
      else{setChecked(false);setOpen(true);void sharing.refresh();}
    }catch(reason){if(identityRef.current===capture)announce(reason instanceof Error?reason.message:'Profile sharing could not load.',true);}
    finally{if(identityRef.current===capture)setBusy(false);}
  }
  async function publish(){
    if(!checked||!account||!owner||busy)return;
    const capture=identity,request=++generation.current;setBusy(true);announce('Publishing your collection…');
    try{
      const profile=publicFriendFile(makeFriendFile(account,shareableRoster(account,Object.values(others),readRoster())));
      const before=await readFresh();
      if(identityRef.current!==capture||generation.current!==request)return;
      if(!await sharing.save({...before.choices,shareTag:true,openRequests:true})){await sharing.refresh();throw Error('Review your community sharing choices and try again.');}
      const fresh=await readFresh();
      if(identityRef.current!==capture||generation.current!==request)return;
      if(!fresh.choices.shareTag||!fresh.choices.openRequests)throw Error('Sharing changed on another device. Review it again.');
      const result=await friendRequest<ProfileSharingState>('',{method:'PUT',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({owner,revision:fresh.revision,communityRevision:fresh.communityRevision,action:'consent',profile})});
      if(identityRef.current!==capture||generation.current!==request||result.owner!==owner)return;
      setLoaded({identity:capture,state:result});
      if(await copy(result))setOpen(false);
    }catch(reason){if(identityRef.current===capture)announce(reason instanceof Error?reason.message:'Your profile could not be published.',true);}
    finally{if(identityRef.current===capture)setBusy(false);}
  }
  async function copyExisting(){
    const capture=identity,request=++generation.current;setBusy(true);
    try{
      const fresh=await readFresh();if(identityRef.current!==capture||generation.current!==request)return;
      setLoaded({identity:capture,state:fresh});await copy(fresh);
    }catch(reason){if(identityRef.current===capture)announce(reason instanceof Error?reason.message:'The profile link could not load.',true);}
    finally{if(identityRef.current===capture)setBusy(false);}
  }
  async function withdraw(){
    if(!owner||busy)return;
    const capture=identity,request=++generation.current;setBusy(true);announce('Stopping full-profile sharing…');
    try{
      const fresh=await readFresh();if(identityRef.current!==capture||generation.current!==request)return;
      const result=await friendRequest<ProfileSharingState>('',{method:'DELETE',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({owner,revision:fresh.revision})});
      if(identityRef.current!==capture||generation.current!==request||result.owner!==owner)return;
      setLoaded({identity:capture,state:result});setChecked(false);announce('Your full collection is no longer public. Your support-sharing choice is unchanged.');
    }catch(reason){if(identityRef.current===capture)announce(reason instanceof Error?reason.message:'Profile sharing could not stop.',true);}
    finally{if(identityRef.current===capture)setBusy(false);}
  }
  const current=state?.enabled&&(!account||(state.server===account.server&&state.importedAt===account.importedAt));
  const link=state?.enabled&&state.id&&typeof window!=='undefined'?new URL(`/friends/profile?id=${state.id}`,window.location.origin).href:null;
  return <>
    <button type="button" className="btn-sm" onClick={()=>void prepare()} disabled={busy||sync.status==='loading'} aria-haspopup={manage||!current?'dialog':undefined}>{manage?'Public profile link':'Copy Profile Link'}</button>
    {!onMessage&&message&&!open&&<p role={failed?'alert':'status'}>{message}</p>}
    {open&&<ImportDialog title="Public profile link" onClose={()=>setOpen(false)} dismissible={!busy}>
      {state?.enabled&&<><p>Your published collection is public.{state.importedAt?` Snapshot imported ${new Date(state.importedAt).toLocaleDateString()}.`:''}</p><p>{link&&<a href={link} target="_blank" rel="noopener noreferrer">View shared profile ↗</a>}</p><div className="account-shortcuts"><button type="button" className="btn-sm" disabled={busy} onClick={()=>void copyExisting()}>Copy existing link</button><button type="button" className="danger btn-sm" disabled={busy} onClick={()=>void withdraw()}>Stop sharing full profile</button></div></>}
      {account?<>
        <p>Publish your owned operators, recorded builds, skins and profile appearance. Anyone with the link can view them. This also enables “Share my friend tag and support units” so recent imports with open slots can appear in Find Friends.</p>
        <p className="hint">Your game UID, resources, pull history, biography and login details stay private. Unowned planner goals are excluded. The link shows the snapshot you publish here; publish again after an import to update it.</p>
        <p className="hint">Stopping full-profile sharing removes the collection from Arkpedia. Previously copied files cannot be recalled. Turn off friend-tag sharing to remove the support listing too.</p>
        <label className="check"><input type="checkbox" checked={checked} disabled={busy} onChange={event=>setChecked(event.target.checked)} />Make this collection public</label>
        <button type="button" className="primary btn-sm" disabled={!checked||busy||sharing.busy||!sharing.state} onClick={()=>void publish()}>{busy?'Publishing…':state?.enabled?'Publish latest snapshot and copy link':'Publish and copy link'}</button>
      </>:<p>Import your Arknights account to publish a collection. <DataLink /></p>}
      {message&&<p role={failed?'alert':'status'}>{message}</p>}
      {sharing.error&&<p role="alert">{sharing.error}</p>}
    </ImportDialog>}
  </>;
}
