import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { publicFriendFile } from '@/lib/friends/sharedProfile';
import { makeFriendFile, shareableRoster } from '@/lib/account/friendFile';
import { readRoster } from '@/lib/planner/roster';
import { useAccount, useOtherAccounts } from '@/lib/account/accountStore';
import { COMMUNITY_OFF, communitySnapshot, type CommunityChoices, type CommunityState } from './model';

interface Sharing {
  state:CommunityState|null; busy:boolean; error:string;
  save:(choices:CommunityChoices)=>Promise<boolean>; stop:()=>Promise<boolean>; refresh:()=>Promise<void>;
}
const Context=createContext<Sharing|null>(null);
export const useCommunitySharing=()=>{const value=useContext(Context);if(!value)throw Error('Missing community sharing provider');return value;};
export default function SharingProvider({children}:{children:ReactNode}){
  const {remote}=useCloudSync(),account=useAccount(),others=useOtherAccounts(),owner=remote?.user.id??null;
  const [state,setState]=useState<CommunityState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [loadedFor,setLoadedFor]=useState<string|null>(null);
  const activeState=loadedFor===owner?state:null;
  const accountIdentity=`${owner}:${account?.server}:${account?.profile?.uid}:${account?.importedAt}`;
  const importedIdentity=useRef(accountIdentity);importedIdentity.current=accountIdentity;
  const ownerRef=useRef(owner),current=useRef(state),inflight=useRef(false),seen=useRef('');
  ownerRef.current=owner;current.current=activeState;
  const request=useCallback(async(method:string,body?:unknown)=>{
    const response=await fetch('/api/community/sharing',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error??'Community sharing could not update.');return data as CommunityState;
  },[]);
  const acceptState=useCallback((data:CommunityState)=>{
    setState(previous=>previous&&previous.revision>data.revision?previous:data);
  },[]);
  const refresh=useCallback(async()=>{
    const identity=ownerRef.current;if(!identity)return;
    try{const data=await request('GET');if(ownerRef.current===identity){acceptState(data);setLoadedFor(identity);setError('');}}
    catch(e){if(ownerRef.current===identity)setError(e instanceof Error?e.message:'Could not read community choices.');}
  },[request,acceptState]);
  useEffect(()=>{setState(null);setLoadedFor(null);setError('');seen.current='';void refresh();},[owner,refresh]);
  useEffect(()=>{const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
  async function write(choices:CommunityChoices,action:'consent'|'refresh'='consent'){
    const identity=ownerRef.current,previous=current.current,capture=accountIdentity;
    if(!identity||!previous||inflight.current)return false;
    const off=!choices.stats&&!choices.shareTag&&!choices.openRequests&&!choices.allowFollowing&&!choices.profileLink;
    const withdrawing=Object.entries(choices).every(([key,value])=>!value||previous[key as keyof CommunityChoices])&&Object.entries(choices).some(([key,value])=>!value&&previous[key as keyof CommunityChoices]);
    if(!off&&!account&&!withdrawing){setError('Import your game account before sharing.');return false;}
    inflight.current=true;setBusy(true);setError('');
    try{
      const publishProfile=account&&choices.profileLink&&!withdrawing&&(action==='consent'||choices.profileAutoUpdate)&&
        (!previous.profileLink||account.importedAt!==previous.profileImportedAt);
      const data=await request(off?'DELETE':'PUT',{
        owner:identity,revision:previous.revision,action,choices,
        ...(!off&&account&&!withdrawing?{snapshot:communitySnapshot(account,choices)}:{}),
        ...(publishProfile?{publicProfile:publicFriendFile(makeFriendFile(account,shareableRoster(account,Object.values(others),readRoster())))}:{}),
      });
      if(ownerRef.current!==identity)return false;
      // The saved choices still apply to the signed-in owner if another import arrived during the write.
      acceptState(data);
      return importedIdentity.current===capture;
    }catch(e){if(ownerRef.current===identity)setError(e instanceof Error?e.message:'Community sharing could not update.');return false;}
    finally{inflight.current=false;setBusy(false);}
  }
  // An import can refresh an existing opt-in, never create consent or change game identity.
  useEffect(()=>{
    if(!owner||loadedFor!==owner||!state||!account||busy||inflight.current)return;
    const {stats,shareTag,openRequests,allowFollowing,profileLink,profileAutoUpdate=false}=state;
    if(!stats&&!shareTag&&!openRequests&&!allowFollowing&&!profileLink)return;
    const latest=Date.parse(state.importedAt??'');
    const selected=Date.parse(account.importedAt);
    const collectionBehind=profileAutoUpdate&&account.importedAt!==state.profileImportedAt;
    if(selected<latest||(selected===latest&&!collectionBehind))return;
    const key=`${accountIdentity}:${state.revision}`;
    if(seen.current===key)return;
    seen.current=key;
    void write({stats,shareTag,openRequests,allowFollowing,profileLink,profileAutoUpdate},'refresh');
    // Only a newer import or a collection that still needs that import can trigger publication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner,loadedFor,accountIdentity,state?.revision,busy]);
  return <Context.Provider value={{state:activeState,busy,error,save:choices=>write(choices),stop:()=>write(COMMUNITY_OFF),refresh}}>{children}</Context.Provider>;
}
