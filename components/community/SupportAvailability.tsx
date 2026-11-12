import { useState } from 'react';
import Link from 'next/link';
import ActionPopover from '@/components/ui/ActionPopover';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import type { SupportPlayer } from '@/lib/community/model';

export interface AvailabilityResult {fullReports:number;openReports:number;hidden:boolean}
export default function SupportAvailability({row,onReport}:{row:SupportPlayer;onReport:(result:AvailabilityResult)=>void}){
  const {remote}=useCloudSync(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function report(status:'full'|'open'|null){
    if(!remote||busy)return;setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/community/availability',{method:status?'POST':'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:remote.user.id,listing:row.id.split(':')[0],importedAt:row.importedAt,status})});
      const result=await response.json();if(!response.ok)throw Error(result.error??'Report could not be saved.');
      setMessage(status?`Reported: ${status==='full'?'friend list full':'has room'}.`:'Your report was removed.');onReport(result);
    }catch(e){setMessage(e instanceof Error?e.message:'Report could not be saved.');}
    finally{setBusy(false);}
  }
  return <div>
    <ActionPopover label={`Report availability for ${row.friendTag}`} trigger="Report slots" textTrigger>
      {remote?<><p>Checked this player in Arknights?</p><div className="account-shortcuts"><button type="button" className="ghost btn-sm" disabled={busy} onClick={()=>void report('full')}>Friend list full</button><button type="button" className="ghost btn-sm" disabled={busy} onClick={()=>void report('open')}>Has room</button><button type="button" className="ghost btn-sm" disabled={busy} onClick={()=>void report(null)}>Remove my report</button></div></>:<p className="reading-copy"><Link href="/account">Log in</Link> to report availability.</p>}
      <p role="status">{busy?'Saving report…':message}</p>
    </ActionPopover>
    {(row.fullReports>0||row.openReports>0)&&<p>Recent reports: {row.fullReports} full · {row.openReports} has room</p>}
  </div>;
}
