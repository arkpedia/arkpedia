import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { useAccount } from '@/lib/account/accountStore';
import { communitySnapshot, type CommunityChoices, type CommunityState } from './model';

interface Sharing {
  state:CommunityState|null; busy:boolean; error:string;
  save:(choices:CommunityChoices)=>Promise<boolean>; stop:()=>Promise<boolean>; refresh:()=>Promise<void>;
}
const Context=createContext<Sharing|null>(null);
export const useCommunitySharing=()=>{const value=useContext(Context);if(!value)throw Error('Missing community sharing provider');return value;};
export default function SharingProvider({children}:{children:ReactNode}){
  const {remote}=useCloudSync(),account=useAccount(),owner=remote?.user.id??null;
  const [state,setState]=useState<CommunityState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [loadedFor,setLoadedFor]=useState<string|null>(null);
  const activeState=loadedFor===owner?state:null;
  const ownerRef=useRef(owner),current=useRef(state),inflight=useRef(false),seen=useRef('');
  ownerRef.current=owner;current.current=activeState;
  const request=useCallback(async(method:string,body?:unknown)=>{
    const response=await fetch('/api/community/sharing',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error??'Community sharing could not update.');return data as CommunityState;
  },[]);
  const refresh=useCallback(async()=>{
    const identity=ownerRef.current;if(!identity)return;
    try{const data=await request('GET');if(ownerRef.current===identity){setState(data);setLoadedFor(identity);setError('');}}
    catch(e){if(ownerRef.current===identity)setError(e instanceof Error?e.message:'Could not read community choices.');}
  },[request]);
  useEffect(()=>{setState(null);setLoadedFor(null);setError('');seen.current='';void refresh();},[owner,refresh]);
  useEffect(()=>{const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
  async function write(choices:CommunityChoices,action:'consent'|'refresh'='consent'){
    const identity=ownerRef.current,previous=current.current;
    if(!identity||!previous||inflight.current)return false;
    const off=!choices.stats&&!choices.shareTag&&!choices.openRequests;
    const withdrawing=Object.entries(choices).every(([key,value])=>!value||previous[key as keyof CommunityChoices])&&Object.entries(choices).some(([key,value])=>!value&&previous[key as keyof CommunityChoices]);
    if(!off&&!account&&!withdrawing){setError('Import your game account before sharing.');return false;}
    inflight.current=true;setBusy(true);setError('');
    try{
      const data=await request(off?'DELETE':'PUT',{owner:identity,revision:previous.revision,action,choices,...(!off&&account&&!withdrawing?{snapshot:communitySnapshot(account,choices)}:action==='refresh'&&account?{snapshot:communitySnapshot(account,choices)}:{})});
      if(ownerRef.current!==identity)return false;
      seen.current=`${identity}:${account?.server}:${account?.profile?.uid}:${account?.importedAt}`;setState(data);return true;
    }catch(e){if(ownerRef.current===identity)setError(e instanceof Error?e.message:'Community sharing could not update.');return false;}
    finally{inflight.current=false;setBusy(false);}
  }
  // An import can refresh an existing opt-in, never create consent or change game identity.
  useEffect(()=>{
    if(!owner||loadedFor!==owner||!state||!account||(!state.stats&&!state.shareTag&&!state.openRequests)||account.importedAt===state.importedAt)return;
    const key=`${owner}:${account.server}:${account.profile?.uid}:${account.importedAt}`;
    if(seen.current===key||inflight.current)return;seen.current=key;
    void write({stats:state.stats,shareTag:state.shareTag,openRequests:state.openRequests},'refresh');
    // The import timestamp is the only automatic publication trigger; choices are server-checked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner,loadedFor,account?.importedAt,state?.revision]);
  return <Context.Provider value={{state:activeState,busy,error,save:choices=>write(choices),stop:()=>write({stats:false,shareTag:false,openRequests:false}),refresh}}>{children}</Context.Provider>;
}
