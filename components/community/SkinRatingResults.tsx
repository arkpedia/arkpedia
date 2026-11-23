import {useEffect,useMemo,useRef,useState} from 'react';
import type {PollSkin} from '@/lib/polls/skin-poll';
import type {SavedSkinRating,SkinRatingResult} from '@/lib/polls/skin-ratings';
import {skinRatingRows,personalRatingRows,SKIN_RATING_PRIOR,type SkinRatingRow} from '@/lib/polls/skin-rating-statistics';
import {matchesSearch} from '@/lib/search/searchNormalize';
import {ContentImg} from '@/components/content/ContentImage';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import ImportDialog from '@/components/account/ImportDialog';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SearchInput from '@/components/ui/SearchInput';
import InfoPopover from '@/components/ui/InfoPopover';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import ScrollRow from '@/components/ui/ScrollRow';
import PowerBoxPlot from '@/components/survey/PowerBoxPlot';
import RankingPodium from './RankingPodium';
import rankingStyles from './Statistics.module.css';
import galleryStyles from './SkinRatings.module.css';
import styles from './SkinRatingResults.module.css';

export interface ResultFilters {group:string;display:string;resultsQ:string;sort:string;order:string;detail:string;weighted:string;tierSize:string}
interface Props {ownRatings:ReadonlyMap<string,SavedSkinRating>|null;skins:PollSkin[];result:SkinRatingResult|null;error:string;onRetry:()=>void;filters:ResultFilters;onChange:(patch:Partial<ResultFilters>)=>void}
const scale={min:1,max:10,step:1};
const number=(value:number)=>value.toLocaleString('en-US',{maximumFractionDigits:2});
function useChartWidth(enabled=true){
  const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(560);
  useEffect(()=>{if(!enabled)return;const element=ref.current;if(!element)return;const measure=()=>setWidth(Math.max(1,Math.round(element.clientWidth)));measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[enabled]);
  return {ref,width};
}
function Plot({row,large=false}:{row:SkinRatingRow;large?:boolean}){
  const chart=useChartWidth(large);
  return <div ref={chart.ref}>{!row.stats?<span className="hint">Distribution unavailable</span>:<PowerBoxPlot row={{...row.stats,operator_name:row.name,mode:row.stats.modes[0]}} scale={scale} width={large?chart.width:150} height={large?96:40} showGridlines={large} showScaleEnds={!large}/>}</div>;
}
function RatingDistribution({row}:{row:SkinRatingRow}){
  const chart=useChartWidth(),histogram=row.histogram!,largest=Math.max(...histogram,1),width=chart.width,height=176,baseline=150,column=(width-12)/10;
  return <div ref={chart.ref}><svg className={styles.histogram} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${row.name}: rating distribution from 1 to 10`}>
    {histogram.map((count,i)=>{const x=6+i*column+column*.15,barWidth=column*.7,barHeight=count/largest*116;return <g key={i}><title>{i+1} out of 10: {count} ratings ({number(count/row.ratings*100)}%)</title><rect x={x} y={baseline-barHeight} width={barWidth} height={barHeight} fill="var(--teal)"/><text x={x+barWidth/2} y={baseline-barHeight-6} textAnchor="middle" fill="var(--text-dim)">{count>=1000?Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(count):count}</text><text x={x+barWidth/2} y={170} textAnchor="middle" fill="var(--text-dim)">{i+1}</text></g>;})}
  </svg></div>;
}
const statisticColumns=[{label:'Median',key:'median'},{label:'Middle 50%',key:''},{label:'Spread',key:'spread'},{label:'Distribution',key:''},{label:'Ratings',key:'ratings'}];
export default function SkinRatingResults({ownRatings,skins,result,error,onRetry,filters,onChange}:Props){
  const [shown,setShown]=useState(30),[viewing,setViewing]=useState<PollSkin|null>(null),group=filters.group==='operators'?'operators':'skins',display=['tierlist','detailed'].includes(filters.display)?filters.display:'podium';
  const compact=filters.tierSize==='compact';
  const tierImageSizes=compact?'(max-width: 720px) 72px, 88px':'(max-width: 720px) 45vw, 240px';
  const weighted=filters.weighted!=='off',activeSort=!weighted&&filters.sort==='score'?'mean':filters.sort;
  const rows=useMemo(()=>skinRatingRows(result?.ranking??[],skins,group,weighted),[result,skins,group,weighted]);
  const personal=useMemo(()=>personalRatingRows(ownRatings??new Map(),skins,group),[ownRatings,skins,group]);
  const primary=(row:SkinRatingRow)=>weighted?row.weightedScore:row.total/row.ratings;
  const sortColumns=[...(weighted?[{label:'Weighted Rating',key:'score'}]:[]),{label:'Average',key:'mean'},{label:'Your score',key:''},...statisticColumns];
  const yourScore=(row:SkinRatingRow,{labelled=false,comparison=true}={})=>{
    const own=personal.get(row.id),difference=own?own.score-row.total/row.ratings:0;
    return <span className={styles.yourScore}><span>{labelled?'Your score ':''}{own?`${number(own.score)}/10`:'—'}</span>{own&&comparison&&<small className="hint">{Math.abs(difference)<.005?'Matches average':`${difference>0?'+':''}${number(difference)} vs average`}{group==='operators'?` · ${own.ratings} rated skins`:''}</small>}</span>;
  };
  const matching=rows.filter(row=>matchesSearch(`${row.name} ${row.operator}`,filters.resultsQ));
  const selected=rows.find(row=>row.id===filters.detail),showPodium=!filters.resultsQ.trim(),listStart=showPodium?3:0;
  const change=(patch:Partial<ResultFilters>)=>{setShown(30);onChange(patch);};
  const groups=new Map<string,SkinRatingRow[]>();for(const row of matching.slice(0,shown)){const tier=(Math.round(primary(row)*10)/10).toFixed(1);groups.set(tier,[...(groups.get(tier)??[]),row]);}
  const sortValue=(row:SkinRatingRow)=>filters.sort==='ratings'?row.ratings:filters.sort==='median'?row.stats?.median:filters.sort==='spread'?row.stats?row.stats.q3-row.stats.q1:undefined:filters.sort==='mean'?row.total/row.ratings:primary(row);
  const sorted=[...matching].sort((a,b)=>{const av=sortValue(a),bv=sortValue(b);return av===undefined?bv===undefined?a.rank-b.rank:1:bv===undefined?-1:(filters.order==='asc'?av-bv:bv-av)||a.rank-b.rank;});
  const details=(row:SkinRatingRow)=>onChange({detail:row.id});
  const openArt=(row:SkinRatingRow)=>setViewing(skins.find(skin=>skin.id===row.id)??skins.find(skin=>skin.image===row.image&&skin.operator===row.operator)??null);
  const artwork=(row:SkinRatingRow,size:number)=>row.image&&<button type="button" className={`btn-bare ${styles.rankingArt}`} aria-haspopup="dialog" aria-label={`View full artwork of ${row.name}`} onClick={()=>openArt(row)}><ContentImg src={row.image} width={size} height={size} alt=""/></button>;
  const viewer=viewing?.image&&<SkinZoomOverlay image={viewing.image} name={viewing.name} voiceOperator={viewing.operator} dynamic={viewing.dynamic??null} alternate={viewing.alternate??null} closeLabel={selected?'Back to statistics':'Back to ranking'} onClose={()=>setViewing(null)}/>;
  return <>
    <div inert={!!viewing}>
    <div className={rankingStyles.resultToolbar}>
      <SegmentedControl label="Results by" value={group} onChange={group=>change({group,detail:''})} options={[{value:'skins',label:'Skins'},{value:'operators',label:'Operators'}]}/>
      <div className={rankingStyles.sample}><span className="hint">{result?`${result.ratings.toLocaleString('en-US')} ratings · ${result.raters.toLocaleString('en-US')} ${result.raters===1?'rater':'raters'}`:'Loading…'}</span><InfoPopover label="How poll results work"><p>This is a test poll. Have fun and don’t take the results too seriously.</p><p>Weighted Rating balances each average score with its vote count. It starts each entry with {SKIN_RATING_PRIOR} reference ratings at the overall community average, then lets real ratings take over. Turn it off to rank raw averages. Submitted ratings and distributions never change.</p><p>Your score is your saved rating; comparisons use the raw community average. Your operator score averages the skins you have rated; unrated skins do not count.</p><p>Community operator results pool all ratings across their skins: one person may contribute several ratings. Unrated skins are excluded.</p><p>Tier rows round the selected ranking score to one decimal. Equal ranking scores share a rank; more ratings settle display order. Results refresh every 30 seconds while visible.</p><p>The box spans the middle half of ratings; its line is the median and its dot the average. Whiskers mark the 5th and 95th percentiles. Percentiles use linear interpolation, so they can fall between whole-number scores. Spread is Q3 minus Q1; standard deviation measures the spread of all ratings. A single rating has zero spread and is a small sample.</p></InfoPopover></div>
    </div>
    <div className={styles.weighting}><label className="check"><input type="checkbox" checked={weighted} onChange={e=>change({weighted:e.target.checked?'on':'off',sort:'score',order:'desc'})}/>Weighted Rating</label></div>
    <div className={styles.controls}>
      <div className={styles.viewControls}>
        <SegmentedControl label="Results view" value={display} onChange={display=>change({display})} options={[{value:'podium',label:'Podium'},{value:'tierlist',label:'Tier list'},{value:'detailed',label:'Detailed'}]}/>
        {display==='tierlist'&&<label className="check"><input type="checkbox" checked={compact} onChange={event=>change({tierSize:event.target.checked?'compact':'full'})}/>Compact tier list</label>}
      </div>
      <SearchInput label="Search results by operator or skin name" placeholder="Search results…" value={filters.resultsQ} onChange={resultsQ=>change({resultsQ})}/>
    </div>
    {error&&<p className="notice notice-danger" role="status">{error} <button className="ghost btn-sm" onClick={onRetry}>Retry results</button></p>}
    {result&&matching.length===0?<p className="notice" role="status">{rows.length?'No results match your search.':'No ratings yet. Rate a skin to get things started.'}</p>:display==='podium'?<>
      {showPodium&&<RankingPodium entries={matching.slice(0,3).map(row=>({id:row.id,rank:row.rank,name:row.name,operator:group==='skins'?row.operator:undefined,image:row.image,value:`${primary(row).toFixed(2)}/10`,unit:weighted?'Weighted Rating':'Average rating',detail:<span className={styles.scoreDetails}><span>{row.ratings} {row.ratings===1?'rating':'ratings'}{weighted?` · Average ${(row.total/row.ratings).toFixed(2)}`:''}</span>{yourScore(row,{labelled:true})}</span>,onClick:()=>details(row),onArtClick:row.image?()=>openArt(row):undefined}))}/>}
      {matching.length>listStart&&<ScrollRow label="Ranking scores" controls persistentScrollbar className={styles.rankingScroll}><table className={rankingStyles.table} aria-label={showPodium?'Rankings from fourth place':'Matching rankings'}><thead><tr><th scope="col">#</th><th scope="col">{group==='skins'?'Skin':'Operator'}</th><th scope="col">{weighted?'Weighted Rating':'Average rating'}</th><th scope="col">Your score</th></tr></thead><tbody>{matching.slice(listStart,shown).map(row=><tr key={row.id}><td>{row.rank}</td><td><div className={rankingStyles.entity}>{artwork(row,44)}<button className="btn-bare" aria-haspopup="dialog" onClick={()=>details(row)} aria-label={`${row.name}: show rating statistics`}><span>{row.name}{group==='skins'&&<small>{row.operator}</small>}</span></button></div></td><td>{primary(row).toFixed(2)}/10<small className="hint"><br/>{weighted?`Average ${(row.total/row.ratings).toFixed(2)} · `:''}{row.ratings} {row.ratings===1?'rating':'ratings'}</small></td><td>{yourScore(row)}</td></tr>)}</tbody></table></ScrollRow>}
    </>:display==='tierlist'?<div aria-label="Ratings tier list">
      {[...groups].map(([tier,entries])=><section className={galleryStyles.tier} key={tier} aria-label={`${weighted?'Weighted rating':'Average'} ${tier} out of 10`}>
        <div className={galleryStyles.tierScore} aria-hidden="true">{tier}</div>
        <div className={galleryStyles.catalogue} data-compact={compact||undefined}>
          {entries.map(row=><div className={styles.tile} key={row.id}>
            <button type="button" className={`btn-bare pick-card pick-card-picture ${galleryStyles.art}`} onClick={()=>openArt(row)} disabled={!row.image}
              aria-haspopup="dialog" aria-label={`View full artwork of ${row.name}`} title={`${row.name} · ${primary(row).toFixed(2)}/10 ${weighted?'weighted':'average'} · ${row.ratings} ratings${weighted?` · Average ${(row.total/row.ratings).toFixed(2)}`:''}`}>
              {row.image?<ResponsiveSkinArtwork src={row.image} alt="" width={220} height={220} sizes={tierImageSizes}/>:<span className={`art-placeholder ${galleryStyles.missing}`}>No artwork</span>}
            </button>
            <span><button className="btn-bare" onClick={()=>details(row)} aria-haspopup="dialog" aria-label={`${row.name}${group==='skins'?` by ${row.operator}`:''}: show rating statistics`}>{row.name}</button></span>
            {group==='skins'&&<small>{row.operator}</small>}
            {yourScore(row,{labelled:true,comparison:false})}
          </div>)}
        </div>
      </section>)}
    </div>:<ScrollRow label="Detailed rating statistics" controls persistentScrollbar className={styles.tableScroll}><table className={styles.table} aria-label="Detailed rating statistics"><thead><tr><th scope="col">{group==='skins'?'Skin':'Operator'}</th>{sortColumns.map(column=><th scope="col" key={column.label} aria-sort={column.key?(activeSort===column.key?(filters.order==='asc'?'ascending':'descending'):'none'):undefined}>{column.key?<button className="ghost btn-sm" onClick={()=>change({sort:column.key,order:activeSort===column.key&&filters.order==='desc'?'asc':'desc'})}>{column.label} <span aria-hidden="true">{activeSort===column.key?(filters.order==='asc'?'↑':'↓'):'↕'}</span></button>:column.label}</th>)}</tr></thead><tbody>{sorted.slice(0,shown).map(row=><tr key={row.id}><td><div className={styles.tableEntity}>{artwork(row,36)}<button className="btn-bare" onClick={()=>details(row)} aria-haspopup="dialog" aria-label={`${row.name}: show rating statistics`}><span>{row.name}{group==='skins'&&<small>{row.operator}</small>}</span></button></div></td>{weighted&&<td>{row.weightedScore.toFixed(2)}</td>}<td>{(row.total/row.ratings).toFixed(2)}</td><td>{yourScore(row)}</td><td>{row.stats?number(row.stats.median):'—'}</td><td>{row.stats?`${number(row.stats.q1)} – ${number(row.stats.q3)}`:'—'}</td><td>{row.stats?number(row.stats.q3-row.stats.q1):'—'}</td><td><button className={`ghost ${styles.plotButton}`} onClick={()=>details(row)} aria-haspopup="dialog" aria-label={`${row.name}: show rating distribution`}><Plot row={row}/></button></td><td>{row.ratings.toLocaleString('en-US')}</td></tr>)}</tbody></table></ScrollRow>}
    <LoadOnScroll shown={Math.min(shown,matching.length)} total={matching.length} onMore={()=>setShown(n=>n+30)}/>
    </div>
    {selected&&<ImportDialog title={selected.name} className={styles.detailDialog} dismissible={!viewing} onClose={()=>onChange({detail:''})} actions={!viewing&&<button className="ghost btn-sm" onClick={()=>onChange({detail:''})}>Back to ranking</button>}>
      <div inert={!!viewing}><div className={styles.detailHeader}>{selected.image&&<button className={`btn-bare ${styles.detailArt}`} aria-haspopup="dialog" aria-label={`View full artwork of ${selected.name}`} onClick={()=>openArt(selected)}><ResponsiveSkinArtwork src={selected.image} alt="" width={100} height={120} sizes="100px"/></button>}<div>{group==='skins'&&<p className="entity-title entity-title-sm entity-title-name">{selected.operator}</p>}<p className="hint">#{selected.rank} · {selected.ratings.toLocaleString('en-US')} {selected.ratings===1?'rating':'ratings'}{group==='operators'?' across this operator’s skins':''}</p>{weighted&&<p>{selected.weightedScore.toFixed(2)}/10 Weighted Rating</p>}<p>{(selected.total/selected.ratings).toFixed(2)}/10 average</p>{yourScore(selected,{labelled:true})}{selected.ratings<5&&<p className="hint">Small sample — results may change quickly.</p>}</div></div>
      {selected.stats&&selected.histogram?<>
        <h3 className="section-title">Box plot</h3><Plot row={selected} large/>
        <h3 className={`section-title ${styles.chartTitle}`}>Rating distribution</h3><RatingDistribution row={selected}/>
        <dl className={styles.summary}>{[['5th percentile',selected.stats.p5],['Q1',selected.stats.q1],['Median',selected.stats.median],['Q3',selected.stats.q3],['95th percentile',selected.stats.p95],['Lowest',selected.stats.min],['Highest',selected.stats.max],['Standard deviation',selected.stats.deviation]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{number(value as number)}</dd></div>)}<div><dt>Most common</dt><dd>{selected.stats.modes.map(number).join(', ')}</dd></div></dl>
        <details className={styles.breakdown}><summary>Counts and percentages</summary><table className={styles.countTable} aria-label="Rating counts and percentages"><thead><tr><th scope="col">Score</th><th scope="col">Ratings</th><th scope="col">Share</th></tr></thead><tbody>{selected.histogram.map((count,i)=><tr key={i}><th scope="row">{i+1}/10</th><td>{count.toLocaleString('en-US')}</td><td>{number(count/selected.ratings*100)}%</td></tr>)}</tbody></table></details>
      </>:<p className="notice">Detailed distribution is not available yet. Try refreshing the results.</p>}
      </div>{viewer}
    </ImportDialog>}
    {viewing&&!selected&&<ImportDialog title={viewing.name} dismissible={false} onClose={()=>setViewing(null)}>{viewer}</ImportDialog>}
  </>;
}
