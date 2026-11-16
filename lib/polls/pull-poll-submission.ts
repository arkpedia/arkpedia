import {currentBallot,type Ballot,type PollBanner} from './pull-poll';
import {accountReturnPath} from '@/lib/cloud-account/navigation';
export const PULL_POLL_SUBMISSION='arkpedia.pull-poll.submit.v1';
export const PULL_POLL_SUBMIT_PARAM='pollSubmit';
export const SUBMISSION_TTL=30*60_000;
export interface PollSubmissionIntent {nonce:string;createdAt:number;choices:Ballot}
/** A callback alone never authorizes a write: it must match this tab's explicit intent. */
export function submissionIntent(raw:string|null,nonce:string|null,banners:readonly PollBanner[],now=Date.now()):PollSubmissionIntent|null{
  try{
    if(!raw||raw.length>100_000||!nonce||!/^[a-f0-9-]{36}$/.test(nonce))return null;
    const value=JSON.parse(raw) as PollSubmissionIntent;
    if(value.nonce!==nonce||!Number.isFinite(value.createdAt)||value.createdAt>now+60_000||now-value.createdAt>SUBMISSION_TTL)return null;
    const choices=currentBallot(value.choices,banners);return Object.keys(choices).length?{nonce,createdAt:value.createdAt,choices}:null;
  }catch{return null;}
}
export function submissionReturnPath(path:string,nonce:string,failed=false):string{
  const url=new URL(accountReturnPath(path,failed),'https://arkpedia.invalid');url.searchParams.set(PULL_POLL_SUBMIT_PARAM,nonce);
  return url.pathname+url.search+url.hash;
}
