import {ENDFIELD_POLL} from '@/lib/polls/endfield';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {usePullPollResults} from '@/lib/polls/usePullPollResults';
import {stampKey,type Ballot,type PollBanner,type PollPortrait,type PollBannerResult,type Stamp,type PollOperatorResult,type OwnedPotentials} from '@/lib/polls/pull-poll';
import {formatDayMonthYear} from '@/lib/pulls/format';
import {BannerArt,OperatorTile,bannerTitle} from './PullPollVisuals';
import PullPollOperatorResults from './PullPollOperatorResults';
import styles from './PullPoll.module.css';
import {pollPercent as percent} from '@/lib/polls/pull-poll-share';
import PullPollShareImage from './PullPollShareImage';
export function resultVerdict(row:PollBannerResult):{value:Stamp;label:string}{
  const verdict=row.pull>=row.maybe&&row.pull>=row.skip?'pull':row.maybe>=row.skip?'maybe':'skip';
  return {value:verdict,label:`${verdict} ${percent(row[verdict],row.answers)}%`};
}
export function ResultSplit({row,label}:{row:PollBannerResult;label?:string}){
  return <div className="poll-result-split" role="img" aria-label={`${label?`${label}: `:''}Pull ${percent(row.pull,row.answers)}%, Maybe ${percent(row.maybe,row.answers)}%, Skip ${percent(row.skip,row.answers)}%`}>
    {(['pull','maybe','skip'] as const).map(choice=><span key={choice} data-choice={choice} style={{width:`${row.answers?row[choice]/row.answers*100:0}%`}}/>)}</div>;
}
export default function PullPollResults({banners,portraits,ballot,detailed=false,owned={},edition='pull-or-skip'}:{edition?:'pull-or-skip' | typeof ENDFIELD_POLL;banners:PollBanner[];portraits:Record<string,PollPortrait>;ballot:Ballot;detailed?:boolean;owned?:OwnedPotentials}){
  const [selected,setSelected]=useState<PollOperatorResult|null>(null);
  const {result,error,retry}=usePullPollResults(edition);
  const [exportOpen,setExportOpen]=useState(false);
  const endfield = edition === ENDFIELD_POLL;
  const ids=new Set(banners.map(b=>b.id));
  const operatorRows=useMemo(()=>result?.operators.filter(row=>banners.some(b=>b.id===row.banner&&b.operators.includes(row.name)))??[],[result,banners]);
  const most=[...operatorRows].filter(r=>r.answers).sort((a,b)=>b.want/b.answers-a.want/a.answers||b.answers-a.answers)[0];
  const max=[...operatorRows].filter(r=>r.answers&&r.maxPotential).sort((a,b)=>b.maxPotential/b.answers-a.maxPotential/a.answers)[0];
  const skipped=result?.banners.filter(r=>ids.has(r.id)&&r.answers).sort((a,b)=>b.skip/b.answers-a.skip/a.answers)[0];
  return <div className={styles.results}>
    <div className={styles.resultsIntro}><p>{result?`${result.ballots.toLocaleString('en-US')} ${endfield ? (result.ballots===1?'player has':'players have') : (result.ballots===1?'Doctor has':'Doctors have')} shared their plans.${endfield?'':' Where’s the Orundum going?'}`:'Loading the community’s plans…'} <span className="hint">Updates every 30 seconds</span></p>
      <button className="ghost btn-sm" disabled={!skipped} onClick={()=>setExportOpen(true)} aria-haspopup="dialog">Export results</button>
    </div>
    {exportOpen&&result&&<PullPollShareImage banners={banners} results={result} initialDetailed={detailed} portraits={portraits} onClose={()=>setExportOpen(false)}/>}
    {error&&<p className="notice notice-danger" role="status">{error} <button className="ghost btn-sm" onClick={retry}>Retry results</button></p>}
    {result&&result.ballots===0&&<p className="notice">No entries yet. Be the first {endfield?'player':'Doctor'} to share a plan.</p>}
    {detailed&&!endfield&&result&&result.ballots>0&&<div className={styles.resultHighlights}>
      {most&&<div className={styles.resultHighlight}><OperatorTile name={most.name} portraits={portraits}/><div><span className="label-tag">Most wanted</span><strong>{most.name}</strong><span className="hint">{percent(most.want,most.answers)}% want a copy</span></div></div>}
      {skipped&&<div className={styles.resultHighlight}><div><span className="label-tag">Most skipped banner</span><strong>{bannerTitle(banners.find(b=>b.id===skipped.id)!)}</strong><span className="hint">{percent(skipped.skip,skipped.answers)}% skip</span></div></div>}
      {max&&<div className={styles.resultHighlight}><OperatorTile name={max.name} portraits={portraits}/><div><span className="label-tag">Biggest whale target</span><strong>{max.name}</strong><span className="hint">{percent(max.maxPotential,max.answers)}% going for P6</span></div></div>}
    </div>}
    {detailed&&<><h2 className="section-title">Banner by banner</h2>
    <p className="hint">{endfield ? 'Percentages use the answers for each illustration.' : 'A wanted operator counts as Pull; otherwise Good to have counts as Maybe. Percentages use answers for each banner or operator.'}</p></>}
    <div className={detailed?styles.banners:styles.simpleGrid}>{banners.map(banner=>{
      const row=result?.banners.find(r=>r.id===banner.id),mine=stampKey(ballot[banner.id],banner,portraits,owned);
      return <article key={banner.id} className={detailed?`${styles.resultBanner} poll-banner-surface`:`${styles.simpleBanner} panel`} aria-label={`${bannerTitle(banner)} results`}>
        <BannerArt banner={banner} portraits={portraits} stamp={row?.answers?resultVerdict(row):undefined}/>
        <div className={styles.resultBody}><div className={styles.resultHeading}>{!banner.artwork && <h3 className="entity-title entity-title-sm entity-title-name">{bannerTitle(banner)}</h3>}<span className="hint">{detailed && !banner.artwork?`${formatDayMonthYear(banner.start)} – ${formatDayMonthYear(banner.end)}`:row?.answers?`${row.answers.toLocaleString('en-US')} answers`:'No answers yet'}</span>{detailed&&mine&&<span className="poll-your-choice" data-stamp={mine}>You: {mine==='custom'?'picky':mine==='levi'?'leviathan':mine}</span>}</div>
          {detailed&&(row?.answers?<><div className={styles.resultLegend}>{(['pull','maybe','skip'] as const).map(choice=><span key={choice}><i data-choice={choice}/>{choice}<b>{percent(row[choice],row.answers)}%</b></span>)}<span className="hint">{row.answers.toLocaleString('en-US')} answers</span></div><ResultSplit row={row}/></>:<span className="hint">No answers for this banner yet.</span>)}
          {detailed&&banner.operators.length>0&&<div className={styles.resultOperators}>{banner.operators.map(name=>{const op=operatorRows.find(r=>r.banner===banner.id&&r.name===name);return <button key={name} className={`btn-bare ${styles.resultOperator}`} onClick={()=>setSelected(op??{banner:banner.id,name,answers:0,want:0,maybe:0,no:0,totalPotential:0,maxPotential:0,potentials:[0,0,0,0,0,0]})} aria-haspopup="dialog" aria-label={`View pull results for ${name} on ${bannerTitle(banner)}`}><OperatorTile name={name} portraits={portraits} small/><div><strong>{name}</strong><ResultSplit label={name} row={{id:name,answers:op?.answers??0,pull:op?.want??0,maybe:op?.maybe??0,skip:op?.no??0}}/></div><span className={styles.operatorPercent}>{op?<><b>{percent(op.want,op.answers)}%</b> want<br/>{op.want?`avg P${(op.totalPotential/op.want).toFixed(1)}`:'No copies yet'}</>:'No answers'}</span></button>;})}</div>}
        </div>
      </article>;
    })}</div>
    {selected&&<PullPollOperatorResults row={operatorRows.find(row=>row.banner===selected.banner&&row.name===selected.name)??selected} portrait={portraits[selected.name]} onClose={()=>setSelected(null)}/>}
    <Link className="ghost btn-sm" href="/polls">Community polls</Link>
  </div>;
}
