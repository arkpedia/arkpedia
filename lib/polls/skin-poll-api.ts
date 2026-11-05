import type { NextApiRequest,NextApiResponse } from 'next';
import type { D1Database } from '@cloudflare/workers-types';
import { communityPoll } from '@/lib/community/catalogues';
import { validBallot,SKIN_POLL_ID } from './skin-poll';
import { allowAccountRequest,accountLimited } from '@/lib/cloud-account/limits';
import { loadRelease,readPageProps } from '@/lib/content/release';

/** Follow the published poll catalogue when content adds outfits without an app deploy. */
export async function skinPollIds():Promise<ReadonlySet<string>>{
  const release=await loadRelease();
  if(!release?.manifest.pages['/polls/favourite-skins'])return new Set((await communityPoll()).skins.map(skin=>skin.id));
  const props=await readPageProps(release,'/polls/favourite-skins');
  if(!Array.isArray(props?.skins)||!props.skins.length)throw Error('Poll catalogue unavailable');
  return new Set(props.skins.flatMap(s=>s&&typeof s.id==='string'?[s.id]:[]));
}
export async function skinPoll(req:NextApiRequest,res:NextApiResponse,db:D1Database,owner:string|null,loadIds:()=>Promise<ReadonlySet<string>>=skinPollIds){
  if(req.method==='GET'){
    if(req.query.owner!==undefined&&req.query.owner!==owner)return res.status(409).json({error:'Your signed-in account changed. Reload the poll.'});
    const results=await db.batch([
      db.prepare('SELECT count(*) ballots FROM ranked_poll_ballot WHERE poll=? AND json_array_length(choices)=5').bind(SKIN_POLL_ID),
      db.prepare(`SELECT j.value skin,sum(5-CAST(j.key AS INTEGER)) points,sum(CAST(j.key AS INTEGER)=0) firsts,count(*) votes
        FROM ranked_poll_ballot b,json_each(b.choices) j WHERE b.poll=? AND json_array_length(b.choices)=5 GROUP BY j.value ORDER BY points DESC,firsts DESC,skin`).bind(SKIN_POLL_ID),
      ...(owner?[db.prepare('SELECT choices,revision FROM ranked_poll_ballot WHERE poll=? AND userId=?').bind(SKIN_POLL_ID,owner)]:[]),
    ]);
    const mine=results[2]?.results[0] as {choices:string;revision:number}|undefined;
    return res.json({ballots:(results[0].results[0] as {ballots:number}|undefined)?.ballots??0,ranking:results[1].results,...(owner?{mine:{choices:mine?JSON.parse(mine.choices):[],revision:mine?.revision??0}}:{})});
  }
  if(!owner)return res.status(401).json({error:'Sign in to Arkpedia to vote.'});
  if(req.body?.owner!==owner)return res.status(409).json({error:'Your signed-in account changed. Reload the poll before voting.'});
  const limit=await allowAccountRequest(db,owner,req.method==='DELETE'?'remove':'write');
  if(!limit.allowed)return accountLimited(res,limit.retryAfter);
  if(!await db.prepare('SELECT userId FROM arkpedia_profile WHERE userId=?').bind(owner).first())return res.status(428).json({error:'Choose your Arkpedia username before voting.'});
  if(!Number.isSafeInteger(req.body.revision)||req.body.revision<0)return res.status(400).json({error:'Invalid ballot revision.'});
  const choices=req.method==='DELETE'?[]:req.body.choices;
  if(req.method!=='DELETE'&&!validBallot(choices,await loadIds()))return res.status(400).json({error:'Choose five different skins from the catalogue.'});
  // Retain an empty ballot on withdrawal: stale devices cannot recreate a deleted vote.
  const row=await db.prepare(`INSERT INTO ranked_poll_ballot(poll,userId,choices,revision) SELECT ?,?,?,1
    WHERE ?=0 OR EXISTS(SELECT 1 FROM ranked_poll_ballot WHERE poll=? AND userId=? AND revision=?)
    ON CONFLICT(poll,userId) DO UPDATE SET choices=excluded.choices,revision=revision+1 WHERE ranked_poll_ballot.revision=?
    RETURNING revision`).bind(SKIN_POLL_ID,owner,JSON.stringify(choices),req.body.revision,SKIN_POLL_ID,owner,req.body.revision,req.body.revision).first<{revision:number}>();
  return row?res.json({choices,revision:row.revision}):res.status(409).json({error:'Your ballot changed on another device. Reload it before saving again.'});
}
