import type {D1Database} from '@cloudflare/workers-types';
import {BANNER_INTENT,PULL_POLL_ID,type PullPollResults,type PollBannerResult,type PollOperatorResult} from './pull-poll';

/** Public projections contain totals only; no voter identity or individual ballot leaves D1. */
export async function pullPollResults(db:D1Database):Promise<PullPollResults>{
  const results=await db.batch([
    db.prepare('SELECT count(*) ballots FROM pull_poll_ballot WHERE poll=?').bind(PULL_POLL_ID),
    db.prepare(`WITH answers AS (
      SELECT b.voter,j.key id,sum(CAST(o.value AS INTEGER)>0) wants,sum(CAST(o.value AS INTEGER)=-1) nice
      FROM pull_poll_ballot b,json_each(b.choices) j,json_each(j.value) o WHERE b.poll=? GROUP BY b.voter,j.key
    ) SELECT id,count(*) answers,sum(wants>0) pull,sum(wants=0 AND nice>0) maybe,sum(wants=0 AND nice=0) skip FROM answers GROUP BY id`).bind(PULL_POLL_ID),
    db.prepare(`SELECT j.key banner,o.key name,count(*) answers,sum(CAST(o.value AS INTEGER)>0) want,
      sum(CAST(o.value AS INTEGER)=-1) maybe,sum(CAST(o.value AS INTEGER)=0) no,
      sum(CASE WHEN CAST(o.value AS INTEGER)>0 THEN CAST(o.value AS INTEGER) ELSE 0 END) totalPotential,
      sum(CAST(o.value AS INTEGER)=6) maxPotential
      FROM pull_poll_ballot b,json_each(b.choices) j,json_each(j.value) o WHERE b.poll=? AND o.key!=? GROUP BY j.key,o.key`).bind(PULL_POLL_ID,BANNER_INTENT),
  ]);
  return {ballots:Number((results[0].results[0] as {ballots:number}|undefined)?.ballots??0),banners:results[1].results as unknown as PollBannerResult[],operators:results[2].results as unknown as PollOperatorResult[]};
}
