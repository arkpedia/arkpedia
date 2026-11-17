import { useEffect, useMemo, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import XButton from '@/components/ui/XButton';
import InfoPopover from '@/components/ui/InfoPopover';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import type { FriendOperator } from '@/lib/account/friendCatalogue';
import type { SupportPlayer } from '@/lib/community/model';
import { SERVERS } from '@/lib/account-import/yostar';
import { useReleaseTable } from '@/lib/content/context';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { friendRequest } from '@/lib/friends/useSharedFriends';
import SharedFriendCard from './SharedFriendCard';
import styles from './Friends.module.css';

export default function FindFriends({operators,saved,onAdd,onOpen,onClose}:{operators:FriendOperator[];saved:string[];onAdd:(id:string)=>void;onOpen:(id:string)=>void;onClose:()=>void}) {
  const map=useReleaseTable<GameAccountMap>('game-account-map');
  const [query,setQuery]=useState(''),[operator,setOperator]=useState(''),[server,setServer]=useState('en');
  const [rows,setRows]=useState<(SupportPlayer&{collectionShared:boolean;supportsShared:boolean})[]>([]),[next,setNext]=useState<number|null>(null),[cursor,setCursor]=useState(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[attempt,setAttempt]=useState(0);
  const choices=useMemo(()=>operators.filter(op=>matchesSearch(op.name,query.trim())).sort((a,b)=>searchRelevance(a.name,query.trim())-searchRelevance(b.name,query.trim())).slice(0,20),[operators,query]);
  const filters=new URLSearchParams({server,operator,tag:query.trim()}).toString();
  useEffect(()=>{setCursor(0);setRows([]);setNext(null);},[filters]);
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setError('');
    const timer=setTimeout(()=>{void friendRequest<{listings:(SupportPlayer&{collectionShared:boolean;supportsShared:boolean})[];next:number|null}>(`?${filters}&cursor=${cursor}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
      .then(result=>{if(!controller.signal.aborted){setRows(previous=>cursor?[...previous,...result.listings]:result.listings);setNext(result.next);}})
      .catch(reason=>{if(!controller.signal.aborted){setNext(null);setError(reason instanceof Error?reason.message:'Players could not load.');}})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[filters,cursor,attempt]);
  return <ImportDialog title="Find players" onClose={onClose} className={styles.profileDialog}>
    <div className={styles.filters}>
      <SearchInput label="Operator or in-game friend tag" value={query} onChange={setQuery} placeholder="Search an operator or friend tag…" suggestions={choices} getKey={op=>op.name} renderSuggestion={op=><span>{op.name}</span>} onPick={op=>{setOperator(op.name);setQuery('');}} suggestLabel="Matching operators" />
      <StyledSelect label="Player server" value={server} onChange={setServer} options={Object.entries(SERVERS).map(([value,item])=>({value,label:item.label}))} />
      {operator&&<span className="filter-tag">{operator}<XButton dense label={`Remove operator: ${operator}`} onClick={()=>setOperator('')} /></span>}
      <InfoPopover label="About finding players"><p>Only players who enable Allow following are listed. Support sharing, import age and in-game friend slots do not control this list.</p><p>Pick an operator suggestion, or type an in-game friend tag. Operator searches use explicitly shared collections; otherwise they match equipped supports only. Anonymous statistics never expose a player’s roster.</p><p>Following a player saves their Arkpedia profile link in this browser. It does not send an in-game friend request. Shared builds are self-reported import snapshots.</p></InfoPopover>
    </div>
    <p role="status">{busy?'Finding players…':`${rows.length} player${rows.length===1?'':'s'}`}</p>
    {error&&<p role="alert">{error} <button type="button" className="btn-sm" onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>}
    {!busy&&!error&&!rows.length&&<div className="waiting-box"><h3>No matching players</h3><p>Try another operator, in-game friend tag or server.</p></div>}
    <div className={styles.friendList}>{rows.map(row=><SharedFriendCard key={row.id} summary={{player:row,collectionShared:row.collectionShared,supportsShared:row.supportsShared,profileUpdatedAt:null}} map={map} operators={operators} onOpen={()=>onOpen(row.id)} actions={<>
      <button type="button" className="ghost btn-sm" aria-haspopup="dialog" onClick={()=>onOpen(row.id)}>View profile</button>
      <button type="button" className="btn-sm" disabled={saved.includes(row.id)} onClick={()=>{try{onAdd(row.id);setMessage(`${row.friendTag} followed.`);}catch(reason){setError(reason instanceof Error?reason.message:'This browser could not follow this player.');}}}>{saved.includes(row.id)?'Following':'Follow'}</button>
    </>} />)}</div>
    {next!==null&&!busy&&!error&&<LoadOnScroll shown={rows.length} total={rows.length+1} onMore={()=>setCursor(next)} />}
    {message&&<p role="status">{message}</p>}
  </ImportDialog>;
}
