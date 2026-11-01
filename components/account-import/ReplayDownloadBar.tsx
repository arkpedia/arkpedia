import { useReplayDownloads } from '@/lib/replays/DownloadProvider';
import { useAccountActions } from '@/components/account/AccountActions';
import XButton from '@/components/ui/XButton';

export default function ReplayDownloadBar(){
  const job=useReplayDownloads(),actions=useAccountActions();
  if(!job.visible)return null;
  return <section className="replay-download-bar panel" aria-label="Auto-deploy downloads">
    <div className="replay-download-status"><strong>Auto-deploys</strong><p className="hint" role="status">{job.message}</p></div>
    <div className="data-dialog-acts">
      {job.running?<button type="button" className="ghost btn-sm" disabled={job.phase==='pausing'} onClick={job.pause}>{job.phase==='pausing'?'Pausing…':'Pause'}</button>
        :job.ready&&job.phase!=='complete'&&<button type="button" className="primary btn-sm" onClick={()=>void job.run()}>{job.phase==='error'?'Retry':'Resume'}</button>}
      <button type="button" className="ghost btn-sm" onClick={()=>actions.open('import')}>{job.ready?'Details':'Import to resume'}</button>
      {!job.running&&<XButton label="Dismiss download status" onClick={job.dismiss} />}
    </div>
  </section>;
}
