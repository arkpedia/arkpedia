import type { ReactNode } from 'react';
import Image from '@/components/content/ContentImage';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import { getSkillIconPath } from '@/lib/operators/operatorIconPaths';
import type { CommunityStats } from '@/lib/community/model';
import styles from './Community.module.css';

type Segment = { label:string; icon?:ReactNode; count:number|undefined };
const colors=['var(--text-faint)','color-mix(in srgb, var(--teal) 45%, var(--panel))','color-mix(in srgb, var(--teal) 72%, var(--panel))','var(--teal)'];
const percent=(count:number|undefined,total:number|undefined)=>count===undefined||!total?'—':`${(100*count/total).toFixed(1)}%`;
function Distribution({label,name,segments,total,cumulative,summary,summaryLabel}:{label:ReactNode;name:string;segments:Segment[];total:number|undefined;cumulative:boolean;summary?:number;summaryLabel:string}){
  return <div className={styles.distribution}>
    <div className={styles.rowLabel}>{label}</div>
    <div className={styles.bar} role="img" aria-label={`${name}: ${segments.map(s=>`${s.label} ${percent(s.count,total)}`).join(', ')}. Exact levels.`}>
      {segments.map((s,i)=><span key={s.label} style={{width:`${total?(s.count??0)/total*100:0}%`,background:colors[4-segments.length+i]}} />)}
    </div>
    <div className={styles.barValue}><strong>{percent(summary,total)}</strong><span>{summaryLabel}</span></div>
    <dl className={styles.barLegend}>{segments.map((segment,i)=>{
      const count=cumulative?segments.slice(i).reduce<number|undefined>((sum,s)=>sum===undefined||s.count===undefined?undefined:sum+s.count,0):segment.count;
      return <div key={segment.label} data-community-metric={segment.label} title={`${segment.label}${cumulative?' or higher':' only'}: ${count??'unknown'} of ${total??0}`}>
        <dt><span className={styles.swatch} style={{background:colors[4-segments.length+i]}} aria-hidden="true"/><span className="visually-hidden">{segment.label}</span><span aria-hidden="true">{segment.icon??segment.label}</span>{cumulative&&i<segments.length-1&&<span aria-label="or higher">+</span>}</dt>
        <dd>{percent(count,total)}</dd>
      </div>;
    })}</dl>
  </div>;
}
export default function OperatorStatsBars({data,operator,skillNames,skills,modules,mode}:{data:CommunityStats;operator:string;skillNames:(string|null|undefined)[];skills:number;modules:{index:number;label:string}[];mode:'exclusive'|'cumulative'}){
  const cumulative=mode==='cumulative';
  const promotion=[Math.max(0,(data.builds??0)-(data.e1??0)-(data.e2??0)),data.e1,data.e2];
  return <div className={styles.charts}>
    <div className={styles.distribution} data-community-metric="Owned">
      <div className={styles.rowLabel}>Owned</div>
      <div className={styles.bar} role="img" aria-label={`Owned: ${data.owned} of ${data.contributors}`}><span style={{width:`${data.contributors?(data.owned??0)/data.contributors*100:0}%`,background:'var(--teal)'}}/></div>
      <strong className={styles.barValue}>{percent(data.owned??undefined,data.contributors)}</strong>
      <span className={styles.barCaption}>{data.owned} of {data.contributors} contributors</span>
    </div>
    <section className={styles.chartSection} aria-label="Promotion distribution">
      <div className={styles.chartHeading}><h3 className="entity-title entity-title-sm">Promotion</h3><span>Of {data.builds??0} owners with known builds</span></div>
      <Distribution label="Highest reached" name="Promotion" segments={promotion.map((count,i)=>({label:`E${i}`,count,icon:<OperatorGameIcon label={`Elite ${i}`} size={24}/>}))} total={data.builds} cumulative={cumulative} summary={(data.e1??0)+(data.e2??0)} summaryLabel="promoted"/>
    </section>
    {skills>0&&<section className={styles.chartSection} aria-label="Skill rank distribution">
      <div className={styles.chartHeading}><h3 className="entity-title entity-title-sm">Skill ranks</h3><span>Of {data.masteryOwners??0} E2 owners</span></div>
      {Array.from({length:Math.min(skills,3)},(_,i)=>{
        const path=getSkillIconPath(operator,skillNames[i]);
        const ranks=data.skillRanks?.[i];
        const counts=ranks??[undefined,undefined,undefined,data.skills?.[i]];
        return <div key={i}>
          <Distribution name={`Skill ${i+1}`} label={<><span title={skillNames[i]??`Skill ${i+1}`}>{path&&<Image src={path} alt={skillNames[i]??`Skill ${i+1}`} width={36} height={36}/>}</span><span>Skill {i+1}</span></>} segments={counts.map((count,rank)=>({label:`Skill ${i+1} ${rank?`M${rank}`:'Rank 7'}`,count,icon:rank?<OperatorGameIcon label={`M${rank}`} color size={24}/>:<span>Lv7</span>}))} total={data.masteryOwners} cumulative={cumulative} summary={ranks?.reduce((a,b)=>a+b,0)??data.skills?.[i]} summaryLabel={ranks?'rank 7+':'M3'}/>
        </div>;
      })}
      {(!data.skillRanks||!!data.skillUnknown?.[0])&&<p className={styles.chartNote}>{data.skillRanks?`${data.skillUnknown?.[0]} E2 ${data.skillUnknown?.[0]===1?'owner has':'owners have'} an unknown skill rank.`:'Earlier skill ranks are unavailable for this snapshot.'}</p>}
    </section>}
    {modules.length>0&&<section className={styles.chartSection} aria-label="Module distribution">
      <div className={styles.chartHeading}><h3 className="entity-title entity-title-sm">Modules</h3><span>Of {data.moduleOwners??0} E2 owners</span></div>
      {modules.map(module=>{
        const levels=data.modules?.[module.index];
        return <Distribution key={module.index} name={module.label} label={module.label} segments={[1,2,3].map((stage,i)=>({label:`${module.label} Level ${stage}`,count:levels?.[i],icon:<span>Lv{stage}</span>}))} total={data.moduleOwners} cumulative={cumulative} summary={levels?.reduce((a,b)=>a+b,0)} summaryLabel="has module"/>;
      })}
    </section>}
  </div>;
}
