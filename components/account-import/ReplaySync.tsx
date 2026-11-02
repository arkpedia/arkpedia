import { useState } from 'react';
import InfoPopover from '@/components/ui/InfoPopover';
import { SERVERS } from '@/lib/account-import/yostar';
import { useReplayDownloads } from '@/lib/replays/DownloadProvider';
import { readReplays } from '@/lib/replays/store';
import { downloadBlob } from '@/lib/ui/downloadBlob';

export default function ReplaySync({busy}:{busy:boolean}) {
  const {info,ready,running,phase,message,count,issues,cloud,eligible,setCloud,selected:refreshStage,setSelected:setRefreshStage,run,pause}=useReplayDownloads();
  const [exportError,setExportError]=useState('');
  async function exportSaved(){if(!info)return;try{const records=await readReplays(info.namespace);downloadBlob(new Blob([JSON.stringify({version:1,records})],{type:'application/json'}),'arkpedia-auto-deploys.json');}catch{setExportError('Could not export saved auto-deploys.');}}
  return <section className="replay-sync" aria-label="Auto-deploy sync">
    <div className="data-dialog-acts replay-sync-heading"><strong>Auto-deploys</strong><InfoPopover label="How auto-deploy sync works">
      <p>Downloads are paced across Arkpedia, with at least three seconds between game requests from this browser. Use Pause to stop. The current game session stays in memory even when you do not save your login. After reloading or reopening Arkpedia, import again to resume; without a remembered login, request a new email code. Completed downloads stay saved.</p>
      <p>Stage counters are change hints. Only missing or changed stages are checked, but ordinary play may trigger a recheck.</p>
      <p>Disabling imported-data saving deletes cloud auto-deploys. Export separately; standard browser backups exclude them.</p>
      <p>Limits: 32 MiB / 3,000 auto-deploys per archive, 512 KB per replay.</p>
    </InfoPopover></div>
    <p className="hint">{info?`${SERVERS[info.server].label} · ${info.available.toLocaleString('en-US')} available · ${count.toLocaleString('en-US')} saved in this browser`:'Import your game account to check available auto-deploys.'}</p>
    <label className="check"><input type="checkbox" checked={cloud} disabled={!eligible||running||busy} onChange={e=>setCloud(e.target.checked)}/>Also save auto-deploys to my Arkpedia account</label>
    {!eligible&&<p className="hint">Account saving needs sign-in and imported-game-data saving enabled.</p>}
    <div className="data-dialog-acts">
      <button type="button" className="primary btn-sm" disabled={(!ready&&!running)||busy||phase==='pausing'} onClick={()=>{setExportError('');if(running)pause();else void run();}}>{phase==='pausing'?'Pausing…':running?'Pause':refreshStage.trim()?'Refresh auto-deploy':'Sync auto-deploys'}</button>
      <button type="button" className="ghost btn-sm" disabled={!count||running||busy} onClick={()=>void exportSaved()}>Export auto-deploys</button>
    </div>
    <p className="hint">Once started, downloads continue with this popup closed while you browse Arkpedia in this tab. Reloading, closing this tab or leaving Arkpedia stops them. Saving your game login is not required.</p>
    <details><summary>Refresh one stage</summary><label>Stage ID<input type="text" aria-label="Auto-deploy stage ID" value={refreshStage} onChange={e=>setRefreshStage(e.target.value)} placeholder="main_00-01" disabled={running||busy}/></label><p className="hint">Leave empty to check all stages.</p></details>
    {(exportError||message)&&<p className="hint" role="status">{exportError||message}</p>}
    {issues.length>0&&<details><summary>Skipped stages ({issues.length})</summary>
      <p className="hint">These replays were not saved. Existing copies are unchanged. Sync retries them; use Refresh one stage to check one.</p>
      <ul>{issues.map(issue=><li key={issue.stageId}><strong>{issue.stageId}</strong>: {issue.reason}</li>)}</ul>
    </details>}
  </section>;
}
