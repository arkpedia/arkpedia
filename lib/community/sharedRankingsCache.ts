import type {CommunityRankings} from './rankings';

interface ObjectBody {etag:string;text():Promise<string>}
export interface RankingBucket {
  get(key:string):Promise<ObjectBody|null>;
  put(key:string,value:string,options?:{onlyIf:{etagMatches?:string;etagDoesNotMatch?:string}}):Promise<{etag:string}|null>;
}
interface Kept {stamp:string;builtAt:number;expires:number;result:CommunityRankings}
interface Envelope {kept?:Kept;lease?:{expires:number;nonce:string}}
const FRESH=30_000,MAX_AGE=120_000,LEASE=15_000;
export function reportRankingFailure(error:unknown){
  console.error('community_rankings_failed',{name:error instanceof Error?error.name:'UnknownError',message:error instanceof Error?error.message:String(error)});
}

/** Public aggregates only, shared across isolates/colos in the existing private
 * page-cache bucket. A conditional R2 lease prevents simultaneous D1 scans.
 * The caller checks current consent before every read; a different stamp can
 * never use an old result, including during overload or a refresh. */
export async function sharedRankingResult(bucket:RankingBucket,key:string,stamp:string,load:()=>Promise<CommunityRankings>,{
  now=Date.now,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),
}:{now?:()=>number;wait?:(ms:number)=>Promise<void>}={}):Promise<CommunityRankings>{
  const objectKey=`community-rankings/v1/${key}`,deadline=now()+20_000;
  const write=async(value:Envelope,onlyIf:{etagMatches?:string;etagDoesNotMatch?:string})=>{
    for(let attempt=0;;attempt++){
      try{return await bucket.put(objectKey,JSON.stringify(value),{onlyIf});}
      catch(error){
        if(/\b(412|10031)\b|PreconditionFailed/i.test(String(error)))return null;
        // R2 limits writes to the same key; a losing contender must wait,
        // never fall through into an additional database aggregation.
        if(attempt>=3||!/\b(429|10058)\b|TooManyRequests/i.test(String(error)))throw error;
        await wait(1_100);
      }
    }
  };
  while(now()<deadline){
    const object=await bucket.get(objectKey),envelope:Envelope=object?JSON.parse(await object.text()):{},kept=envelope.kept;
    const valid=kept?.stamp===stamp&&now()-kept.builtAt<MAX_AGE?kept:null;
    if(valid&&valid.expires>now())return valid.result;
    if((envelope.lease?.expires??0)>now()){
      if(valid)return valid.result;
      await wait(150);continue;
    }
    // Lease and result share one object, making ownership checks and result
    // writes atomic rather than checking one object before writing another.
    const lease=await write({...envelope,lease:{expires:now()+LEASE,nonce:crypto.randomUUID()}},object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'});
    if(!lease){await wait(50);continue;}
    let settled=false;
    try{
      const result=await load(),builtAt=now();
      // An expired owner cannot overwrite the result of a newer refresh.
      await write({kept:{stamp,builtAt,expires:builtAt+FRESH,result}},{etagMatches:lease.etag});settled=true;
      return result;
    }catch(error){
      if(!valid||now()-valid.builtAt>=MAX_AGE)throw error;
      reportRankingFailure(error);
      // A brief overload may keep a recent aggregate, never withdrawn consent.
      await write({kept:{...valid,expires:Math.min(now()+10_000,valid.builtAt+MAX_AGE)}},{etagMatches:lease.etag});settled=true;
      return valid.result;
    }finally{
      // Release conditionally: an old owner must not release another lease.
      if(!settled)await write({kept},{etagMatches:lease.etag});
    }
  }
  throw new Error('Community ranking refresh is busy. Please retry shortly.');
}
