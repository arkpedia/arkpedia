import {useEffect,useState} from 'react';
import {validBroadcastSnapshot,type OfficialBroadcast} from './officialBroadcasts';
export function useOfficialBroadcasts():OfficialBroadcast[] {
  const [broadcasts,setBroadcasts]=useState<OfficialBroadcast[]>([]);
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
        if (!stopped) setBroadcasts(snapshot.broadcasts);
      } catch {if (!stopped) setBroadcasts(previous=>previous.filter(item=>item.status!=='live'));}
      finally {clearTimeout(timeout);controller=null;}
    }
    void refresh();
    const timer=setInterval(()=>void refresh(),30000);
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return ()=>{stopped=true;controller?.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[]);
  return broadcasts;
}
