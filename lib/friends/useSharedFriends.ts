import { useCallback, useEffect, useRef, useState } from 'react';
import { FRIENDS_STORAGE_KEY, FRIEND_STORAGE_KEY } from '@/lib/account/friendFile';
import { FRIEND_LINKS_KEY, isFriendLinkId, parseFriendLinks, type SharedFriend, type SharedFriendSummary } from './sharedProfile';

export async function friendRequest<T>(query: string, options: RequestInit = {}): Promise<T> {
  const params = query.startsWith('?') ? query.slice(1) : query;
  const response = await fetch(`/api/community/friends?${params}`, {credentials:'same-origin',cache:'no-store',...options});
  const body = await response.json();
  if (!response.ok) throw Error(body.error ?? 'Shared profiles could not load.');
  return body as T;
}

function manualCount() {
  try {
    const raw = localStorage.getItem(FRIENDS_STORAGE_KEY);
    const data = raw && raw.length <= 4_000_000 ? JSON.parse(raw) : null;
    return Array.isArray(data?.friends) ? Math.min(50,data.friends.length) : localStorage.getItem(FRIEND_STORAGE_KEY) ? 1 : 0;
  } catch { return 0; }
}

/** Saved remote friends contain IDs only; recheck consent before offering a collection. */
export function useSharedFriends(loadProfiles = true) {
  const [ids,setIds] = useState<string[]>([]), [profiles,setProfiles] = useState<Map<string,SharedFriendSummary>>(new Map());
  const [checking,setChecking] = useState(false), [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    const load = () => { try { setIds(parseFriendLinks(localStorage.getItem(FRIEND_LINKS_KEY))); } catch { setIds([]); } };
    load();
    const storage = (event: StorageEvent) => { if (!event.key || event.key === FRIEND_LINKS_KEY) load(); };
    window.addEventListener('storage',storage); return () => window.removeEventListener('storage',storage);
  },[]);
  const key = ids.join(',');
  useEffect(() => {
    if (!loadProfiles || !key) { setProfiles(new Map());setChecking(false);return; }
    let active = true, controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();controller = new AbortController();const current = controller;
      setChecking(true);setError('');
      try {
        const result = await friendRequest<{profiles:SharedFriendSummary[]}>(`?ids=${encodeURIComponent(key)}`,{signal:AbortSignal.any([current.signal,AbortSignal.timeout(15000)])});
        if (!active || current.signal.aborted) return;
        const requested = new Set(key.split(','));
        setProfiles(new Map(result.profiles.filter(profile=>requested.has(profile.player.id)).map(profile=>[profile.player.id,profile])));
      } catch (reason) {
        if (!active || current.signal.aborted) return;
        setProfiles(new Map());setError(reason instanceof Error ? reason.message : 'Shared profiles could not load.');
      } finally { if (active && !current.signal.aborted) setChecking(false); }
    };
    void refresh();
    const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(focus,30000);
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return () => {active=false;controller?.abort();clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[key,loadProfiles,attempt]);
  const add = useCallback((id: string) => {
    if (!isFriendLinkId(id)) throw Error('Invalid profile link.');
    const previous = parseFriendLinks(localStorage.getItem(FRIEND_LINKS_KEY));
    if (previous.includes(id)) return;
    if (previous.length + manualCount() >= 50) throw Error('Unfollow a player or remove an import before saving more than 50 profiles.');
    const next = [...previous,id];localStorage.setItem(FRIEND_LINKS_KEY,JSON.stringify(next));setIds(next);
  },[]);
  const remove = useCallback((id: string) => {
    const next = parseFriendLinks(localStorage.getItem(FRIEND_LINKS_KEY)).filter(value=>value!==id);
    localStorage.setItem(FRIEND_LINKS_KEY,JSON.stringify(next));setIds(next);
  },[]);
  return {ids,profiles,checking,error,add,remove,retry:()=>setAttempt(value=>value+1)};
}

/** An open collection rechecks permission, including after tab return or withdrawal. */
export function useSharedFriend(id: string | null, directLink = false) {
  const [record,setRecord] = useState<SharedFriend|null>(null), [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const current = useRef<SharedFriend|null>(null);current.current = record;
  useEffect(() => {
    setRecord(null);setError('');
    if (!id || !isFriendLinkId(id)) {if(id)setError('Invalid profile link.');return;}
    let active = true, controller: AbortController | undefined;
    const load = async (check = false) => {
      controller?.abort();controller = new AbortController();const request = controller;
      const signal = AbortSignal.any([request.signal,AbortSignal.timeout(15000)]);
      try {
        if (check && current.current) {
          const result = directLink ? {profiles:[await friendRequest<SharedFriendSummary>(`?id=${id}&link=1&summary=1`,{signal})]} : await friendRequest<{profiles:SharedFriendSummary[]}>(`?ids=${id}`,{signal});
          if (!active || request.signal.aborted) return;
          const summary = result.profiles[0], previous = current.current;
          if (summary && summary.collectionShared === previous.collectionShared && summary.supportsShared === previous.supportsShared && summary.followingAllowed === previous.followingAllowed && summary.profileUpdatedAt === previous.profileUpdatedAt && JSON.stringify(summary.player) === JSON.stringify(previous.player)) return;
        }
        setRecord(null);setError('');
        const result = await friendRequest<SharedFriend>(`?id=${id}${directLink?'&link=1':''}`,{signal});
        if (active && !request.signal.aborted) setRecord(result);
      } catch(reason) {
        if (!active || request.signal.aborted) return;
        setRecord(null);setError(reason instanceof Error ? reason.message : 'This shared profile could not load.');
      }
    };
    void load();
    const focus = () => { if(document.visibilityState === 'visible') void load(true); };
    const timer = setInterval(()=>{if(document.visibilityState==='visible')void load(true);},30000);
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return()=>{active=false;controller?.abort();clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[id,attempt,directLink]);
  return {record,error,retry:()=>setAttempt(value=>value+1)};
}
