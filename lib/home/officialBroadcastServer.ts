import {regionalTable} from '@/lib/time/regionalServer';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cachedBroadcastData, memoryBroadcastBucket, type BroadcastCacheBucket } from './officialBroadcastCache';
import { assignBroadcastGroups, importantBroadcast, validBroadcastSnapshot, type BroadcastCandidate, type BroadcastSnapshot } from './officialBroadcasts';
import { OFFICIAL_BROADCAST_SOURCES, MAX_BROADCAST_YOUTUBE_SOURCES, MAX_BROADCAST_VIDEOS_PER_SOURCE, type BroadcastSource } from './officialBroadcastSources';

type YouTubeSource = Extract<BroadcastSource, {platform:'youtube'}>;
interface Discovery { channels: Record<string,string>; videos: Record<string,string[]>; degraded?:boolean }
interface Video { id?:string; snippet?:{channelId?:string;title?:string;description?:string;liveBroadcastContent?:string}; liveStreamingDetails?:{scheduledStartTime?:string;actualStartTime?:string;actualEndTime?:string} }
const HOUR = 3600000;
const localBucket = memoryBroadcastBucket();
async function providerJson(url:string, key?:string):Promise<Record<string,unknown>> {
  const response = await fetch(url, { headers:key ? {'X-Goog-Api-Key':key} : undefined, signal:AbortSignal.timeout(10000) });
  if (!response.ok) throw Error(response.status===403 ? 'Official broadcast provider quota or authorization unavailable' : 'Official broadcast provider unavailable');
  const body = await response.text();
  if (body.length > 2000000) throw Error('Official broadcast provider response too large');
  return JSON.parse(body);
}
function youtubeUrl(resource:string, params:Record<string,string>) { return `https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams(params)}`; }
const date = (value:unknown):string|null => typeof value==='string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function youtubeBroadcast(video:Video, source:YouTubeSource, channel:string, now:number):BroadcastCandidate|null {
  const snippet=video.snippet, details=video.liveStreamingDetails;
  if (!video.id || !/^[\w-]{11}$/.test(video.id) || snippet?.channelId!==channel || !details || !snippet.title || !importantBroadcast(snippet.title,snippet.description??'',source.game)) return null;
  const startsAt=date(details.scheduledStartTime) ?? date(details.actualStartTime);
  if (!startsAt) return null;
  const status=details.actualEndTime ? 'ended' : snippet.liveBroadcastContent==='live' && details.actualStartTime ? 'live' : snippet.liveBroadcastContent==='upcoming' ? 'upcoming' : 'ended';
  return {id:`youtube:${video.id}`,source:source.id,game:source.game,region:source.region,title:snippet.title.slice(0,500),description:snippet.description,url:`https://www.youtube.com/watch?v=${video.id}`,thumbnail:`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,startsAt,status,verifiedAt:new Date(now).toISOString()};
}
export function bilibiliBroadcasts(reservations:unknown, room:Record<string,unknown>, source:Extract<BroadcastSource,{platform:'bilibili'}>, now:number):BroadcastCandidate[] {
  const candidates:BroadcastCandidate[]=[];
  const data=reservations as {list?:unknown[];reserve?:unknown[]}|null;
  const list=Array.isArray(reservations)?reservations:Array.isArray(data?.list)?data.list:Array.isArray(data?.reserve)?data.reserve:[];
  const common={source:source.id,game:source.game,region:source.region,url:`https://live.bilibili.com/${source.roomId}`,verifiedAt:new Date(now).toISOString()};
  for (const value of list.slice(0,12)) {
    const item=value as Record<string,unknown>, seconds=Number(item.live_plan_start_time);
    if (!item || item.uid && Number(item.uid)!==source.uid || !Number.isFinite(seconds) || seconds<(now-7*86400000)/1000 || seconds>(now+366*86400000)/1000 || typeof item.title!=='string' || !importantBroadcast(item.title,'',source.game)) continue;
    candidates.push({...common,id:`bilibili:reservation:${String(item.sid??seconds)}`,title:item.title.slice(0,500),thumbnail:null,startsAt:new Date(seconds*1000).toISOString(),status:'upcoming'});
  }
  // Bilibili's 2 means a replay loop. Only 1 is an actual live broadcast.
  if (Number(room.uid)===source.uid && Number(room.room_id)===source.roomId && Number(room.live_status)===1 && typeof room.title==='string' && importantBroadcast(room.title,'',source.game)) {
    const startsAt=typeof room.live_time==='string' ? date(room.live_time.replace(' ','T')+'+08:00') : null;
    if (startsAt) {
      const existing=candidates.find(item=>Math.abs(Date.parse(item.startsAt)-Date.parse(startsAt))<6*HOUR);
      if (existing) {existing.status='live';existing.startsAt=startsAt;}
      else candidates.push({...common,id:`bilibili:room:${source.roomId}:${startsAt}`,title:room.title.slice(0,500),thumbnail:typeof room.user_cover==='string' && /^https:\/\/[\w.-]+\.hdslb\.com\//.test(room.user_cover)?room.user_cover:null,startsAt,status:'live'});
    }
  }
  return candidates;
}
export async function loadOfficialBroadcasts({bucket,key,now=Date.now(),json=providerJson,previous}:{bucket:BroadcastCacheBucket;key?:string;now?:number;json?:typeof providerJson;previous?:BroadcastSnapshot}):Promise<BroadcastSnapshot> {
  const sources=OFFICIAL_BROADCAST_SOURCES.filter((s):s is YouTubeSource=>s.platform==='youtube').slice(0,MAX_BROADCAST_YOUTUBE_SOURCES);
  let degraded=false;
  let discovery:Discovery={channels:{},videos:{}};
  if (key) {
    try {
      const cached=await cachedBroadcastData<Discovery>(bucket,'youtube-discovery',async previous=>{
        const channels={...previous?.channels},videos:Record<string,string[]>={};
        const searches=await Promise.allSettled(sources.map(async source=>{
          if (!channels[source.id]) {
            if (source.channelId) channels[source.id]=source.channelId;
            else {
              const result=await json(youtubeUrl('videos',{part:'snippet',id:source.seedVideoIds!.join(',')}),key);
              const items=result.items as Video[]|undefined;
              const ids=new Set(items?.map(item=>item.snippet?.channelId).filter((id):id is string=>!!id));
              if (ids.size!==1 || items?.length!==source.seedVideoIds!.length) throw Error('Official Endfield channel could not be verified');
              channels[source.id]=[...ids][0];
            }
          }
          const results=await Promise.all(['upcoming','live'].map(eventType=>json(youtubeUrl('search',{part:'id',type:'video',channelId:channels[source.id],eventType,maxResults:'10',order:'date'}),key)));
          const found=results.flatMap(result=>(result.items as {id?:{videoId?:string}}[]??[]).map(item=>item.id?.videoId).filter((id):id is string=>!!id && /^[\w-]{11}$/.test(id)));
          videos[source.id]=[...new Set([...found,...(previous?.videos[source.id]??[])])].slice(0,MAX_BROADCAST_VIDEOS_PER_SOURCE);
        }));
        const failed=searches.some(result=>result.status==='rejected');
        if (searches.every(result=>result.status==='rejected')) throw Error('Official broadcast discovery quota or provider unavailable');
        for (const source of sources) if (!videos[source.id]) videos[source.id]=previous?.videos[source.id]??[];
        return {channels,videos,degraded:failed};
      },{ttl:()=>6*HOUR,maxAge:24*HOUR,valid:(value):value is Discovery=>{
        if (!value || typeof value!=='object') return false;
        const saved=value as Discovery;
        return !!saved.channels && !!saved.videos && sources.every(source=>{
          const channel=saved.channels[source.id],videos=saved.videos[source.id];
          return (!channel || source.channelId ? channel===source.channelId : /^UC[\w-]+$/.test(channel))
            && Array.isArray(videos) && videos.length<=MAX_BROADCAST_VIDEOS_PER_SOURCE && videos.every(id=>typeof id==='string'&&/^[\w-]{11}$/.test(id));
        });
      }});
      discovery=cached.value;degraded=cached.stale||!!cached.value.degraded;
    } catch { degraded=true; }
  } else degraded=true;
  const candidates:BroadcastCandidate[]=[];
  const verifiedSources=new Set<string>();
  const ids=[...new Set(Object.values(discovery.videos).flat())];
  const jobs:Promise<void>[]=[];
  if (key && ids.length) jobs.push((async()=>{
    const result=await json(youtubeUrl('videos',{part:'snippet,liveStreamingDetails',id:ids.join(',')}),key);
    for(const source of sources)verifiedSources.add(source.id);
    for (const video of result.items as Video[]??[]) for (const source of sources) {
      if (!discovery.videos[source.id]?.includes(video.id??'')) continue;
      const broadcast=youtubeBroadcast(video,source,discovery.channels[source.id],now);
      if (broadcast) candidates.push(broadcast);
    }
  })());
  const cn=OFFICIAL_BROADCAST_SOURCES.find((s):s is Extract<BroadcastSource,{platform:'bilibili'}>=>s.platform==='bilibili')!;
  jobs.push((async()=>{
    const [reservation,room]=await Promise.all([json(`https://api.bilibili.com/x/space/reservation?vmid=${cn.uid}`),json(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${cn.roomId}`)]);
    if (reservation.code!==0 || room.code!==0 || !room.data) throw Error('Official CN broadcast unavailable');
    candidates.push(...bilibiliBroadcasts(reservation.data,room.data as Record<string,unknown>,cn,now));
    verifiedSources.add(cn.id);
  })());
  const results=await Promise.allSettled(jobs);
  if (results.every(result=>result.status==='rejected')) throw Error('Official broadcast providers unavailable');
  degraded ||= results.some(result=>result.status==='rejected');
  // Retain recent announced schedules through a partial outage, never stale Live.
  for(const old of previous?.broadcasts??[]) if (!verifiedSources.has(old.source)&&old.status==='upcoming'&&now-Date.parse(old.verifiedAt)<86400000) candidates.push(old);
  const aliases=new Map<string,Set<string>>();
  const regional=await regionalTable('/');
  for (const schedule of Object.values(regional.servers)) for (const [name,event] of Object.entries(schedule?.events??{})) {
    const key=event.activityId??name, names=aliases.get(key)??new Set<string>();
    names.add(name.replace(/^\[[^\]]+\]\s*/,''));if(event.localName)names.add(event.localName);
    aliases.set(key,names);
  }
  return {checkedAt:new Date(now).toISOString(),degraded,broadcasts:assignBroadcastGroups(candidates,[...aliases].map(([key,names])=>({key,names:[...names]})))};
}
export async function officialBroadcastSnapshot():Promise<BroadcastSnapshot> {
  let bucket:BroadcastCacheBucket=localBucket;
  try {
    const env=getCloudflareContext().env as unknown as {NEXT_INC_CACHE_R2_BUCKET?:BroadcastCacheBucket;ARKPEDIA_DEPLOYMENT_ROLE?:string};
    if (env.NEXT_INC_CACHE_R2_BUCKET) bucket=env.NEXT_INC_CACHE_R2_BUCKET;
    else if (env.ARKPEDIA_DEPLOYMENT_ROLE==='production') throw Error('Official broadcast cache unavailable');
  } catch(error) {if (error instanceof Error && error.message==='Official broadcast cache unavailable') throw error;}
  const result=await cachedBroadcastData(bucket,'status',previous=>loadOfficialBroadcasts({bucket,key:process.env.YOUTUBE_API_KEY,previous}),{
    valid:validBroadcastSnapshot,maxAge:86400000,
    ttl:snapshot=>snapshot.degraded?30000:snapshot.broadcasts.some(item=>item.status==='live'||item.status==='upcoming'&&Date.parse(item.startsAt)-Date.now()<10*60000)?30000:300000,
  });
  return {...result.value,degraded:result.stale||result.value.degraded};
}
