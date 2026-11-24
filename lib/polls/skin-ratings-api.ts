import { votingOpenSql } from './settingsStore';
import type {NextApiRequest,NextApiResponse} from 'next';
import type {D1Database} from '@cloudflare/workers-types';
import {allowAccountRequest,accountLimited} from '@/lib/cloud-account/limits';
import {SKIN_RATING_POLL_ID,validSkinRating,type SavedSkinRating,type SkinRatingResult} from './skin-ratings';
import {aggregateRatingBuckets} from './skin-rating-statistics';
import {pollResultSnapshot} from './resultSnapshot';

async function publicResults(db:D1Database):Promise<Omit<SkinRatingResult,'mine'>>{
  const [totals,buckets]=await db.batch([
    db.prepare('SELECT count(DISTINCT userId) raters,count(*) ratings FROM skin_poll_rating WHERE poll=? AND rating IS NOT NULL').bind(SKIN_RATING_POLL_ID),
    db.prepare('SELECT skin,rating,count(*) ratings FROM skin_poll_rating WHERE poll=? AND rating IS NOT NULL GROUP BY skin,rating').bind(SKIN_RATING_POLL_ID),
  ]);
  const coverage=totals.results[0] as {raters:number;ratings:number};
  return {version:2,...coverage,ranking:aggregateRatingBuckets(buckets.results as {skin:string;rating:number;ratings:number}[])};
}

/** Fixed anonymous aggregates and the authenticated account's own editable ratings. */
export async function skinRatings(req:NextApiRequest,res:NextApiResponse,db:D1Database,owner:string|null,loadIds:()=>Promise<ReadonlySet<string>>,now=Date.now){
  if(req.method==='GET'){
    const view=req.query.view;
    if(view!==undefined&&view!=='results'&&view!=='mine')return res.status(400).json({error:'Choose a valid ratings view.'});
    if(view!=='results'&&req.query.owner!==undefined&&req.query.owner!==owner)return res.status(409).json({error:'Your signed-in account changed. Reload the poll.'});
    if(view==='mine'&&!owner)return res.status(401).json({error:'Sign in to see your saved ratings.'});
    const [result,mine]=await Promise.all([
      view==='mine'?null:pollResultSnapshot(db,SKIN_RATING_POLL_ID,()=>publicResults(db),now),
      owner&&view!=='results'?db.prepare('SELECT skin,rating,revision FROM skin_poll_rating WHERE poll=? AND userId=?').bind(SKIN_RATING_POLL_ID,owner).all<SavedSkinRating>():null,
    ]);
    return res.json({...result,version:2,...(mine?{mine:mine.results}:{})});
  }
  if(!owner)return res.status(401).json({error:'Sign in to Arkpedia to rate skins.'});
  if(req.body?.owner!==owner)return res.status(409).json({error:'Your signed-in account changed. Reload the poll before rating.'});
  const limit=await allowAccountRequest(db,owner,'write');if(!limit.allowed)return accountLimited(res,limit.retryAfter);
  if(!await db.prepare('SELECT userId FROM arkpedia_profile WHERE userId=?').bind(owner).first())return res.status(428).json({error:'Choose your Arkpedia username before rating.'});
  const {skin,revision}=req.body,rating=req.method==='DELETE'?null:req.body.rating;
  if(typeof skin!=='string'||!skin.length||skin.length>200||!Number.isSafeInteger(revision)||revision<0||req.method!=='DELETE'&&(!validSkinRating(rating)||!(await loadIds()).has(skin)))return res.status(400).json({error:'Choose a catalogue skin and a whole-number rating from 1 to 10.'});
  if(req.method==='DELETE'&&!(await loadIds()).has(skin)&&!await db.prepare('SELECT 1 n FROM skin_poll_rating WHERE poll=? AND userId=? AND skin=?').bind(SKIN_RATING_POLL_ID,owner,skin).first())return res.status(400).json({error:'Choose a skin you have rated or one from the catalogue.'});
  // Null is a tombstone: a stale device cannot resurrect a cleared rating.
  const row=await db.prepare(`INSERT INTO skin_poll_rating(poll,userId,skin,rating,revision) SELECT ?,?,?,?,1
    WHERE ${votingOpenSql('favourite-skins')} AND (?=0 OR EXISTS(SELECT 1 FROM skin_poll_rating WHERE poll=? AND userId=? AND skin=? AND revision=?))
    ON CONFLICT(poll,userId,skin) DO UPDATE SET rating=excluded.rating,revision=revision+1 WHERE skin_poll_rating.revision=?
    RETURNING skin,rating,revision`).bind(SKIN_RATING_POLL_ID,owner,skin,rating,revision,SKIN_RATING_POLL_ID,owner,skin,revision,revision).first<SavedSkinRating>();
  if(row)return res.json(row);
  const current=await db.prepare('SELECT skin,rating,revision FROM skin_poll_rating WHERE poll=? AND userId=? AND skin=?').bind(SKIN_RATING_POLL_ID,owner,skin).first<SavedSkinRating>();
  return res.status(409).json({error:'This rating changed on another device. Reload its saved rating before editing again.',current});
}
