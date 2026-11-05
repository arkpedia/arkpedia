import { ContentImg } from '@/components/content/ContentImage';
import { useEffect,useMemo,useState,type CSSProperties,type ReactNode } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import PageMeta from '@/components/layout/PageMeta';
import { matchesSearch } from '@/lib/search/searchNormalize';
import PageHeader from '@/components/ui/PageHeader';
import StyledSelect from '@/components/ui/StyledSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SearchInput from '@/components/ui/SearchInput';
import InfoPopover from '@/components/ui/InfoPopover';
import FilterSheet, { INLINE_RESET } from '@/components/ui/FilterSheet';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import LocalTime from '@/components/ui/LocalTime';
import ImportDialog from '@/components/account/ImportDialog';
import RankingPodium from '@/components/community/RankingPodium';
import { statisticsMetrics,statisticsRankings,formatRankingValue,displayStatisticsMetric,type StatisticsOperator,type StatisticsMetric,type RankingRow } from '@/components/community/statisticsModel';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import { useQueryRecord } from '@/lib/hooks/useQueryState';
import { COMMUNITY_MIN_SAMPLE } from '@/lib/community/model';
import type { CommunityRankings } from '@/lib/community/rankings';
import { withContentPage } from '@/lib/content/server';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { CountUp, StatisticsHero, useStaggerReveal } from '@/components/community/StatisticsScene';
import styles from '@/components/community/StatisticsRankings.module.css';

interface Props {operators:StatisticsOperator[]}
const defaults={q:'',metric:'',section:'roster',mode:'absolute',order:'desc',class:'',rarity:'',server:'all',stage:''};
export default function CommunityStatistics({operators}:Props){
  const [filters,set]=useQueryRecord(defaults),[data,setData]=useState<CommunityRankings|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const hold=useSwitchHold('community-rankings');
  const relative=filters.mode==='relative'||['unraised-rate','bench-rate'].includes(filters.metric);
  const metrics=useMemo(()=>statisticsMetrics.map(metric=>displayStatisticsMetric(metric,relative)),[relative]);
  const metricId=filters.metric==='unraised-rate'?'unraised':['least','bench-rate'].includes(filters.metric)?'benched':filters.metric;
  const selected=metrics.find(m=>m.value===metricId),battle=selected?.battle??filters.section==='battles';
  const stage=battle?filters.stage:'';
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    const query=new URLSearchParams({server:filters.server});if(stage)query.set('stage',stage);
    const timer=setTimeout(()=>{void fetch(`/api/community/rankings?${query}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);if(!controller.signal.aborted)setData(v);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[filters.server,stage,retry]);
  const rankings=useMemo(()=>statisticsRankings(operators,data,{class:filters.class,rarity:filters.rarity,relative,order:filters.order}),[operators,data,filters.class,filters.rarity,relative,filters.order]);
  const section=battle?'battles':'roster',leadMetric=metrics.find(m=>m.battle===battle)!,lead=(rankings.get(leadMetric.value)??[])[0];
  const revealRef=useStaggerReveal<HTMLUListElement>(`${section}:${data?'ready':'waiting'}`);
  const reset=()=>{hold.capture();set({class:'',rarity:'',server:'all',stage:''});};
  const narrow=(next:Partial<typeof defaults>)=>{hold.capture();set(next);};
  const filterControls=<>
    {selected?.value!=='clears'&&<><StyledSelect label="Class" value={filters.class} onChange={value=>narrow({class:value})} options={[{value:'',label:'All classes'},...Array.from(new Set(operators.map(op=>op.className))).filter(Boolean).sort().map(v=>({value:v,label:v}))]}/>
    <StyledSelect label="Rarity" value={filters.rarity} onChange={rarity=>narrow({rarity})} options={[{value:'',label:'All rarities'},...[6,5,4,3,2,1].map(v=>({value:String(v),label:`${v}★`}))]}/>
    </>}<StyledSelect label="Region" value={filters.server} onChange={server=>narrow({server})} options={[{value:'all',label:'All regions'},{value:'en',label:'Global'},{value:'jp',label:'JP'},{value:'kr',label:'KR'}]}/>
    <button type="button" className={`ghost ${INLINE_RESET}`} onClick={reset}>Reset</button>
  </>;
  const tools=<div className={styles.rankingControls}>
    <div className={styles.filters}><FilterSheet controlsClassName={styles.filters} hold={hold} onReset={reset} active={(selected?.value==='clears'?['server']:['class','rarity','server']).filter(k=>filters[k as 'class'|'rarity'|'server']!==defaults[k as 'class'|'rarity'|'server']).map(key=>({key,label:key==='rarity'?`${filters.rarity}★`:filters[key as 'class'|'server'],remove:()=>narrow({[key]:defaults[key as 'class'|'rarity'|'server']})}))} controls={filterControls}/></div>
    <SegmentedControl label="Ranking order" value={filters.order==='asc'?'asc':'desc'} onChange={order=>{hold.capture();set({order});}} options={[{value:'desc',ariaLabel:'Descending',title:'Descending',label:<><span className={styles.orderArrow} aria-hidden="true">↓</span><span className={styles.orderLabel}>Descending</span></>},{value:'asc',ariaLabel:'Ascending',title:'Ascending',label:<><span className={styles.orderArrow} aria-hidden="true">↑</span><span className={styles.orderLabel}>Ascending</span></>}]}/>
    <SegmentedControl label="Ranking mode" value={relative?'relative':'absolute'} onChange={mode=>{hold.capture();set({mode,metric:selected?.value??filters.metric});}} options={[{value:'absolute',label:'Absolute'},{value:'relative',label:'Relative'}]}/>
  </div>;
  const sample=<span className="hint">{data?selected?.value==='clears'?`${(data.clearContributors??0).toLocaleString('en-US')} contributors · ${(data.clearRecords??0).toLocaleString('en-US')} stage counters`:battle?`${data.replayContributors.toLocaleString('en-US')} contributors · ${data.replays.toLocaleString('en-US')} saved runs`:`${data.contributors.toLocaleString('en-US')} contributors`:'Loading…'}{data?.source==='production-snapshot'?' · Production snapshot':''}</span>;
  const unavailable=error?<p className="notice notice-danger" role="status">{error} <button className="ghost btn-sm" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:!data?<p role="status">Loading rankings…</p>:(selected?.value==='clears'?data.stageClears:selected?.value==='stage-coverage'?data.stageCoverage:battle?data.battles:data.roster)==null?<p className="notice" role="status">Waiting for {COMMUNITY_MIN_SAMPLE} {battle?'auto-deploy':'roster'} contributors {filters.stage&&battle?'for this stage':'in the selected region'}.</p>:null;
  return <>
    <PageMeta title="Community statistics" description="Explore operator upgrades and anonymous saved auto-deploy statistics from contributing Arkpedia players." path="/community/statistics"/>
    <PageHeader eyebrow="Rhodes Island // Community" slim title="Community statistics" sub="Operator upgrades and recorded squad usage." stickyActions actions={<div className={styles.pageControls}>
      <Tabs label="Statistic categories" id="community-statistics-kind" value={battle?'battles':'roster'} onChange={section=>{hold.capture();set({section,metric:'',q:''});}} options={[{value:'roster',label:'Roster'},{value:'battles',label:'Operator Usage'}]}/>
      {tools}
    </div>}/>
    <main>
      <div className={styles.sample}>{sample}<InfoPopover label="How community rankings work">
        {data?.source==='production-snapshot'&&data.capturedAt?<p>Preview uses anonymous production totals captured <LocalTime iso={data.capturedAt} precision="minute"/>. These totals stay fixed during this test. Preview accounts and votes use separate storage.</p>:<p>Rankings use current anonymous contributions. Reload the page to refresh the totals.</p>}
        <p>Only opted-in contributions count. Each game account contributes one current roster. Operator Usage uses uploaded auto-deploy data only: stages that cannot save an auto-deploy are not included, even if cleared. Each game account contributes one current saved run per stage. Stage clears use lifetime counters from those auto-deploy records, with duplicate uploads counted once. Operator stage coverage counts distinct cleared stages with a recorded deployment; it does not reconstruct historical farming squads.</p>
        <p>Skills count recorded manual activations, excluding automatic or passive triggers. Summons and unknown operator IDs are excluded. Bench rankings include squad talents and trust farming.</p>
        <p>Absolute shows totals. Relative shows percentages, with the denominator shown in each ranking. Class and rarity narrow the operators without changing the community sample.</p>
        <p>This is a voluntary sample, not all Arknights players. Each selected roster or replay cohort needs at least {COMMUNITY_MIN_SAMPLE} contributors. Equal values share a rank.</p>
      </InfoPopover></div>
      {battle&&<p className="hint">Auto-deploy data only. Clears from stages that cannot save auto-deploys are not included.</p>}
      <StatisticsHero data={data} battle={battle} rankings={rankings} lead={lead} leadLabel={leadMetric.label}/>
      <section {...tabPanelProps('community-statistics-kind',battle?'battles':'roster')} ref={hold.ref} style={hold.style}>
        {unavailable??<ul ref={revealRef} data-stats-section={section} className={`directory-grid ${styles.cards}`} aria-label="Operator rankings">{metrics.filter(m=>m.battle===battle).map(metric=>{const top=(rankings.get(metric.value)??[])[0];return <li key={metric.value} data-stats-reveal>
          <button type="button" className={`btn-bare directory-card lift ${styles.rankingCard}`} aria-haspopup="dialog" aria-label={metric.label} onClick={()=>set({metric:metric.value,section:battle?'battles':'roster',mode:relative?'relative':'absolute',q:''})}>
            {top?.entity.art&&<span className={styles.cardArt} aria-hidden="true" data-stats-art><ResponsiveSkinArtwork key={top.entity.name} src={top.entity.art} alt="" sizes="240px" className={styles.cardImage}/></span>}
            <span className={`entity-title entity-title-sm entity-title-name ${styles.cardTitle}`}>{metric.label}</span>
            <span className={styles.cardUnit}>{metric.unit}</span>
            {(rankings.get(metric.value)??[]).length?<span className={styles.preview}>{(rankings.get(metric.value)??[]).slice(0,3).map(row=><span className={styles.previewRow} key={row.key}>
              <span className={styles.previewRank}>{row.rank}</span><span className={styles.previewIcons}>{row.entity.icon&&<ContentImg src={row.entity.icon} alt="" width={40} height={40}/>} {row.entity.skillIcon&&<ContentImg className={styles.skillIcon} src={row.entity.skillIcon} alt="" width={28} height={28}/>}</span><span className={styles.previewName}>{row.entity.name}{row.suffix&&<small>{row.suffix}</small>}</span><strong className={styles.number}>{metric.relative?formatRankingValue(row.value,metric):<CountUp value={row.value} format={v=>formatRankingValue(v,metric)}/>}</strong>
            </span>)}</span>:<span className={styles.cardEmpty}>No {metric.value==='clears'?'stages':'operators'} match these filters.</span>}
            <span className={styles.cardFooter}>View ranking <span aria-hidden="true">↗</span></span>
          </button>
        </li>;})}</ul>}
      </section>
      <section className="op-section"><Link className="ghost btn-sm" href="?settings=community">Manage community sharing</Link></section>
    </main>
    {selected&&<StatisticsLeaderboard key={selected.value} metric={selected} rows={rankings.get(selected.value)??[]} query={filters.q} onQuery={q=>set({q})} onClose={()=>set({metric:'',section:battle?'battles':'roster',mode:relative?'relative':'absolute',q:''})} controls={tools} sample={sample} unavailable={unavailable}/>}
  </>;
}
function StatisticsLeaderboard({metric,rows,query,onQuery,onClose,controls,sample,unavailable}:{metric:StatisticsMetric;rows:RankingRow[];query:string;onQuery:(value:string)=>void;onClose:()=>void;controls:ReactNode;sample:ReactNode;unavailable:ReactNode}){
  const [shown,setShown]=useState(30);
  useEffect(()=>setShown(30),[rows,query]);
  const isStage=metric.value==='clears',entityLabel=isStage?'stages':'operators';
  const matching=rows.filter(row=>matchesSearch(`${row.entity.name} ${row.suffix}`,query)),podium=!query.trim(),listed=podium?matching.slice(3):matching;
  // Each row's bar compares its current count or percentage with the longest in the list.
  const longest=Math.max(0,...matching.map(row=>row.value));
  return <ImportDialog title={metric.label} className={styles.rankingDialog} onClose={onClose}>
    <p className={styles.description}>{metric.description}</p>
    <div className={styles.dialogControls}><SearchInput label={`Search ${entityLabel}`} placeholder={`Search ${entityLabel}…`} value={query} onChange={onQuery}/>{controls}</div>
    <div className={styles.rankingSummary}>{sample}<span className="hint">{matching.length.toLocaleString('en-US')} {['activations','m3'].includes(metric.value)?'skills':entityLabel}</span></div>
    {unavailable??(matching.length===0?<p className="notice" role="status">No {entityLabel} match these filters.</p>:<>
      {podium&&<div data-stats-podium><RankingPodium entries={matching.slice(0,3).map(row=>({id:row.key,rank:row.rank,name:row.entity.name,operator:row.suffix||undefined,skillIcon:row.entity.skillIcon,image:row.entity.art??row.entity.icon,value:formatRankingValue(row.value,metric),unit:metric.unit,detail:row.detail,href:row.entity.href}))}/></div>}
      {listed.length>0&&<table className={styles.rankingTable} aria-label={`${metric.label} ranking`}><thead><tr><th scope="col">#</th><th scope="col">{isStage?'Stage':'Operator'}</th><th scope="col">{metric.unit}</th></tr></thead><tbody>{listed.slice(0,shown).map((row,i)=><tr key={row.key}><td>{row.rank}</td><td><div className={styles.operator} data-skill={!!row.entity.skillIcon}><span className={styles.operatorIcons}>{row.entity.icon&&<ContentImg src={row.entity.icon} alt="" width={44} height={44}/>} {row.entity.skillIcon&&<ContentImg className={styles.skillIcon} src={row.entity.skillIcon} alt="" width={32} height={32}/>}</span><span className={`reading-copy ${styles.operatorName}`}><Link href={row.entity.href}>{row.entity.name}</Link>{row.suffix&&<small>{row.suffix}</small>}{row.entity.subtitle&&<small>{row.entity.subtitle}</small>}</span><span className={styles.bar} data-stats-bar aria-hidden="true" style={{'--stats-w':longest?row.value/longest:0,'--stats-i':i%10,'--stats-bar':`var(--rarity-${row.operator?.rarity||1})`} as CSSProperties}/></div></td><td><strong className={styles.number}>{formatRankingValue(row.value,metric)}</strong>{row.detail&&<small>{row.detail}</small>}</td></tr>)}</tbody></table>}
      <LoadOnScroll shown={Math.min(shown,listed.length)} total={listed.length} onMore={()=>setShown(n=>n+30)}/>
    </>)}
  </ImportDialog>;
}
export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/community/statistics',async()=>{
  const {communityOperators}=await import('@/lib/community/catalogues');
  const operators=await communityOperators();
  return {props:{operators}};
},{bundledWhenUnpublished:true});
