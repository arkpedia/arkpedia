import { useEffect, useMemo, useState } from 'react';
import type { BannerGoal, BudgetRow } from '@/lib/pulls/plan';
import { formatChance, type BannerOdds, type OddsRequest, type OddsResult } from '@/lib/pulls/probability';
import { OperatorGoals } from './OperatorGoals';
import styles from '@/styles/pulls/pulls-workspace.module.css';
import { ContentImg } from '@/components/content/ContentImage';

export default function PullBannerRow({row,rules,expanded,onExpand,onChange,onRemove}: {row:BudgetRow;rules?:BannerOdds;expanded:boolean;onExpand:()=>void;onChange:(goal:BannerGoal)=>void;onRemove:()=>void}) {
  const [response,setResponse] = useState<{key:string; result?:OddsResult; error?:string}|null>(null);
  const request = useMemo<OddsRequest|null>(()=>rules && row.goal.targets?.length ? {rules,pulls:row.goal.pulls,targets:row.goal.targets,spark:row.goal.includeSpark ?? false,roster:row.goal.rateUpRoster}:null,[rules,row.goal]);
  const key=JSON.stringify(request);
  useEffect(()=>{
    if(!request)return;
    let worker:Worker|undefined;
    const timer=setTimeout(()=>{
      worker=new Worker(new URL('../../lib/pulls/probability.worker.ts',import.meta.url));
      worker.onmessage=e=>{setResponse({key,...e.data});worker?.terminate();};
      worker.onerror=()=>setResponse({key,error:'Unavailable'});
      worker.postMessage(request);
    },300);
    return()=>{clearTimeout(timer);worker?.terminate();};
  },[key,request]);
  const result=response?.key===key?response.result:undefined;
  const names=row.goal.targets?.map(t=>t.name).join(' · ') || row.banner?.sixStars.join(' · ') || 'Select operator goals';
  const date=new Date(`${row.goal.spendOn}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  return <article className={styles.banner} data-expanded={expanded}>
    <div className={styles.bannerRow}>
      <button className={styles.bannerIdentity} type="button" onClick={onExpand} aria-expanded={expanded} aria-label={`Edit ${row.goal.banner}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {row.banner?.image && <ContentImg src={row.banner.image} alt="" width="96" height="60" />}
        <span><strong>{names}</strong><small>{row.goal.banner.replace(/^\[[^\]]*\]\s*/,'')}</small><em>{expanded?'Hide goals':'Edit goals'} <span aria-hidden="true">{expanded?'−':'+'}</span></em></span>
      </button>
      <div className={styles.date}><span className={styles.mobileLabel}>Until</span><b>{date}</b><small>{row.banner?.datesEstimated?'Estimated':''}</small></div>
      <label className={styles.budget}><span className={styles.mobileLabel}>Pulls</span><input aria-label={`Pull budget for ${row.goal.banner}`} type="number" min="0" max="100000" inputMode="numeric" value={row.goal.pulls} onFocus={e=>e.currentTarget.select()} onChange={e=>onChange({...row.goal,pulls:Math.max(0,Math.min(100000,Math.floor(Number(e.target.value)||0)))})} /></label>
      <div className={styles.figure}><span className={styles.mobileLabel}>Available</span><b>{row.issue?'—':row.available}</b><small>{row.free>0?`${row.free} free`:''}</small></div>
      <div className={`${styles.figure} ${styles.chance}`}><span className={styles.mobileLabel}>All goals</span><b>{result?formatChance(result.all):request?'…':'—'}</b><small>{request?'Estimate':''}</small></div>
      <div className={`${styles.figure} ${row.remaining<0?styles.negative:''}`}><span className={styles.mobileLabel}>Left</span><b>{row.issue?'—':row.remaining}</b><small>{row.shortfall?'Shortfall':''}</small></div>
      <button className={styles.remove} type="button" onClick={onRemove} aria-label={`Remove ${row.goal.banner}`}>×</button>
    </div>
    {expanded && <div className={`${styles.goalEditor} pulls-banner-editor`}>
      <OperatorGoals rules={rules} goal={row.goal} onChange={onChange}><span /></OperatorGoals>
      <div className={styles.spending}><span>Banner free pulls <b>{row.free}</b></span><span>From savings <b>{row.paid}</b></span><span>After earlier banners <b>{row.available}</b></span></div>
    </div>}
  </article>;
}
