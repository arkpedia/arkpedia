import { useEffect, useRef, useState } from 'react';
import InfoPopover from '@/components/ui/InfoPopover';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import type { ReplaySession, ServerId } from '@/lib/account-import/yostar';
import { namespaceFor, type StageMarker } from '@/lib/replays/model';
import { readReplays, saveReplay, removeReplay } from '@/lib/replays/store';
import { BATCH_LIMIT, cooldownKey, REPLAY_LOCK, replayRetrySeconds, syncReplays } from '@/lib/replays/queue';
import { replayCloud } from '@/lib/replays/cloud';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { isResettingBrowserData } from '@/lib/account/resetData';

export interface ReplayImport { session:ReplaySession; markers:StageMarker[]; server:ServerId }
export default function ReplaySync({ imported, busy, onBusy }: {imported:ReplayImport|null;busy:boolean;onBusy:(value:boolean)=>void}) {
  const sync=useCloudSync(),latest=useRef(sync);latest.current=sync;
  const [cloud,setCloud]=useState(false),[running,setRunning]=useState(false),[message,setMessage]=useState(''),[count,setCount]=useState(0),[refreshStage,setRefreshStage]=useState('');
  const active=useRef<AbortController|null>(null),mounted=useRef(true);
  const namespace=imported?namespaceFor(imported.server,imported.session.uid):null;
  const eligible=sync.status==='ready'&&sync.remote?.syncReviewed&&sync.remote.gameSync&&!sync.remote.paused;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.abort();};},[]);
  useEffect(()=>{active.current?.abort();setMessage('');setRefreshStage('');if(namespace)void readReplays(namespace).then(rows=>{if(mounted.current)setCount(rows.length);},()=>setMessage('This browser could not open auto-deploy storage.'));},[namespace,imported]);
  useEffect(()=>{if(!eligible){setCloud(false);active.current?.abort();}},[eligible,sync.remote?.user.id]);
  useEffect(()=>{const pause=()=>active.current?.abort();const changed=(event:StorageEvent)=>{if(event.key==='arkpedia:replays-stop'||event.key===null)pause();};window.addEventListener('storage',changed);window.addEventListener('arkpedia:replays-stop',pause);window.addEventListener('pagehide',pause);window.addEventListener('arkpedia:reset-data',pause);return()=>{window.removeEventListener('storage',changed);window.removeEventListener('arkpedia:replays-stop',pause);window.removeEventListener('pagehide',pause);window.removeEventListener('arkpedia:reset-data',pause);};},[]);
  async function run(){
    if(!imported||!namespace||running||busy)return;
    const retryAt=Number(localStorage.getItem(cooldownKey(namespace)))||0;
    if(Date.now()<retryAt){setMessage(`Please wait ${Math.ceil((retryAt-Date.now())/1000)} seconds before resuming.`);return;}
    if(!navigator.locks){setMessage('This browser cannot coordinate imports across tabs. Use a current browser to sync auto-deploys.');return;}
    const controller=new AbortController();active.current=controller;
    const owner=cloud&&eligible?sync.remote!.user.id:null;
    const selected=refreshStage.trim();
    if(selected&&!imported.markers.some(m=>m.stageId===selected&&m.hasReplay)){setMessage('Choose a stage ID with a saved auto-deploy, for example main_00-01.');return;}
    setRunning(true);onBusy(true);setMessage('Preparing auto-deploys…');
    try{
      await navigator.locks.request(REPLAY_LOCK,{ifAvailable:true},async lock=>{
        if(!lock)throw new Error('Another tab is importing game data. Wait for it to finish.');
        await syncReplays({namespace,markers:imported.markers,session:imported.session,signal:controller.signal,
          store:{read:readReplays,save:saveReplay,remove:removeReplay},...(owner?{cloud:replayCloud(owner,namespace)}:{}),forceStage:selected||undefined,
          check:()=>{if(isResettingBrowserData())throw new DOMException('Paused','AbortError');if(owner&&(latest.current.status!=='ready'||latest.current.remote?.user.id!==owner||!latest.current.remote.gameSync||latest.current.remote.paused))throw new Error('Account saving changed. Auto-deploy sync paused.');},
          progress:p=>{if(mounted.current)setMessage(p.message);},
        });
      });
    }catch(error){
      if(mounted.current)setMessage(error instanceof DOMException&&error.name==='AbortError'?'Paused. Completed auto-deploys are saved.':error instanceof Error?error.message:'Auto-deploy sync stopped.');
      if(!(error instanceof DOMException&&error.name==='AbortError'))localStorage.setItem(cooldownKey(namespace),String(Date.now()+replayRetrySeconds(error)*1000));
    }finally{
      if(mounted.current){setRunning(false);onBusy(false);void readReplays(namespace).then(rows=>setCount(rows.length),()=>{});}active.current=null;
    }
  }
  async function exportSaved(){if(!namespace)return;try{const records=await readReplays(namespace);downloadBlob(new Blob([JSON.stringify({version:1,records})],{type:'application/json'}),'arkpedia-auto-deploys.json');}catch{setMessage('Could not export saved auto-deploys.');}}
  return <section className="replay-sync" aria-label="Auto-deploy sync">
    <div className="data-dialog-acts"><strong>Auto-deploys</strong><InfoPopover label="How auto-deploy sync works">
      <p>Downloads are paced, {BATCH_LIMIT} per batch. Pause or close this dialog to stop. Completed downloads stay saved; import again after reopening to resume.</p>
      <p>Stage counters are change hints. Only missing or changed stages are checked, but ordinary play may trigger a recheck.</p>
      <p>Disabling imported-data saving deletes cloud auto-deploys. Export separately; standard browser backups exclude them.</p>
      <p>Limits: 32 MiB / 3,000 auto-deploys per archive, 512 KB per replay.</p>
    </InfoPopover></div>
    <p className="hint">{imported?`${imported.markers.filter(m=>m.hasReplay).length.toLocaleString('en-US')} available · ${count.toLocaleString('en-US')} saved in this browser`:'Import your game account to check available auto-deploys.'}</p>
    <label className="check"><input type="checkbox" checked={cloud} disabled={!eligible||running||busy} onChange={e=>setCloud(e.target.checked)}/>Also save auto-deploys to my Arkpedia account</label>
    {!eligible&&<p className="hint">Account saving needs sign-in and imported-game-data saving enabled.</p>}
    <div className="data-dialog-acts">
      <button type="button" className="primary btn-sm" disabled={!imported||busy&&!running} onClick={()=>running?active.current?.abort():void run()}>{running?'Pause':refreshStage.trim()?'Refresh auto-deploy':'Sync auto-deploys'}</button>
      <button type="button" className="ghost btn-sm" disabled={!count||running||busy} onClick={()=>void exportSaved()}>Export auto-deploys</button>
    </div>
    <details><summary>Refresh one stage</summary><label>Stage ID<input type="text" aria-label="Auto-deploy stage ID" value={refreshStage} onChange={e=>setRefreshStage(e.target.value)} placeholder="main_00-01" disabled={running||busy}/></label><p className="hint">Leave empty to check all stages.</p></details>
    {message&&<p className="hint" role="status">{message}</p>}
  </section>;
}
