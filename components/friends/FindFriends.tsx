import { useEffect, useMemo, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
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
  const [rows,setRows]=useState<(SupportPlayer&{collectionShared:boolean})[]>([]),[next,setNext]=useState<number|null>(null),[cursor,setCursor]=useState(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[attempt,setAttempt]=useState(0);
  const choices=useMemo(()=>operators.filter(op=>matchesSearch(op.name,query.trim())).sort((a,b)=>searchRelevance(a.name,query.trim())-searchRelevance(b.name,query.trim())).slice(0,20),[operators,query]);
  const filters=new URLSearchParams({server,operator,tag:query.trim()}).toString();
  useEffect(()=>{setCursor(0);setRows([]);setNext(null);},[filters]);
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setError('');
    const timer=setTimeout(()=>{void friendRequest<{listings:(SupportPlayer&{collectionShared:boolean})[];next:number|null}>(`?${filters}&cursor=${cursor}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
      .then(result=>{if(!controller.signal.aborted){setRows(previous=>cursor?[...previous,...result.listings]:result.listings);setNext(result.next);}})
      .catch(reason=>{if(!controller.signal.aborted){setRows([]);setNext(null);setError(reason instanceof Error?reason.message:'Friends could not load.');}})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[filters,cursor,attempt]);
  return <ImportDialog title="Find Friends" onClose={onClose} className={styles.profileDialog}>
    <div className={styles.filters}>
      <SearchInput label="Operator or in-game friend tag" value={query} onChange={setQuery} placeholder="Search an operator or friend tag…" suggestions={choices} getKey={op=>op.name} renderSuggestion={op=><span>{op.name}</span>} onPick={op=>{setOperator(op.name);setQuery('');}} suggestLabel="Matching operators" />
      <StyledSelect label="Friend server" value={server} onChange={setServer} options={Object.entries(SERVERS).map(([value,item])=>({value,label:item.label}))} />
      {operator&&<span className="filter-tag">{operator}<XButton dense label={`Remove operator: ${operator}`} onClick={()=>setOperator('')} /></span>}
      <InfoPopover label="About finding friends"><p>Only players who share their friend tag and support units are listed. Results use imports from the last seven days with open friend slots.</p><p>Pick an operator suggestion, or type an in-game friend tag. Operator searches use explicitly shared collections; otherwise they match equipped supports only. Anonymous statistics never expose a player’s roster.</p><p>Adding a player saves their Arkpedia profile link in this browser. It does not send an in-game friend request. Shared builds are self-reported import snapshots.</p></InfoPopover>
    </div>
    <p role="status">{busy?'Finding friends…':`${rows.length} player${rows.length===1?'':'s'}`}</p>
    {error&&<p role="alert">{error} <button type="button" className="btn-sm" onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>}
    {!busy&&!error&&!rows.length&&<div className="waiting-box"><h3>No matching friends</h3><p>Try another operator, in-game friend tag or server.</p></div>}
    <div className={styles.friendList}>{rows.map(row=><SharedFriendCard key={row.id} summary={{player:row,collectionShared:row.collectionShared,profileUpdatedAt:null}} map={map} operators={operators} onOpen={()=>onOpen(row.id)} actions={<>
      <button type="button" className="ghost btn-sm" aria-haspopup="dialog" onClick={()=>onOpen(row.id)}>View profile</button>
      <button type="button" className="btn-sm" disabled={saved.includes(row.id)} onClick={()=>{try{onAdd(row.id);setMessage(`${row.friendTag} added to Friends.`);}catch(reason){setError(reason instanceof Error?reason.message:'This browser could not save your friend.');}}}>{saved.includes(row.id)?'Added':'Add friend'}</button>
    </>} />)}</div>
    {next!==null&&!busy&&!error&&<button type="button" className="btn-sm" onClick={()=>setCursor(next)}>Load more friends</button>}
    {message&&<p role="status">{message}</p>}
  </ImportDialog>;
}
