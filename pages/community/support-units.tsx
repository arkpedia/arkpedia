import { matchesSearch, normalizeForSearch, searchRelevance } from '@/lib/search/searchNormalize';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import XButton from '@/components/ui/XButton';
import StyledSelect from '@/components/ui/StyledSelect';
import InfoPopover from '@/components/ui/InfoPopover';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import FilterSheet from '@/components/ui/FilterSheet';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import FriendSupportDetails from '@/components/friends/FriendSupportDetails';
import type { SupportUnit } from '@/lib/account/accountStore';
import FriendCard, { FriendSupports } from '@/components/friends/FriendCard';
import { avatarSources, profileArtPath } from '@/lib/account/portraits';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { SERVERS } from '@/lib/account-import/yostar';
import type { SupportPlayer } from '@/lib/community/model';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { DATA_DIALOG_TABLES, fillAccountMap } from '@/lib/content/dataDialogTables';
import type { FriendOperator } from '@/lib/account/friendCatalogue';
import styles from '@/components/community/Community.module.css';
import SupportAvailability from '@/components/community/SupportAvailability';

interface Props {operators:FriendOperator[]}
export default function SupportUnits({operators}:Props){
  const [query,setQuery]=useQueryState('operator'),[server,setServer]=useQueryState('server','en'),[elite,setElite]=useQueryState('elite'),[skill,setSkill]=useQueryState('skill'),[mastery,setMastery]=useQueryState('mastery');
  const [tag,setTag]=useQueryState('tag');
  const [minLevel,setMinLevel]=useQueryState('minLevel','1'),[maxLevel,setMaxLevel]=useQueryState('maxLevel','90');
  const router=useRouter();
  const [filtersReady,setFiltersReady]=useState(false);
  // Query hooks apply URL filters in an effect. Fetch only after that render, so
  // a fast default response cannot expose an unfiltered support before hydration.
  useEffect(()=>{if(router.isReady)setFiltersReady(true);},[router.isReady]);
  const [rows,setRows]=useState<SupportPlayer[]>([]),[next,setNext]=useState<number|null>(null),[cursor,setCursor]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[copied,setCopied]=useState('');
  const [preview,setPreview]=useState<SupportPlayer|null>(null);
  const closePreview=useCallback(()=>setPreview(null),[]);
  const map=useReleaseTable<GameAccountMap>('game-account-map');
  const supportUnits=(row:SupportPlayer):SupportUnit[]=>row.supports.map(s=>({name:s.operator,rarity:catalogue.get(normalizeForSearch(s.operator))?.rarity??null,
    elite:s.elite,level:s.level,potential:s.potential??0,skill:s.skill,skillMastery:s.mastery,skillLevel:s.skillLevel,skillMasteries:s.skillMasteries,module:s.module,moduleLevel:s.moduleLevel,skillId:s.skillId,skin:s.skin,allMastered:s.allMastered===true}));
  const hold=useSwitchHold('community-supports');
  const catalogue=useMemo(()=>new Map(operators.map(op=>[normalizeForSearch(op.name),op])),[operators]);
  const selected=catalogue.get(normalizeForSearch(query.trim()));
  const choices=useMemo(()=>[...catalogue.values()].filter(op=>matchesSearch(op.name,tag.trim())).sort((a,b)=>searchRelevance(a.name,tag.trim())-searchRelevance(b.name,tag.trim())).slice(0,20),[catalogue,tag]);
  const filters=new URLSearchParams({server,tag:tag.trim(),operator:selected?.name??'',elite,skill,mastery,minLevel,maxLevel}).toString();
  useEffect(()=>{setCursor(0);},[filters]);
  useEffect(()=>{
    if(!filtersReady)return;
    const controller=new AbortController();
    if(query.trim()&&!selected){setBusy(false);setRows([]);setError('Choose an operator from the suggestions.');setNext(null);return;}
    if(!minLevel||!maxLevel||!Number.isInteger(Number(minLevel))||!Number.isInteger(Number(maxLevel))||Number(minLevel)<1||Number(maxLevel)>90||Number(minLevel)>Number(maxLevel)){setBusy(false);setRows([]);setNext(null);setError('Choose a level range from 1 to 90, with minimum no higher than maximum.');return;}
    setBusy(true);setError('');
    const timer=setTimeout(()=>{void fetch(`/api/community/supports?${filters}&cursor=${cursor}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error);if(controller.signal.aborted)return;setRows(previous=>cursor?[...previous,...body.listings]:body.listings);setNext(body.next);}).catch(e=>{if(!controller.signal.aborted){setRows([]);setNext(null);setError(e.message??'Support listings could not load.');}}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[filtersReady,filters,cursor,retry,query,selected,minLevel,maxLevel]);
  const reset=()=>{hold.capture();setQuery('');setTag('');setServer('en');setElite('');setSkill('');setMastery('');setMinLevel('1');setMaxLevel('90');};
  const active=[...Object.entries({server:server!=='en'?SERVERS[server as keyof typeof SERVERS]?.label:'',elite:elite!==''?`E${elite}`:'',skill:skill?`Skill ${skill}`:'',mastery:mastery!==''?`M${mastery}`:'',levels:minLevel!=='1'||maxLevel!=='90'?`Level ${minLevel}–${maxLevel}`:''})].filter(([,v])=>v).map(([key,label])=>({key,label,remove:()=>{hold.capture();if(key==='operator')setQuery('');if(key==='server')setServer('en');if(key==='elite')setElite('');if(key==='skill')setSkill('');if(key==='mastery')setMastery('');if(key==='levels'){setMinLevel('1');setMaxLevel('90');}}}));
  return <>
    <PageMeta title="Find support units" description="Find opted-in players with equipped support units and open friend slots." path="/community/support-units" noindex />
    <PageHeader eyebrow="Rhodes Island // Community" title="Find support units" sub="Equipped supports from players accepting friend requests."
      stickyActions actions={<div className={`${styles.filters} ${styles.supportToolbar}`}>
        <div className={styles.supportSearches}><SearchInput label="Operator or in-game tag" value={tag} onChange={value=>{hold.capture();setTag(value);}} placeholder="Search an operator or in-game tag…" suggestions={choices} getKey={op=>op.name} renderSuggestion={op=><span>{op.name}</span>} onPick={op=>{hold.capture();setQuery(op.name);setTag('');}} suggestLabel="Matching support operators" />
        </div>
        {selected&&<span className="filter-tag">{selected.name}<XButton dense label={`Remove operator: ${selected.name}`} onClick={()=>{hold.capture();setQuery('');}} /></span>}
        <FilterSheet controlsClassName={styles.filters} hold={hold} active={active} onReset={reset} controls={<div className={styles.filters}>
          <StyledSelect label="Support server" value={server} onChange={value=>{hold.capture();setServer(value);}} options={Object.entries(SERVERS).map(([value,s])=>({value,label:s.label}))} />
          <StyledSelect label="Promotion" value={elite} onChange={value=>{hold.capture();setElite(value);}} options={[{value:'',label:'Any promotion'},...[0,1,2].map(v=>({value:String(v),label:`E${v}`}))]} />
          <div className={styles.range}><label htmlFor="support-min">Level</label><input className="number-input" id="support-min" aria-label="Minimum level" type="number" min={1} max={90} value={minLevel} onChange={e=>{hold.capture();setMinLevel(e.target.value);}} /><span>–</span><input className="number-input" aria-label="Maximum level" type="number" min={1} max={90} value={maxLevel} onChange={e=>{hold.capture();setMaxLevel(e.target.value);}} /></div>
          <StyledSelect label="Selected support skill" value={skill} onChange={value=>{hold.capture();setSkill(value);}} options={[{value:'',label:'Any skill'},...[1,2,3].map(v=>({value:String(v),label:`Skill ${v}`}))]} />
          <StyledSelect label="Selected skill mastery" value={mastery} onChange={value=>{hold.capture();setMastery(value);}} options={[{value:'',label:'Any mastery'},...[0,1,2,3].map(v=>({value:String(v),label:v?`M${v}`:'No mastery'}))]} />
          <button type="button" className="ghost btn-sm filter-reset-inline" onClick={reset}>Reset filters</button>
        </div>} />
      </div>} />
    <main>
      <div className="account-shortcuts reading-copy"><span>Imports from the last 7 days · open slots</span>
        <InfoPopover label="About finding supports"><p>Search a friend tag directly, or select an operator from the suggestions. After selecting an operator, you can type a friend tag to narrow those results. These are the three operators currently equipped as support, not a player’s full roster. Mastery filters match the selected support skill exactly, so No mastery and M1 can find less-developed builds. Unknown mastery does not match those filters.</p><p>Slots and builds are self-reported import snapshots and can change in-game. A listing does not prove ownership or reserve a friend slot. Use the friend tag in Arknights on the matching server; Arkpedia does not send requests for you.</p><p>After checking in-game, signed-in members can report Friend list full or Has room. One report per member counts across all of that player’s supports. Reports count for 24 hours; at least three full reports, outnumbering Has room reports, temporarily hide a listing. A new import clears old reports. Reports are observations, not verified availability.</p><p>Choose Saving &amp; sharing in Account settings to share or withdraw your own listing. Private cloud saves do not opt you in.</p></InfoPopover>
        <Link href="/account?settings=community">Share my supports</Link>
      </div>
      <p role="status">{busy?'Checking support units…':`${rows.length} player${rows.length===1?'':'s'}${next!==null?' · more available':''}`}</p>
      {error?<p role="alert">{error} <button type="button" className="ghost btn-sm" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:!busy&&!rows.length?<div className="waiting-box"><h2>No matching support units</h2><p>Try another operator, in-game tag, server or build range. New community sharing starts empty until players opt in.</p></div>:null}
      <div className={styles.results} ref={hold.ref} style={hold.style}>
        {rows.map(row=>{
          const appearance=row.appearance,card=appearance?.nameCard??'nc_rhodes_default',variants=map.nameCardVariants?.[card];
          const strip=`${card}-strip${variants?`-${Math.min(appearance?.nameCardVariant??0,variants-1)}`:''}`;
          return <FriendCard key={row.id} name={row.friendTag}
          avatar={avatarSources(appearance??{},map.chars,new Map())[0]} background={profileArtPath('profile-namecards',strip)}
          metadata={<><span className="hint">{SERVERS[row.server].label}{appearance?.level?` · Level ${appearance.level}`:""} · {row.slots} open slots</span>{appearance&&<span className="hint">{appearance.operators} operators · {appearance.skins} skins</span>}<span className="hint">Imported {new Date(row.importedAt).toLocaleDateString()}</span></>}
          onProfile={()=>setPreview(row)} profileLabel={`View ${row.friendTag} support units`}
          supports={<FriendSupports map={map} units={supportUnits(row)} />}
          actions={<>
          <button type="button" className="ghost btn-sm" aria-label={`Copy friend tag ${row.friendTag}`} onClick={()=>void navigator.clipboard.writeText(row.friendTag).then(()=>setCopied(`${row.friendTag} copied`)).catch(()=>setCopied('Select the displayed friend tag to copy it.'))}>Copy tag</button>
          <SupportAvailability row={row} onReport={result=>{
            const listing=row.id.split(':')[0];
            setRows(previous=>result.hidden?previous.filter(r=>r.id.split(':')[0]!==listing):previous.map(r=>r.id.split(':')[0]===listing?{...r,fullReports:result.fullReports,openReports:result.openReports}:r));
            if(result.hidden)setCopied('Listing hidden after recent full friend-list reports.');
          }} />
        </>} />;})}
      </div>
      {next!==null&&!busy&&!error&&<LoadOnScroll shown={rows.length} total={rows.length+1} onMore={()=>setCursor(next)} />}
      <p role="status">{copied}</p>
    </main>
    {preview&&<FriendSupportDetails name={preview.friendTag} units={supportUnits(preview)} map={map} operators={operators} onClose={closePreview} />}
  </>;
}
export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/community/support-units',async()=>{
  const [{getAllOperators},{friendOperators}]=await Promise.all([import('@/lib/operators/operators'),import('@/lib/account/friendCatalogue')]);
  const map=await DATA_DIALOG_TABLES['game-account-map']();
  return {props:{operators:friendOperators(map,getAllOperators())}};
},{bundledWhenUnpublished:true,tables:{'game-account-map':DATA_DIALOG_TABLES['game-account-map']},finalize:fillAccountMap});
