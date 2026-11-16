import {useState} from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import {ContentImg} from '@/components/content/ContentImage';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import type {PollOperatorResult,PollPortrait} from '@/lib/polls/pull-poll';
import styles from './PullPoll.module.css';
const potentialColors=['var(--teal)','var(--rarity-5)','var(--rarity-6)','var(--rarity-4)','var(--heading)','var(--amber)'];
export default function PullPollOperatorResults({row,portrait,onClose}:{row:PollOperatorResult;portrait?:PollPortrait;onClose:()=>void}){
  const [skip,setSkip]=useState(true),[maybe,setMaybe]=useState(true);
  const slices=[...(skip?[{label:"Don't Want",count:row.no,color:'var(--danger)'}]:[]),...(maybe?[{label:'Nice to have',count:row.maybe,color:'var(--amber)'}]:[]),
    ...(row.potentials??[]).map((count,i)=>({label:`P${i+1}`,count,color:potentialColors[i]}))];
  const total=slices.reduce((n,s)=>n+s.count,0);let angle=-Math.PI/2;
  return <ImportDialog title={`${row.name} · Pull plans`} className={styles.operatorDialog} onClose={onClose}>
    <div className={styles.operatorResultLayout}>
      <div className={styles.operatorResultArt}>{(portrait?.art??portrait?.icon)&&<ContentImg src={(portrait?.art??portrait?.icon)!} alt={`${row.name} artwork`} width={480} height={600}/>}</div>
      <div><p className="hint">{row.answers} answers on this banner. Percentages use the choices included below.</p>
        <div className={styles.chartFilters}><label className="check"><input type="checkbox" checked={skip} onChange={e=>setSkip(e.target.checked)}/>Include Skip</label><label className="check"><input type="checkbox" checked={maybe} onChange={e=>setMaybe(e.target.checked)}/>Include Maybe</label></div>
        {!total?<p className="notice">No answers match these filters.</p>:<svg className={styles.pieChart} viewBox="0 0 240 240" role="img" aria-label={`${row.name}: potential distribution, ${total} included answers`}>{slices.filter(s=>s.count).map(slice=>{
          const start=angle,end=angle+slice.count/total*Math.PI*2;angle=end;
          const path=`M 120 120 L ${120+100*Math.cos(start)} ${120+100*Math.sin(start)} A 100 100 0 ${end-start>Math.PI?1:0} 1 ${120+100*Math.cos(end)} ${120+100*Math.sin(end)} Z`;
          return slice.count===total?<circle key={slice.label} cx="120" cy="120" r="100" fill={slice.color}><title>{slice.label}: {slice.count} (100%)</title></circle>:<path key={slice.label} d={path} fill={slice.color}><title>{slice.label}: {slice.count} ({Math.round(slice.count/total*100)}%)</title></path>;
        })}</svg>}
        <dl className={styles.chartLegend}>{slices.map(slice=><div key={slice.label}><dt><i style={{background:slice.color}}/>{/^P\d$/.test(slice.label)&&<OperatorGameIcon label={`Potential ${slice.label.slice(1)}`} size={18}/>} {slice.label}</dt><dd>{slice.count} · {total?Math.round(slice.count/total*100):0}%</dd></div>)}</dl>
        {!row.potentials&&<p className="hint">Potential details are temporarily unavailable. Refresh results to retry.</p>}
      </div>
    </div>
  </ImportDialog>;
}
