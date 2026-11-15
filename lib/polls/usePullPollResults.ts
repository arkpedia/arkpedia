import {useEffect,useState} from 'react';
import type {PullPollResults} from './pull-poll';

export function usePullPollResults(){
  const [result,setResult]=useState<PullPollResults|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();let busy=false;
    const load=async()=>{
      if(busy||document.hidden)return;busy=true;
      try{
        const response=await fetch('/api/cloud-account/polls/pull-or-skip?view=results',{credentials:'same-origin',cache:'no-store',signal:abort.signal});
        const data=await response.json();if(!response.ok)throw Error(data.error??'Results are temporarily unavailable.');
        if(!Array.isArray(data.banners)||!Array.isArray(data.operators)||!Number.isFinite(data.ballots))throw Error('Results are temporarily unavailable.');
        if(!abort.signal.aborted){setResult(data);setError('');}
      }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Could not load results.');}
      finally{busy=false;}
    };
    void load();const timer=window.setInterval(()=>void load(),30000);
    const focus=()=>void load();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return()=>{abort.abort();clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[retry]);
  return {result,error,retry:()=>setRetry(value=>value+1)};
}
