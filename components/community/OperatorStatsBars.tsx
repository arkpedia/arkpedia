import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import Image from '@/components/content/ContentImage';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import { getSkillIconPath } from '@/lib/operators/operatorIconPaths';
import type { CommunityStats } from '@/lib/community/model';
import styles from './Community.module.css';

type Segment = { label:string; icon?:ReactNode; count:number|undefined };
const colors=['var(--text-faint)','color-mix(in srgb, var(--teal) 45%, var(--panel))','color-mix(in srgb, var(--teal) 72%, var(--panel))','var(--teal)'];
const percent=(count:number|undefined,total:number|undefined)=>count===undefined||!total?'—':`${(100*count/total).toFixed(1)}%`;
function Legend({items}:{items:{label:string;icon:ReactNode}[]}){
  return <div className={styles.barLegend}>{items.map((item,i)=><span key={item.label} title={item.label}>
    <span className={styles.swatch} style={{background:colors[4-items.length+i]}} aria-hidden="true"/>
    <span className="visually-hidden">{item.label}</span><span aria-hidden="true">{item.icon}</span>
  </span>)}</div>;
}
function Distribution({label,name,segments,total,summary,summaryLabel}:{label:ReactNode;name:string;segments:Segment[];total:number|undefined;summary?:number;summaryLabel:string}){
  const {open,setOpen,close,buttonRef,menuRef,menuStyle}=useAnchoredPopover(300);
  const id=useId(),pinned=useRef(false),pointerType=useRef('');
  const [active,setActive]=useState<number|null>(null);
  useEffect(()=>{if(!open)pinned.current=false;},[open]);
  return <div className={styles.distribution}>
    <div className={styles.rowLabel}>{label}</div>
    <button type="button" ref={buttonRef} className={`btn-bare ${styles.barTrigger}`} aria-label={`${name} percentages`} aria-expanded={open} aria-controls={open?id:undefined}
      onPointerDown={event=>{pointerType.current=event.pointerType;}}
      onFocus={event=>{if(event.currentTarget.matches(':focus-visible')){setActive(null);setOpen(true);}}} onBlur={event=>{if(!menuRef.current?.contains(event.relatedTarget)){pinned.current=false;close();}}}
      onClick={event=>{if(event.detail>0&&pointerType.current==='mouse')return;if(pinned.current){pinned.current=false;close();}else{pinned.current=true;setOpen(true);}}}>
      <span className={styles.bar} onPointerEnter={event=>{if(event.pointerType==='mouse'){pinned.current=false;setOpen(true);}}}
        onPointerLeave={event=>{setActive(null);if(event.pointerType==='mouse'){pinned.current=false;close();}}}>
        {segments.map((segment,i)=>(segment.count??0)>0&&<span key={segment.label} onPointerEnter={()=>setActive(i)} style={{width:`${total?segment.count!/total*100:0}%`,background:colors[4-segments.length+i]}}/>)}
      </span>
    </button>
    <div className={styles.barValue}><strong>{percent(summary,total)}</strong><span>{summaryLabel}</span></div>
    {open&&createPortal(<div id={id} ref={menuRef} className="action-popover" role="region" aria-label={`${name} percentages`} style={{...menuStyle,position:'fixed'}}>
      <strong>{name}</strong>
      <dl className={styles.barDetails}>{segments.map((segment,i)=><div key={segment.label} data-community-metric={segment.label} className={active===i?styles.activeSegment:undefined}>
        <dt title={segment.label}><span className={styles.swatch} style={{background:colors[4-segments.length+i]}} aria-hidden="true"/><span aria-hidden="true">{segment.icon}</span><span className="visually-hidden">{segment.label}</span></dt>
        <dd>{percent(segment.count,total)} <span>({segment.count??'unknown'} of {total??0})</span></dd>
      </div>)}</dl>
    </div>,document.body)}
  </div>;
}
export default function OperatorStatsBars({data,operator,skillNames,skills,modules}:{data:CommunityStats;operator:string;skillNames:(string|null|undefined)[];skills:number;modules:{index:number;label:string}[]}){
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
      <Distribution label="Highest reached" name="Promotion" segments={promotion.map((count,i)=>({label:`E${i}`,count,icon:<OperatorGameIcon label={`Elite ${i}`} size={24}/>}))} total={data.builds} summary={data.e2??0} summaryLabel="E2"/>
      <Legend items={[0,1,2].map(i=>({label:`Elite ${i}`,icon:<OperatorGameIcon label={`Elite ${i}`} size={24}/>}))}/>
    </section>
    {skills>0&&<section className={styles.chartSection} aria-label="Skill mastery distribution">
      <div className={styles.chartHeading}><h3 className="entity-title entity-title-sm">Skill mastery</h3><span>Of {data.masteryOwners??0} E2 owners</span></div>
      {Array.from({length:Math.min(skills,3)},(_,i)=>{
        const path=getSkillIconPath(operator,skillNames[i]);
        const ranks=data.skillRanks?.[i];
        const counts=ranks?.slice(1,4)??[undefined,undefined,data.skills?.[i]];
        return <Distribution key={i} name={`Skill ${i+1}`} label={<><span title={skillNames[i]??`Skill ${i+1}`}>{path&&<Image src={path} alt={skillNames[i]??`Skill ${i+1}`} width={36} height={36}/>}</span><span>Skill {i+1}</span></>} segments={counts.map((count,rank)=>({label:`Skill ${i+1} M${rank+1}`,count,icon:<OperatorGameIcon label={`M${rank+1}`} color size={24}/>}))} total={data.masteryOwners} summary={ranks?counts.reduce<number>((sum,count)=>sum+(count??0),0):data.skills?.[i]} summaryLabel={ranks?'M1+':'M3'}/>;
      })}
      <Legend items={[1,2,3].map(rank=>({label:`M${rank}`,icon:<OperatorGameIcon label={`M${rank}`} color size={24}/>}))}/>
    </section>}
    {modules.length>0&&<section className={styles.chartSection} aria-label="Module distribution">
      <div className={styles.chartHeading}><h3 className="entity-title entity-title-sm">Modules</h3><span>Of {data.moduleOwners??0} E2 owners</span></div>
      {modules.map(module=>{
        const levels=data.modules?.[module.index];
        return <Distribution key={module.index} name={module.label} label={module.label} segments={[1,2,3].map((stage,i)=>({label:`${module.label} Level ${stage}`,count:levels?.[i],icon:<span>Lv{stage}</span>}))} total={data.moduleOwners} summary={levels?.reduce((a,b)=>a+b,0)} summaryLabel="has module"/>;
      })}
      <Legend items={[1,2,3].map(stage=>({label:`Level ${stage}`,icon:<span>Lv{stage}</span>}))}/>
    </section>}
  </div>;
}
