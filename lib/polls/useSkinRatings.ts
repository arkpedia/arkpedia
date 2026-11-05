import {useCallback,useEffect,useRef,useState} from 'react';
import type {SavedSkinRating,SkinRatingResult} from './skin-ratings';
interface RatingError {message:string;current?:SavedSkinRating;profile?:boolean}
export function useSkinRatings(owner:string|null){
  const [result,setResult]=useState<SkinRatingResult|null>(null),[error,setError]=useState('');
  const [saved,setSaved]=useState<Map<string,SavedSkinRating>>(new Map()),[draft,setDraft]=useState<Record<string,number|null>>({}),[failures,setFailures]=useState<Record<string,RatingError>>({}),[pending,setPending]=useState<Set<string>>(new Set());
  const savedRef=useRef(saved),locks=useRef(new Set<string>()),mounted=useRef(true),generation=useRef(0),read=useRef(0);
  const load=useCallback(async()=>{
    const version=generation.current,sequence=++read.current;
    const response=await fetch(`/api/cloud-account/polls/favourite-skins?mode=ratings${owner?`&owner=${encodeURIComponent(owner)}`:''}`,{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw Error(data.error??'Could not load ratings.');
    if(data.version!==2)throw Error('Reload the page to use the new skin ratings.');
    if(!mounted.current||version!==generation.current||sequence!==read.current)return;
    setResult(data);setError('');
    if(owner&&data.mine){const next=new Map<string,SavedSkinRating>(data.mine.map((row:SavedSkinRating)=>[row.skin,row]));savedRef.current=next;setSaved(next);}
  },[owner]);
  useEffect(()=>{
    mounted.current=true;let loading=false;
    const refresh=()=>{if(document.visibilityState==='hidden'||loading)return;loading=true;void load().catch(e=>{if(mounted.current)setError(e.message);}).finally(()=>{loading=false;});};
    refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{mounted.current=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[load]);
  const save=async(skin:string,rating:number|null)=>{
    if(!owner||!result?.mine||locks.current.has(skin))return;
    locks.current.add(skin);generation.current++;setPending(new Set(locks.current));setDraft(prev=>({...prev,[skin]:rating}));setFailures(prev=>{const next={...prev};delete next[skin];return next;});
    try{
      const response=await fetch('/api/cloud-account/polls/favourite-skins?mode=ratings',{method:rating===null?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,skin,rating,revision:savedRef.current.get(skin)?.revision??0})});
      const data=await response.json();if(!mounted.current)return;
      if(!response.ok){setFailures(prev=>({...prev,[skin]:{message:data.error??'Rating was not saved. Please retry.',profile:response.status===428,...(data.current?{current:data.current}:{})}}));return;}
      const next=new Map(savedRef.current);next.set(skin,data);savedRef.current=next;setSaved(next);setDraft(prev=>{const next={...prev};delete next[skin];return next;});
    }catch{if(mounted.current)setFailures(prev=>({...prev,[skin]:{message:'Not saved. Check your connection and retry before leaving.'}}));}
    finally{locks.current.delete(skin);generation.current++;if(mounted.current){setPending(new Set(locks.current));void load().catch(e=>{if(mounted.current)setError(e.message);});}}
  };
  const reloadSaved=(skin:string)=>{
    const current=failures[skin]?.current;if(!current)return;
    const next=new Map(savedRef.current);next.set(skin,current);savedRef.current=next;setSaved(next);
    setDraft(prev=>{const next={...prev};delete next[skin];return next;});setFailures(prev=>{const next={...prev};delete next[skin];return next;});
  };
  return {result,error,saved,draft,failures,pending,load,save,reloadSaved,ready:!!result&&(!owner||result.mine!==undefined)};
}
