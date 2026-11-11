import { useCallback, useEffect, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { SupportTile } from '@/components/account/ProfileCard';
import { ContentImg } from '@/components/content/ContentImage';
import { OperatorPreview, type OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import type { GachaOperatorPreview } from '@/lib/gacha/operatorPreviewData';
import type { SupportUnit } from '@/lib/account/accountStore';
import type { FriendOperator } from '@/lib/account/friendCatalogue';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { supportPreviewBuild } from '@/lib/account/supportBuild';
import SkillRank from '@/components/operators/SkillRank';
import styles from './FriendSupportDetails.module.css';

export default function FriendSupportDetails({name,units,map,operators,onClose}:{name:string;units:SupportUnit[];map:GameAccountMap;operators:FriendOperator[];onClose:()=>void}){
  const [preview,setPreview]=useState<OperatorPreviewItem|null>(null);
  const closePreview=useCallback(()=>setPreview(null),[]);
  return <ImportDialog title={`${name} · Support units`} className={styles.dialog} onClose={onClose}>
    <div className={styles.units}>{units.map(unit=>{
      const op=operators.find(op=>op.name===unit.name);
      return <SupportDetails key={unit.name} unit={unit} map={map} op={op} onOpen={skill=>setPreview({name:unit.name,rarity:op?.rarity??unit.rarity??0,icon:op?.icon??'/essential-icons/Arkpedia.webp',support:unit,build:skill<=unit.elite?supportPreviewBuild(unit,op?.skills??0,map):undefined,initialSkill:skill})} />;
    })}</div>
    {preview&&<OperatorPreview item={preview} onClose={closePreview} nativeModal />}
  </ImportDialog>;
}
function SupportDetails({unit,map,op,onOpen}:{unit:SupportUnit;map:GameAccountMap;op?:FriendOperator;onOpen:(skill:number)=>void}){
  const [details,setDetails]=useState<GachaOperatorPreview|null>(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setFailed(false);
    void fetch(`/api/gacha-operator/${encodeURIComponent(unit.name)}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('Unavailable');const result=await response.json();if(!controller.signal.aborted)setDetails(result);
    }).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return()=>controller.abort();
  },[unit.name,retry]);
  const count=details?.skills.length??op?.skills??0;
  return <section className={styles.unit} aria-label={`${unit.name} support build`}>
    <h3>{unit.name}</h3>
    <div className={styles.build}>
      <button type="button" className={`btn-bare ${styles.portrait}`} aria-haspopup="dialog" aria-label={`Open ${unit.name} operator details`} onClick={()=>onOpen(Math.max(0,(unit.skill??1)-1))}>
        <SupportTile unit={unit} full map={map} />
      </button>
      <div className={styles.skills}>{Array.from({length:count},(_,index)=>{
        const skill=details?.skills[index],selected=unit.skill===index+1,locked=index>unit.elite;
        const mastery=unit.skillMasteries?.[index]??(selected?unit.skillMastery:null)??(unit.allMastered?3:null);
        const rank=locked?'Locked':mastery?`M${mastery}`:unit.skillLevel?`Lv ${unit.skillLevel}`:mastery===0?'M0 · rank unknown':'Rank unknown';
        return <button key={index} type="button" className={`btn-bare pick-card ${selected?'is-selected':''} ${styles.skill}`} aria-current={selected?'true':undefined} aria-haspopup="dialog" aria-label={`${unit.name} Skill ${index+1}: ${rank}${selected?', equipped':''}. Open details`} onClick={()=>onOpen(index)}>
          {skill?.icon&&<ContentImg className={styles.skillIcon} src={skill.icon} alt="" />}
          <span className={styles.skillText}><span className={styles.rank}>Skill {index+1} · <SkillRank rank={rank} /></span><span>{skill?.name??'Loading…'}</span>{selected&&<small>Equipped</small>}</span>
        </button>;
      })}</div>
    </div>
    {unit.module&&<p className="hint">{map.moduleTypes?.[unit.module]?.toUpperCase()??'Module'} · {unit.moduleLevel?`Level ${unit.moduleLevel}`:'Level unknown'}</p>}
    {failed&&<p role="status">Skill names unavailable. <button type="button" className="ghost btn-sm" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
  </section>;
}
