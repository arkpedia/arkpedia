import { ReplayRequestError, type ReplaySession } from '@/lib/account-import/yostar';
import { decodeReplay, needsReplay, replayHash, validateReplay, ReplayValidationError, type ReplayManifest, type ReplayRecord, type StageMarker } from './model';
import { ReplayCloudError, type replayCloud } from './cloud';

export const REPLAY_LOCK = 'arkpedia-game-import-and-replays';
export const BATCH_LIMIT = 200;
export interface ReplayStore { read:(namespace:string)=>Promise<ReplayRecord[]>;save:(record:ReplayRecord)=>Promise<void>;remove:(namespace:string,stageId:string)=>Promise<void> }
export interface ReplayIssue { stageId:string; reason:string }
export interface SyncProgress { checked:number; fetched:number; restored:number; remaining:number; skipped:ReplayIssue[]; message:string }
export interface QueueOptions {
  namespace:string; markers:StageMarker[]; session:ReplaySession; store:ReplayStore;
  cloud?:ReturnType<typeof replayCloud>; signal:AbortSignal; forceStage?:string;
  progress:(value:SyncProgress)=>void; check:()=>void;
  wait?:(ms:number)=>Promise<void>; random?:()=>number; limit?:number;
}
export function cooldownKey(namespace:string){return `arkpedia:replay-cooldown:${namespace}`;}
export async function waitForReplay(ms:number,signal:AbortSignal){
  if(signal.aborted)throw new DOMException('Paused','AbortError');
  await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Paused','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});
}
export async function syncReplays(options:QueueOptions):Promise<SyncProgress>{
  const {namespace,markers,store,session,cloud,signal,forceStage,progress,check}=options;
  const ensure=()=>{if(signal.aborted)throw new DOMException('Paused','AbortError');check();};
  ensure();
  const local=new Map((await store.read(namespace)).map(r=>[r.stageId,r]));
  const remote=new Map<string,ReplayManifest>();
  if(cloud){ensure();for(const r of await cloud.manifest())remote.set(r.stageId,r);}
  // A manual refresh or interrupted upload can leave equal markers with different
  // contents. Neither copy proves which replay is current; ask the game again.
  const conflicts=(stageId:string)=>{
    const cached=local.get(stageId),saved=remote.get(stageId);
    return !!cached && !!saved && cached.fingerprint===saved.fingerprint && cached.hash!==saved.hash;
  };
  const candidates=markers.filter(m=>forceStage?m.stageId===forceStage:m.hasReplay?needsReplay(m,local.get(m.stageId)) || !!cloud && (remote.get(m.stageId)?.fingerprint!==m.fingerprint || conflicts(m.stageId)):local.has(m.stageId)||remote.has(m.stageId));
  const state:SyncProgress={checked:0,fetched:0,restored:0,remaining:candidates.length,skipped:[],message:'Preparing auto-deploys…'};
  progress({...state});
  for(const marker of candidates.slice(0,options.limit??BATCH_LIMIT)){
    ensure();await (options.wait??(ms=>waitForReplay(ms,signal)))(3000+Math.floor((options.random??Math.random)()*1500));ensure();
    const previous=local.get(marker.stageId),saved=remote.get(marker.stageId);
    if(!marker.hasReplay){
      if(saved&&cloud){ensure();await cloud.remove(marker.stageId,saved.hash,marker.fingerprint);}
      ensure();await store.remove(namespace,marker.stageId);
    }else{
      let record=previous;
      const conflict=conflicts(marker.stageId);
      if(forceStage || conflict || needsReplay(marker,record)){
        if(!forceStage && !conflict && cloud && saved?.fingerprint===marker.fingerprint){
          ensure();const restored=await cloud.read(marker.stageId);ensure();
          const payload=validateReplay(restored.payload,marker.stageId),hash=await replayHash(payload);
          if(hash!==saved.hash || restored.hash!==saved.hash || restored.fingerprint!==marker.fingerprint)throw new Error('Cloud auto-deploy changed. Resume to compare again.');
          record={...restored,payload,namespace,stageId:marker.stageId};state.restored++;
        }else{
          ensure();const encoded=await session.readReplay(marker.stageId);ensure();
          let payload:string;
          try { payload=decodeReplay(encoded,marker.stageId); }
          catch(error){
            // Only a received, bounded document with an unsupported shape/identity
            // is stage-local. Transport, quota and cloud conflicts still stop sync.
            if(!(error instanceof ReplayValidationError))throw error;
            if(forceStage)throw new ReplayValidationError(`${marker.stageId}: ${error.message}`);
            state.skipped=[...state.skipped,{stageId:marker.stageId,reason:error.message}];
            state.checked++;state.remaining--;
            state.message=`${state.fetched} downloaded · ${state.restored} restored · ${state.skipped.length} skipped · ${state.remaining} remaining`;
            progress({...state});continue;
          }
          const hash=await replayHash(payload);
          record={namespace,stageId:marker.stageId,fingerprint:marker.fingerprint,payload,hash,savedAt:Date.now()};state.fetched++;
        }
        // Durable checkpoint before any cloud upload. Failed saves remain pending.
        ensure();await store.save(record);local.set(marker.stageId,record);
      }
      if(record&&cloud&&(saved?.hash!==record.hash||saved.fingerprint!==record.fingerprint)){
        ensure();
        if(saved?.hash===record.hash)await cloud.mark(record.stageId,record.fingerprint,record.hash);
        else await cloud.save(record,saved?.hash??null);
      }
    }
    state.checked++;state.remaining--;state.message=`${state.fetched} downloaded · ${state.restored} restored${state.skipped.length?` · ${state.skipped.length} skipped`:''} · ${state.remaining} remaining`;
    progress({...state});
  }
  state.message=state.skipped.length
    ?`${state.fetched} downloaded · ${state.restored} restored · ${state.skipped.length} skipped. ${state.remaining?`${state.remaining} remaining. Resume when ready.`:'Other auto-deploys are up to date.'}`
    :state.remaining?`${state.remaining} remaining. Resume when ready.`:forceStage?`${forceStage} refreshed.`:'Auto-deploys are up to date.';
  progress({...state});return state;
}
export function replayRetrySeconds(error:unknown){return error instanceof ReplayRequestError||error instanceof ReplayCloudError?error.retryAfter:60;}
