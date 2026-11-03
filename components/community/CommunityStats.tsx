import { useEffect, useState } from 'react';
import { COMMUNITY_MIN_SAMPLE, type CommunityStats as Stats } from '@/lib/community/model';
import { SERVERS, type ServerId } from '@/lib/account-import/yostar';
import StyledSelect from '@/components/ui/StyledSelect';
import InfoPopover from '@/components/ui/InfoPopover';
import Link from 'next/link';
import { moduleUnlock } from '@/lib/planner/plannerLogic';
import styles from './Community.module.css';

export default function CommunityStats({operator,skin,skills=0,modules=[],rarity=0,compact=false}:{operator?:string;skin?:string;skills?:number;rarity?:number;modules?:{index:number;label:string}[];compact?:boolean}){
  const [server,setServer]=useState<ServerId>('en'),[data,setData]=useState<Stats|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    const query=new URLSearchParams({server,...(operator?{operator}:{skin:skin??''})});
    void fetch(`/api/community/stats?${query}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error);if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message??'Could not load stats.');});
    return()=>controller.abort();
  },[server,operator,skin,retry]);
  const unlock=moduleUnlock(rarity),moduleGroup=data?.moduleGroups?.find(group=>group.level===unlock?.level);
  const percent=(count:number|undefined,total:number|undefined)=>count===undefined||!total?'—':`${(100*count/total).toFixed(1)}%`;
  const metric=(label:string,count:number|undefined,total:number|undefined)=><div key={label}><dt>{label}</dt><dd>{percent(count,total)}</dd></div>;
  return <div className={`${styles.stats} ${compact?styles.compact:''} reading-copy`}>
    <div className="account-shortcuts"><h2 className={compact?'entity-title entity-title-sm':undefined}>Community stats</h2>
      <InfoPopover label="How community percentages are calculated">
        <p>Each opted-in game account contributes its latest import, regardless of age.</p>
        <ul>
          <li>Owned: among all contributors on this server.</li>
          {operator&&<>
            <li>E1 / E2: among owners with known promotions.</li>
            <li>M3: among E2 owners, including M3 training in progress.</li>
            <li>Modules: among E2{unlock ? ` Lv${unlock.level}+` : ''} owners. All module levels use this group; Level 1 includes Levels 2 and 3.</li>
          </>}
          {skin&&<li>Equipped: among outfit owners with known equipped-outfit data.</li>}
        </ul>
        <p>Stats appear once this server has {COMMUNITY_MIN_SAMPLE} contributors; smaller owner groups are included. 0% means nobody in the eligible group has that upgrade. A dash means no eligible owners with known data. Small samples are for curiosity, not a picture of all players. Individual rosters and friend tags stay private.</p>
      </InfoPopover>
      <StyledSelect label="Community stats server" value={server} onChange={v=>setServer(v as ServerId)} options={Object.entries(SERVERS).map(([value,s])=>({value,label:s.label}))} />
    </div>
    {error?<p role="status">{error} <button type="button" className="ghost btn-sm" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:!data?<p role="status">Loading community stats…</p>:<>
      <p>{data.contributors} contributors{data.owned!==null?` · ${data.owned} owners`:''}</p>
      {data.owned===null?<p>Waiting for at least {COMMUNITY_MIN_SAMPLE} contributors on this server.</p>:<dl className={styles.metrics}>
        {metric('Owned',data.owned,data.contributors)}
        {operator&&<>{metric('E1',data.e1,data.builds)}{metric('E2',data.e2,data.builds)}
          {Array.from({length:Math.min(skills,3)},(_,i)=>metric(`Skill ${i+1} M3`,data.skills?.[i],data.masteryOwners))}
          {modules.flatMap(module=>[1,2,3].map(stage=>metric(`${module.label} Level ${stage}`,moduleGroup?.modules[module.index]?.[stage-1],moduleGroup?.owners)))}</>}
        {skin&&metric('Equipped',data.equipped,data.equipmentOwners)}
      </dl>}
      {data.owned!==null&&((operator&&(!data.builds||skills>0&&!data.masteryOwners||modules.length>0&&!moduleGroup?.owners))||(skin&&!data.equipmentOwners))&&<p>— means no eligible owners with known data yet.</p>}
    </>}
    <p><Link className="reading-copy" href="/account?settings=community">Choose whether to contribute</Link></p>
  </div>;
}
