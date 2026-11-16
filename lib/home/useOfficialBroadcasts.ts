import {useEffect,useState} from 'react';
import {featuredBroadcastGroups,validBroadcastSnapshot,type OfficialBroadcast} from './officialBroadcasts';
export function useOfficialBroadcasts():{broadcasts:OfficialBroadcast[];featuredLiveIds:string[]} {
  const [state,setState]=useState<{broadcasts:OfficialBroadcast[];featuredLiveIds:string[]}>({broadcasts:[],featuredLiveIds:[]});
  useEffect(()=>{
    let stopped=false,controller:AbortController|null=null;
    async function refresh(){
      if (document.hidden||controller) return;
      controller=new AbortController();
      const request=controller;
      const timeout=setTimeout(()=>request.abort(),10000);
      try {
        const response=await fetch('/api/home/broadcasts',{cache:'no-store',signal:controller.signal});
        if (!response.ok) throw Error('Broadcasts unavailable');
        const snapshot:unknown=await response.json();
        if (!validBroadcastSnapshot(snapshot)) throw Error('Invalid broadcasts');
        if (!stopped) setState(previous=>{
          const groups=featuredBroadcastGroups(snapshot.broadcasts,Date.now(),previous.featuredLiveIds);
          return {broadcasts:snapshot.broadcasts,featuredLiveIds:groups.filter(group=>group.primary.status==='live').map(group=>group.primary.id)};
        });
      } catch {if (!stopped) setState(previous=>({...previous,broadcasts:previous.broadcasts.filter(item=>item.status!=='live')}));}
      finally {clearTimeout(timeout);controller=null;}
    }
    void refresh();
    const timer=setInterval(()=>void refresh(),30000);
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return ()=>{stopped=true;controller?.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[]);
  return state;
}
