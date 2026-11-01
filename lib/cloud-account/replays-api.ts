import type { NextApiRequest, NextApiResponse } from 'next';
import { fromNodeHeaders } from 'better-auth/node';
import { accountAuth, accountsEnv, type AccountsEnv } from './server';
import { allowAccountRequest, accountLimited } from './limits';
import { MAX_REPLAY_BYTES, STAGE_ID, validNamespace, validateFingerprint, validateReplay, replayHash } from '@/lib/replays/model';

export function createReplayHandler(resolveEnv:()=>AccountsEnv|null=accountsEnv) {
  return async (req:NextApiRequest,res:NextApiResponse) => {
    res.setHeader('Cache-Control','private, no-store'); res.setHeader('Vary','Cookie');
    const env=resolveEnv();
    if(!env) return res.status(503).json({error:'Auto-deploy cloud saving is available on Preview only.'});
    if(!['GET','PUT','PATCH','DELETE'].includes(req.method??'')){res.setHeader('Allow','GET, PUT, PATCH, DELETE');return res.status(405).end();}
    if(req.method!=='GET' && (req.headers.origin!==env.ARKPEDIA_AUTH_URL || !req.headers['content-type']?.startsWith('application/json')))return res.status(403).json({error:'Use Arkpedia to save auto-deploys.'});
    try {
      const session=await accountAuth(env).api.getSession({headers:fromNodeHeaders(req.headers)});
      if(!session)return res.status(401).json({error:'Sign in to Arkpedia first.'});
      const owner=session.user.id,db=env.ARKPEDIA_ACCOUNTS_DB;
      // All requests, including reads, identify the expected owner to prevent account-switch races.
      const supplied=req.method==='GET'?req.query.owner:req.body?.owner;
      if(supplied!==owner)return res.status(409).json({error:'Your Arkpedia account changed. Reopen Import / export.'});
      const limit=await allowAccountRequest(db,owner,req.method==='GET'?'read':req.method==='DELETE'?'remove':'write');
      if(!limit.allowed)return accountLimited(res,limit.retryAfter);
      const namespace=req.method==='GET'?req.query.namespace:req.body?.namespace;
      if(!validNamespace(namespace))return res.status(400).json({error:'Invalid game account.'});
      const consent=await db.prepare('SELECT syncReviewed,gameSync,paused FROM cloud_save WHERE userId=?').bind(owner).first<{syncReviewed:number;gameSync:number;paused:number}>();
      if(!consent?.syncReviewed || !consent.gameSync || consent.paused)return res.status(403).json({error:'Enable imported-game-data saving and resume cloud saving first.'});
      if(req.method==='GET'){
        const stageId=req.query.stageId;
        if(stageId!==undefined){
          if(typeof stageId!=='string'||!STAGE_ID.test(stageId))return res.status(400).json({error:'Invalid stage.'});
          const record=await db.prepare('SELECT stageId,fingerprint,hash,payload FROM auto_deploy WHERE userId=? AND namespace=? AND stageId=?').bind(owner,namespace,stageId).first();
          return record?res.json({record}):res.status(404).json({error:'No saved auto-deploy.'});
        }
        const records=await db.prepare('SELECT stageId,fingerprint,hash FROM auto_deploy WHERE userId=? AND namespace=? ORDER BY stageId').bind(owner,namespace).all();
        return res.json({records:records.results});
      }
      const stageId=req.body?.stageId;
      if(typeof stageId!=='string'||!STAGE_ID.test(stageId))return res.status(400).json({error:'Invalid stage.'});
      if(req.method==='DELETE'){
        if(!validateFingerprint(req.body.fingerprint)||typeof req.body.hash!=='string'||!/^[a-f0-9]{64}$/.test(req.body.hash))return res.status(400).json({error:'Invalid auto-deploy marker.'});
        const removed=await db.prepare(`DELETE FROM auto_deploy WHERE userId=? AND namespace=? AND stageId=? AND hash=?
          AND NOT EXISTS(SELECT 1 FROM json_each(auto_deploy.fingerprint) old JOIN json_each(?) fresh ON old.key=fresh.key WHERE old.key IN (1,2,3) AND old.type='integer' AND (fresh.type!='integer' OR fresh.value<old.value))
          RETURNING stageId`).bind(owner,namespace,stageId,req.body.hash,req.body.fingerprint).first<{stageId:string}>();
        return removed?.stageId===stageId?res.json({removed:true}):res.status(409).json({error:'Cloud auto-deploy changed. Import again before removing it.'});
      }
      if(req.method==='PATCH'){
        if(!validateFingerprint(req.body.fingerprint)||typeof req.body.hash!=='string'||!/^[a-f0-9]{64}$/.test(req.body.hash))return res.status(400).json({error:'Invalid auto-deploy marker.'});
        const result=await db.prepare(`UPDATE auto_deploy SET fingerprint=? WHERE userId=? AND namespace=? AND stageId=? AND hash=?
          AND EXISTS(SELECT 1 FROM cloud_save WHERE userId=? AND syncReviewed=1 AND gameSync=1 AND paused=0)
          AND NOT EXISTS(SELECT 1 FROM json_each(auto_deploy.fingerprint) old JOIN json_each(?) fresh ON old.key=fresh.key WHERE old.key IN (1,2,3) AND old.type='integer' AND (fresh.type!='integer' OR fresh.value<old.value))
          RETURNING hash`)
          .bind(req.body.fingerprint,owner,namespace,stageId,req.body.hash,owner,req.body.fingerprint).first<{hash:string}>();
        return result?.hash===req.body.hash?res.json({hash:req.body.hash}):res.status(409).json({error:'Cloud auto-deploy changed. Resume to compare again.'});
      }
      let payload:string,hash:string;
      try {
        if(typeof req.body.payload!=='string'||!validateFingerprint(req.body.fingerprint)||!(req.body.expectedHash===null || typeof req.body.expectedHash==='string'&&/^[a-f0-9]{64}$/.test(req.body.expectedHash)))throw Error();
        payload=validateReplay(req.body.payload,stageId);hash=await replayHash(payload);
      }catch{return res.status(400).json({error:`Invalid auto-deploy (maximum ${MAX_REPLAY_BYTES/1000} KB).`});}
      // Consent and optimistic concurrency are checked in the same SQL write, not only above.
      // RETURNING identifies the guarded write itself. D1 meta.changes also counts
      // quota-maintenance triggers, so a successful save can report multiple changes.
      const result=await db.prepare(`INSERT INTO auto_deploy(userId,namespace,stageId,fingerprint,hash,payload,bytes)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cloud_save WHERE userId=? AND syncReviewed=1 AND gameSync=1 AND paused=0)
          AND (? IS NULL OR EXISTS(SELECT 1 FROM auto_deploy WHERE userId=? AND namespace=? AND stageId=? AND hash=?))
        ON CONFLICT(userId,namespace,stageId) DO UPDATE SET fingerprint=excluded.fingerprint,hash=excluded.hash,payload=excluded.payload,bytes=excluded.bytes
          WHERE auto_deploy.hash=? AND EXISTS(SELECT 1 FROM cloud_save WHERE userId=? AND syncReviewed=1 AND gameSync=1 AND paused=0)
          AND NOT EXISTS(SELECT 1 FROM json_each(auto_deploy.fingerprint) old JOIN json_each(excluded.fingerprint) fresh ON old.key=fresh.key WHERE old.key IN (1,2,3) AND old.type='integer' AND (fresh.type!='integer' OR fresh.value<old.value))
        RETURNING hash`)
        .bind(owner,namespace,stageId,req.body.fingerprint,hash,payload,new TextEncoder().encode(payload).length,owner,
          req.body.expectedHash,owner,namespace,stageId,req.body.expectedHash,req.body.expectedHash,owner).first<{hash:string}>();
      if(result?.hash!==hash)return res.status(409).json({error:'Cloud data or saving choices changed. Resume to compare again; existing saves are safe.'});
      return res.json({hash});
    }catch(error){
      if(String(error).includes('ARKPEDIA_REPLAY_QUOTA'))return res.status(413).json({error:'Your auto-deploy cloud archive reached its 32 MiB / 3,000 replay limit. Existing saves are safe.'});
      return res.status(503).json({error:'Auto-deploy cloud storage is temporarily unavailable. Your browser copies are safe.'});
    }
  };
}
