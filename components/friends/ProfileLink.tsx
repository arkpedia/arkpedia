import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account/accountStore';
import { useRouter } from 'next/router';
import { useCommunitySharing } from '@/lib/community/SharingProvider';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { friendRequest } from '@/lib/friends/useSharedFriends';
import type { ProfileSharingState } from '@/lib/friends/sharedProfile';

export default function ProfileLink({label='Copy Profile Link',onMessage}:{label?:string;onMessage?:(text:string,error?:boolean)=>void}) {
  const account=useAccount();
  const router=useRouter(),sharing=useCommunitySharing(),sync=useCloudSync();
  const identity=`${sync.remote?.user.id}:${account?.server}:${account?.profile?.uid}:${account?.importedAt}`;
  const currentIdentity=useRef(identity);currentIdentity.current=identity;
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[link,setLink]=useState('');
  useEffect(()=>{setLink('');setMessage('');setFailed(false);},[identity]);
  async function copy(){
    const capture=identity;
    setBusy(true);setMessage('');setLink('');setFailed(false);
    try{
      const state=sharing.state?.profileLink?await friendRequest<ProfileSharingState>('?mine=1',{signal:AbortSignal.timeout(15000)}):null;
      if(currentIdentity.current!==capture)return;
      if(!state?.enabled||!state.id){await router.replace({pathname:router.pathname,query:{...router.query,settings:'community'}},undefined,{shallow:true,scroll:false});return;}
      if(state.owner!==sync.remote?.user.id)throw Error('Your signed-in account changed. Review sharing again.');
      const url=new URL(`/friends/profile?id=${state.id}`,window.location.origin).href;
      try{await navigator.clipboard.writeText(url);setMessage('Profile link copied.');onMessage?.('Profile link copied.');}
      catch{setLink(url);setMessage('Open the profile link to copy its address.');}
    }catch(reason){if(currentIdentity.current!==capture)return;const text=reason instanceof Error?reason.message:'The profile link could not load.';setFailed(true);setMessage(text);onMessage?.(text,true);}
    finally{setBusy(false);}
  }
  return <><button type="button" className="btn-sm" disabled={busy||sharing.busy||sync.status==='loading'} onClick={()=>void copy()}>{busy?'Checking link…':label}</button>
    {!onMessage&&message&&<p role={failed?'alert':'status'}>{message}</p>}
    {link&&<a href={link} target="_blank" rel="noopener noreferrer">View shared profile ↗</a>}
  </>;
}
