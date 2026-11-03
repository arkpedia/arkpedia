import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import { ReplayRequestError, type ReplaySession, type ServerId } from '@/lib/account-import/yostar';
import { isResettingBrowserData } from '@/lib/account/resetData';
import { namespaceFor, type StageMarker } from './model';
import { readReplays, saveReplay, removeReplay } from './store';
import { cooldownKey, REPLAY_LOCK, replayRetrySeconds, syncReplays, type SyncProgress, type ReplayIssue } from './queue';
import { replayCloud } from './cloud';
import { requestReplayPermit } from './permit';

export interface ReplayImport { session:ReplaySession; markers:StageMarker[]; server:ServerId }
type Phase = 'idle' | 'running' | 'pausing' | 'paused' | 'complete' | 'error';
interface State {
  info:{namespace:string;server:ServerId;available:number}|null;
  ready:boolean; phase:Phase; visible:boolean; cloud:boolean; selected:string;
  message:string; count:number; issues:ReplayIssue[]; progress:SyncProgress|null;
}
const INITIAL:State={info:null,ready:false,phase:'idle',visible:false,cloud:false,selected:'',message:'',count:0,issues:[],progress:null};
interface Downloads extends State {
  running:boolean; eligible:boolean; install:(value:ReplayImport|null)=>void;
  setCloud:(value:boolean)=>void; setSelected:(value:string)=>void;
  run:(options?:{afterImport?:boolean})=>Promise<void>; pause:()=>void; dismiss:()=>void;
}
const Context=createContext<Downloads>({...INITIAL,running:false,eligible:false,install:()=>{},setCloud:()=>{},setSelected:()=>{},run:async()=>{},pause:()=>{},dismiss:()=>{}});
export const useReplayDownloads=()=>useContext(Context);
export function ReplayDownloadProvider({children}:{children:ReactNode}){
  if(process.env.ARKPEDIA_CLOUD_ACCOUNTS!=='1')return <>{children}</>;
  return <EnabledDownloads>{children}</EnabledDownloads>;
}

/** One tab-memory continuation survives dialogs/routes. Never persist its capability. */
function EnabledDownloads({children}:{children:ReactNode}){
  const sync=useCloudSync(),latest=useRef(sync);latest.current=sync;
  const [state,setState]=useState<State>(INITIAL),current=useRef(state);
  const source=useRef<ReplayImport|null>(null),generation=useRef(0),mounted=useRef(true);
  const active=useRef<{controller:AbortController;owner:string|null}|null>(null);
  const eligible=sync.status==='ready'&&!!sync.remote?.syncReviewed&&!!sync.remote.gameSync&&!sync.remote.paused;
  const update=useCallback((patch:Partial<State>)=>{current.current={...current.current,...patch};if(mounted.current)setState(current.current);},[]);
  const recount=useCallback(async(namespace:string,version:number)=>{
    const rows=await readReplays(namespace);
    if(generation.current===version)update({count:rows.length});
  },[update]);
  const retire=useCallback((message:string)=>{
    generation.current++;source.current=null;active.current?.controller.abort(message);
    update({ready:false,cloud:false,phase:active.current?'pausing':'paused',message,visible:current.current.visible});
  },[update]);
  const install=useCallback((value:ReplayImport|null)=>{
    active.current?.controller.abort('A new game import replaced this session.');
    const version=++generation.current;source.current=value;
    const info=value?{namespace:namespaceFor(value.server,value.session.uid),server:value.server,available:value.markers.filter(m=>m.hasReplay).length}:null;
    // Importing replaces the session, not the reader's explicit saving choice.
    update({...INITIAL,cloud:current.current.cloud,info,ready:!!value});
    if(info)void recount(info.namespace,version).catch(()=>{if(generation.current===version)update({message:'This browser could not open auto-deploy storage.'});});
  },[recount,update]);
  const pause=useCallback(()=>{
    if(active.current){update({phase:'pausing'});active.current.controller.abort('Paused. Completed auto-deploys are saved.');}
  },[update]);

  useEffect(()=>{
    mounted.current=true;
    const stop=()=>retire('Import your game account again to resume. Completed auto-deploys are saved.');
    const changed=(event:StorageEvent)=>{if(event.key==='arkpedia:replays-stop'||event.key===null)stop();};
    window.addEventListener('pagehide',stop);window.addEventListener('storage',changed);
    window.addEventListener('arkpedia:replays-stop',stop);window.addEventListener('arkpedia:reset-data',stop);
    return()=>{mounted.current=false;source.current=null;active.current?.controller.abort();window.removeEventListener('pagehide',stop);window.removeEventListener('storage',changed);window.removeEventListener('arkpedia:replays-stop',stop);window.removeEventListener('arkpedia:reset-data',stop);};
  },[retire]);
  const previousOwner=useRef(sync.remote?.user.id??null);
  useEffect(()=>{
    const owner=sync.remote?.user.id??null;
    if(previousOwner.current!==owner){previousOwner.current=owner;if(source.current)retire('Your Arkpedia account changed. Import your game account again to resume.');}
    if(!eligible){
      update({cloud:false});
      if(active.current?.owner){update({phase:'pausing'});active.current.controller.abort('Account saving changed. Downloads paused.');}
    }
  },[eligible,sync.remote?.user.id,retire,update]);

  const run=useCallback(async(options?:{afterImport?:boolean})=>{
    // Automatic work requires the checked choice and current cloud consent. Manual
    // downloads remain available locally without an Arkpedia account.
    if(options?.afterImport&&(!current.current.cloud||latest.current.status!=='ready'||!latest.current.remote?.syncReviewed||!latest.current.remote.gameSync||latest.current.remote.paused))return;
    const imported=source.current,info=current.current.info;
    if(!imported||!info||active.current||isResettingBrowserData())return;
    const version=generation.current,selected=current.current.selected.trim(),namespace=info.namespace;
    if(selected&&!imported.markers.some(m=>m.stageId===selected&&m.hasReplay)){update({message:'Choose a stage ID with a saved auto-deploy, for example main_00-01.'});return;}
    if(!navigator.locks){update({message:'This browser cannot coordinate imports across tabs. Use a current browser to sync auto-deploys.'});return;}
    let retryAt:number;
    try{retryAt=Number(localStorage.getItem(cooldownKey(namespace)))||0;}catch{update({message:'This browser could not read the download cooldown.'});return;}
    if(Date.now()<retryAt){update({message:`Please wait ${Math.ceil((retryAt-Date.now())/1000)} seconds before resuming.`});return;}
    const account=latest.current.remote?.user.id??null;
    const owner=current.current.cloud&&latest.current.status==='ready'&&latest.current.remote?.syncReviewed&&latest.current.remote.gameSync&&!latest.current.remote.paused?account:null;
    const job={controller:new AbortController(),owner};active.current=job;
    update({phase:'running',visible:true,message:'Preparing auto-deploys…',issues:[],progress:null});
    try{
      await navigator.locks.request(REPLAY_LOCK,{ifAvailable:true},async lock=>{
        if(!lock)throw new Error('Another tab is importing game data. Wait for it to finish.');
        const result=await syncReplays({namespace,markers:imported.markers,session:imported.session,signal:job.controller.signal,
          permit:()=>requestReplayPermit(job.controller.signal,position=>{if(generation.current===version)update({message:position?`Waiting for a shared download slot (${position} in queue)… You can keep browsing.`:'Waiting for a shared download slot… You can keep browsing.'});}),
          store:{read:readReplays,save:saveReplay,remove:removeReplay},...(owner?{cloud:replayCloud(owner,namespace,job.controller.signal)}:{}),forceStage:selected||undefined,
          check:()=>{
            if(generation.current!==version||isResettingBrowserData())throw new DOMException('Paused','AbortError');
            if((latest.current.remote?.user.id??null)!==account)throw new Error('Your Arkpedia account changed. Downloads paused.');
            if(owner&&(latest.current.status!=='ready'||!latest.current.remote?.syncReviewed||!latest.current.remote.gameSync||latest.current.remote.paused))throw new Error('Account saving changed. Downloads paused.');
          },
          progress:p=>{if(generation.current===version)update({message:p.message,issues:p.skipped,progress:p});},
        });
        if(generation.current===version)update({phase:result.remaining?'paused':result.skipped.length?'error':'complete'});
      });
    }catch(error){
      if(generation.current===version){
        const paused=job.controller.signal.aborted;
        if(error instanceof ReplayRequestError&&error.reconnect){source.current=null;update({ready:false});}
        update({phase:paused?'paused':'error',message:paused?(typeof job.controller.signal.reason==='string'?job.controller.signal.reason:'Paused. Completed auto-deploys are saved.'):error instanceof Error?error.message:'Auto-deploy sync stopped.'});
        if(!paused)try{localStorage.setItem(cooldownKey(namespace),String(Date.now()+replayRetrySeconds(error)*1000));}catch{/* The reported failure still stops the queue. */}
      }
    }finally{
      if(active.current===job){active.current=null;if(current.current.phase==='pausing')update({phase:'paused'});}
      if(generation.current===version)try{await recount(namespace,version);}catch{update({phase:'error',message:'This browser could not open auto-deploy storage.'});}
    }
  },[recount,update]);
  return <Context.Provider value={{...state,eligible,running:state.phase==='running'||state.phase==='pausing',install,run,pause,
    setCloud:value=>{if(!active.current)update({cloud:value&&eligible});},
    setSelected:value=>{if(!active.current)update({selected:value});},
    dismiss:()=>{if(!active.current)update({visible:false});},
  }}>{children}</Context.Provider>;
}
