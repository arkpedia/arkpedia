import { useEffect, useState } from 'react';
import OperatorStatsBars from './OperatorStatsBars';
import { COMMUNITY_MIN_SAMPLE, type CommunityStats as Stats } from '@/lib/community/model';
import { SERVERS, type ServerId } from '@/lib/account-import/yostar';
import StyledSelect from '@/components/ui/StyledSelect';
import InfoPopover from '@/components/ui/InfoPopover';
import Link from 'next/link';
import styles from './Community.module.css';

export default function CommunityStats({operator,skin,skills=0,skillNames=[],modules=[],compact=false}:{operator?:string;skin?:string;skills?:number;skillNames?:(string|null|undefined)[];rarity?:number;modules?:{index:number;label:string}[];compact?:boolean}){
  const [server,setServer]=useState<ServerId>('en'),[data,setData]=useState<Stats|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    const query=new URLSearchParams({server,...(operator?{operator}:{skin:skin??''})});
    void fetch(`/api/community/stats?${query}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error);if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message??'Could not load stats.');});
    return()=>controller.abort();
  },[server,operator,skin,retry]);
  const percent=(count:number|undefined,total:number|undefined)=>count===undefined||!total?'—':`${(100*count/total).toFixed(1)}%`;
  const metric=(label:string,count:number|undefined,total:number|undefined)=><div key={label}><dt>{label}</dt><dd>{percent(count,total)}</dd></div>;
  return <div className={`${styles.stats} ${compact?styles.compact:''} reading-copy`}>
    <div className={styles.statsHeader}><div className="account-shortcuts"><h2 className={compact?'entity-title entity-title-sm':undefined}>Community stats</h2>
      <InfoPopover label="How community percentages are calculated">
        <p>Each opted-in game account contributes its latest import, regardless of age.</p>
        <ul>
          <li>Owned: among all contributors on this server.</li>
          {operator&&<>
            <li>E0 / E1 / E2: among owners with known promotions. Each owner counts only at their current promotion.</li>
            <li>Skill ranks: among E2 owners, including mastery training in progress. Rank 7 is shown separately from M1, M2 and M3. Missing historical ranks remain unknown; mastery proves rank 7.</li>
            <li>Modules: among all E2 owners, regardless of character level. Each module counts only at its current level.</li>
            <li>Bar segments always show exact, non-overlapping levels. Unfilled space means below rank 7, no module, or unknown data.</li>
          </>}
          {skin&&<li>Equipped: among outfit owners with known equipped-outfit data.</li>}
        </ul>
        <p>Stats appear once this server has {COMMUNITY_MIN_SAMPLE} contributors; smaller owner groups are included. 0% means nobody in the eligible group has that upgrade. A dash means no eligible owners with known data. Small samples are for curiosity, not a picture of all players. Individual rosters and friend tags stay private.</p>
      </InfoPopover>
    </div>
    <div className={styles.statsControls}>
      <StyledSelect label="Community stats server" value={server} onChange={v=>setServer(v as ServerId)} options={Object.entries(SERVERS).map(([value,s])=>({value,label:s.label}))} />
    </div>
    </div>
    {error?<p role="status">{error} <button type="button" className="ghost btn-sm" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:!data?<p role="status">Loading community stats…</p>:<>
      {skin&&<p>{data.contributors} contributors{data.owned!==null?` · ${data.owned} owners`:''}</p>}
      {data.owned===null?<p>Waiting for at least {COMMUNITY_MIN_SAMPLE} contributors on this server.</p>:operator?<OperatorStatsBars data={data} operator={operator} skillNames={skillNames} skills={skills} modules={modules}/>:<dl className={styles.metrics}>
        {metric('Owned',data.owned,data.contributors)}
        {skin&&metric('Equipped',data.equipped,data.equipmentOwners)}
      </dl>}
      {data.owned!==null&&((operator&&(!data.builds||skills>0&&!data.masteryOwners||modules.length>0&&!data.moduleOwners))||(skin&&!data.equipmentOwners))&&<p>— means no eligible owners with known data yet.</p>}
    </>}
    <p><Link className="reading-copy" href="/account?settings=community">Choose whether to contribute</Link></p>
  </div>;
}
