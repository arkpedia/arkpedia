import type { NextApiRequest, NextApiResponse } from 'next';
import type { D1Database } from '@cloudflare/workers-types';
import { fromNodeHeaders } from 'better-auth/node';
import { accountAuth, accountsEnv, type AccountsEnv } from '@/lib/cloud-account/server';
import { isServerId } from '@/lib/account-import/yostar';
import { communityRankings } from './rankings';
import { cachedCommunityRankings } from './rankingsCache';
import { previewStatistics } from './preview-statistics';
import { skinRatings } from '@/lib/polls/skin-ratings-api';
import { skinPoll,skinPollIds } from '@/lib/polls/skin-poll-api';
import { STAGE_ID } from '@/lib/replays/model';
import { COMMUNITY_OFF, COMMUNITY_MIN_SAMPLE, SUPPORT_MAX_AGE, AVAILABILITY_MAX_AGE, FULL_REPORT_THRESHOLD, parseCommunityChoices, parseCommunitySnapshot, type CommunityState } from './model';

type Limiter = { limit: (options:{key:string})=>Promise<{success:boolean}> };
type Env = AccountsEnv & { ACCOUNT_TRAFFIC_LIMIT?: Limiter; ACCOUNT_IP_LIMIT?: Limiter };
interface Row { userId:string; gameKey:string|null; listingId:string; server:'en'|'jp'|'kr'; importedAt:string; revision:number; stats:number; shareTag:number; openRequests:number; friendTag:string|null; slots:number|null; fullReports?:number; openReports?:number }
const reportedFull=(row:Row)=> (row.fullReports??0)>=FULL_REPORT_THRESHOLD&&(row.fullReports??0)>(row.openReports??0);
const active=(row:Row,now:number)=>!!(row.shareTag&&row.openRequests&&row.friendTag&&(row.slots??0)>0&&Date.parse(row.importedAt)>=now-SUPPORT_MAX_AGE);
const ownerState=(row:Row|null,now:number):CommunityState=>row ? {stats:!!row.stats,shareTag:!!row.shareTag,openRequests:!!row.openRequests,revision:row.revision,
  server:row.server,importedAt:row.importedAt,friendTag:row.friendTag,listed:active(row,now)&&!reportedFull(row),reportedFull:reportedFull(row)} : {...COMMUNITY_OFF,revision:0};
const reportCounts=`SELECT targetId,snapshotAt,sum(isFull) AS fullReports,sum(1-isFull) AS openReports FROM community_availability WHERE createdAt>=? GROUP BY targetId,snapshotAt`;
const readRow=(db:D1Database,owner:string,time:number)=>db.prepare(`WITH reports AS (${reportCounts}) SELECT a.*,r.fullReports,r.openReports FROM community_account a LEFT JOIN reports r ON r.targetId=a.userId AND r.snapshotAt=a.importedAt WHERE a.userId=?`).bind(new Date(time-AVAILABILITY_MAX_AGE).toISOString(),owner).first<Row>();
async function allowWrite(db:D1Database,owner:string,time:number){
  return !!await db.prepare(`INSERT INTO community_write_limit(userId,window,count) VALUES(?,?,1)
    ON CONFLICT(userId) DO UPDATE SET window=excluded.window,count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END
    WHERE window!=excluded.window OR count<10 RETURNING count`).bind(owner,Math.floor(time/60_000)).first();
}
async function withdraw(db:D1Database,owner:string,time:number){
  // Retain a consent tombstone so an in-flight first publication cannot resurrect sharing.
  await db.batch([
    db.prepare(`INSERT INTO community_account(userId,gameKey,listingId,server,importedAt,revision,mutationId,stats,shareTag,openRequests,friendTag,slots,equipmentKnown,updatedAt)
      VALUES(?,NULL,?,'en',?,1,?,0,0,0,NULL,NULL,0,?) ON CONFLICT(userId) DO UPDATE SET gameKey=NULL,revision=revision+1,mutationId=excluded.mutationId,stats=0,shareTag=0,openRequests=0,friendTag=NULL,slots=NULL,appearance=NULL,equipmentKnown=0,updatedAt=excluded.updatedAt`)
      .bind(owner,crypto.randomUUID(),new Date(time).toISOString(),crypto.randomUUID(),new Date(time).toISOString()),
    ...['community_operator','community_skin','community_support'].map(table=>db.prepare(`DELETE FROM ${table} WHERE userId=?`).bind(owner)),
    db.prepare('DELETE FROM community_availability WHERE targetId=? OR reporterId=?').bind(owner,owner),
  ]);
  return ownerState(await db.prepare('SELECT * FROM community_account WHERE userId=?').bind(owner).first<Row>(),time);
}
export async function gameFingerprint(secret:string,server:string,uid:string) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`community-v1:${server}:${uid}`)))).map(v=>v.toString(16).padStart(2,'0')).join('');
}
/** Isolated rows, explicit consent, revision checks and fixed public projections. */
export function createCommunityHandler(kind:'sharing'|'stats'|'supports'|'availability'|'rankings'|'skin-poll',{
  resolveEnv=accountsEnv, authenticate=async(req:NextApiRequest,env:AccountsEnv)=>(await accountAuth(env).api.getSession({headers:fromNodeHeaders(req.headers)}))?.user.id??null, now=()=>Date.now(),
  pollSkinIds=skinPollIds,
}:{resolveEnv?:()=>Env|null;authenticate?:(req:NextApiRequest,env:AccountsEnv)=>Promise<string|null>;now?:()=>number;pollSkinIds?:()=>Promise<ReadonlySet<string>>}={}) {
  return async(req:NextApiRequest,res:NextApiResponse)=>{
    res.setHeader('Cache-Control','private, no-store'); res.setHeader('Vary','Cookie'); res.setHeader('X-Robots-Tag','noindex');
    const env=resolveEnv();
    if(!env) return res.status(503).json({error:'Community sharing is not configured on this deployment.'});
    const methods=['sharing','skin-poll'].includes(kind)?['GET','PUT','DELETE']:kind==='availability'?['POST','DELETE']:['GET'];
    if(!methods.includes(req.method??'')){res.setHeader('Allow',methods.join(', '));return res.status(405).end();}
    if(req.method!=='GET'&&(req.headers.origin!==env.ARKPEDIA_AUTH_URL||!req.headers['content-type']?.startsWith('application/json'))) return res.status(403).json({error:'This request must come from Arkpedia.'});
    try{
      // Fail closed if deployment ingress limits were not configured. No IPs are persisted.
      if(!env.ACCOUNT_TRAFFIC_LIMIT||!env.ACCOUNT_IP_LIMIT) return res.status(503).json({error:'Community sharing is not configured on this deployment.'});
      const total=await env.ACCOUNT_TRAFFIC_LIMIT.limit({key:'community'}),ip=req.headers['cf-connecting-ip'];
      const individual=typeof ip==='string'&&ip!=='2a06:98c0:3600::103'?await env.ACCOUNT_IP_LIMIT.limit({key:ip}):{success:true};
      if(!total.success||!individual.success){res.setHeader('Retry-After','60');return res.status(429).json({error:'Please wait a minute before checking again.'});}
      const db=env.ARKPEDIA_ACCOUNTS_DB,time=now();
      if(kind==='rankings'){
        const server=req.query.server??'all',stage=req.query.stage??'';
        if((server!=='all'&&!isServerId(server))||typeof stage!=='string'||(stage&&!STAGE_ID.test(stage)))return res.status(400).json({error:'Choose a valid region and stage ID.'});
        const snapshot=previewStatistics(env.ARKPEDIA_DEPLOYMENT_ROLE,server,stage);
        return res.json(snapshot??await (env.ARKPEDIA_DEPLOYMENT_ROLE==='production'?cachedCommunityRankings:communityRankings)(db,server,stage));
      }
      if(kind==='stats')return await stats(req,res,db);
      if(kind==='supports')return await supports(req,res,db,time);
      const owner=await authenticate(req,env);
      if(kind==='skin-poll')return await (req.query.mode==='ratings'?skinRatings:skinPoll)(req,res,db,owner,pollSkinIds);
      if(!owner)return res.status(401).json({error:kind==='availability'?'Sign in to report availability.':'Sign in to choose community sharing.'});
      if(kind==='availability')return await availability(req,res,db,owner,time);
      const row=await readRow(db,owner,time);
      if(req.method==='GET')return res.json(ownerState(row,time));
      if(req.body?.owner!==owner)return res.status(409).json({error:'Your signed-in account changed. Reopen community settings.'});
      if(req.method==='DELETE'){
        return res.json(await withdraw(db,owner,time));
      }
      if(!Number.isSafeInteger(req.body?.revision)||req.body.revision!==(row?.revision??0))return res.status(409).json({error:'Your sharing choices changed on another device. Review them again.'});
      const choices=parseCommunityChoices(req.body.choices);
      if(!choices.stats&&!choices.shareTag&&!choices.openRequests){
        return res.json(await withdraw(db,owner,time));
      }
      if(req.body.snapshot===undefined&&row&&Object.entries(choices).every(([key,value])=>!value||!!row[key as 'stats'|'shareTag'|'openRequests'])){
        const nonce=crypto.randomUUID(),revision=row.revision+1;
        const statements=[db.prepare(`UPDATE community_account SET stats=?,shareTag=?,openRequests=?,revision=?,mutationId=?,appearance=CASE WHEN ?=1 AND ?=1 THEN appearance ELSE NULL END,friendTag=CASE WHEN ?=1 AND ?=1 THEN friendTag ELSE NULL END WHERE userId=? AND revision=? RETURNING userId`)
          .bind(+choices.stats,+choices.shareTag,+choices.openRequests,revision,nonce,+choices.shareTag,+choices.openRequests,+choices.shareTag,+choices.openRequests,owner,row.revision)];
        for(const table of [...(!choices.stats?['community_operator','community_skin']:[]),...(!choices.shareTag||!choices.openRequests?['community_support']:[])])statements.push(db.prepare(`DELETE FROM ${table} WHERE userId=? AND EXISTS(SELECT 1 FROM community_account WHERE userId=? AND mutationId=?)`).bind(owner,owner,nonce));
        if(!choices.shareTag||!choices.openRequests)statements.push(db.prepare('DELETE FROM community_availability WHERE targetId=? AND EXISTS(SELECT 1 FROM community_account WHERE userId=? AND mutationId=?)').bind(owner,owner,nonce));
        const result=await db.batch(statements);
        if(result[0].results.length!==1)return res.status(409).json({error:'Sharing changed on another device. Review it again.'});
        return res.json(ownerState(await readRow(db,owner,time),time));
      }
      const allowed=await allowWrite(db,owner,time);
      if(!allowed){res.setHeader('Retry-After','60');return res.status(429).json({error:'Please wait a minute before updating your shared snapshot.'});}
      const snapshot=parseCommunitySnapshot(req.body.snapshot,choices,time),key=await gameFingerprint(env.BETTER_AUTH_SECRET,snapshot.server,snapshot.uid);
      if(req.body.action==='refresh'&&(!row||row.gameKey!==key))return res.status(409).json({error:'The imported game account changed. Review community sharing before publishing it.'});
      if(row?.gameKey===key&&snapshot.importedAt<row.importedAt)return res.status(409).json({error:'A newer import is already shared. Import again before replacing it.'});
      if(!['consent','refresh'].includes(req.body.action))return res.status(400).json({error:'Review community sharing first.'});
      // An automatic refresh can update the snapshot, never consent from another tab/device.
      if(req.body.action==='refresh'&&(!row||choices.stats!==!!row.stats||choices.shareTag!==!!row.shareTag||choices.openRequests!==!!row.openRequests))return res.status(409).json({error:'Your sharing choices changed. Review them again.'});
      const profile=await db.prepare('SELECT userId FROM arkpedia_profile WHERE userId=?').bind(owner).first();
      if(!profile)return res.status(428).json({error:'Finish your Arkpedia profile before sharing.'});
      const listingId=row?.gameKey===key?row.listingId:crypto.randomUUID(),revision=(row?.revision??0)+1,updatedAt=new Date(time).toISOString(),mutationId=crypto.randomUUID();
      const statements=[row
        ? db.prepare(`UPDATE community_account SET gameKey=?,listingId=?,server=?,importedAt=?,revision=?,mutationId=?,stats=?,shareTag=?,openRequests=?,friendTag=?,slots=?,equipmentKnown=?,appearance=?,updatedAt=? WHERE userId=? AND revision=? RETURNING userId`)
          .bind(key,listingId,snapshot.server,snapshot.importedAt,revision,mutationId,+choices.stats,+choices.shareTag,+choices.openRequests,snapshot.doctor,snapshot.slots,+snapshot.equipmentKnown,snapshot.appearance?JSON.stringify(snapshot.appearance):null,updatedAt,owner,row.revision)
        : db.prepare(`INSERT INTO community_account(userId,gameKey,listingId,server,importedAt,revision,mutationId,stats,shareTag,openRequests,friendTag,slots,equipmentKnown,appearance,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING userId`)
          .bind(owner,key,listingId,snapshot.server,snapshot.importedAt,revision,mutationId,+choices.stats,+choices.shareTag,+choices.openRequests,snapshot.doctor,snapshot.slots,+snapshot.equipmentKnown,snapshot.appearance?JSON.stringify(snapshot.appearance):null,updatedAt),
      ];
      const guard='EXISTS(SELECT 1 FROM community_account WHERE userId=? AND revision=? AND mutationId=?)';
      for(const table of ['community_operator','community_skin','community_support'])statements.push(db.prepare(`DELETE FROM ${table} WHERE userId=? AND ${guard}`).bind(owner,owner,revision,mutationId));
      statements.push(db.prepare(`DELETE FROM community_availability WHERE targetId=? AND (snapshotAt!=? OR ?=0 OR ?=0 OR ?=1) AND ${guard}`).bind(owner,snapshot.importedAt,+choices.shareTag,+choices.openRequests,+(row?.gameKey!==key),owner,revision,mutationId));
      statements.push(db.prepare(`INSERT INTO community_operator(userId,operator,elite,level,m0,m1,m2,modules,skillLevel)
        SELECT ?,json_extract(value,'$.operator'),json_extract(value,'$.elite'),json_extract(value,'$.level'),json_extract(value,'$.m0'),json_extract(value,'$.m1'),json_extract(value,'$.m2'),json_extract(value,'$.modules'),json_extract(value,'$.skillLevel')
        FROM json_each(?) WHERE ${guard}`).bind(owner,JSON.stringify(snapshot.operators),owner,revision,mutationId));
      statements.push(db.prepare(`INSERT INTO community_skin(userId,skin,equipped) SELECT ?,json_extract(value,'$.skin'),json_extract(value,'$.equipped') FROM json_each(?) WHERE ${guard}`)
        .bind(owner,JSON.stringify(snapshot.skins),owner,revision,mutationId));
      statements.push(db.prepare(`INSERT INTO community_support(userId,slot,operator,elite,level,skill,mastery,module,moduleLevel,potential,skin,skillId,allMastered,skillLevel,skillMasteries)
        SELECT ?,CAST(key AS INTEGER),json_extract(value,'$.operator'),json_extract(value,'$.elite'),json_extract(value,'$.level'),json_extract(value,'$.skill'),json_extract(value,'$.mastery'),json_extract(value,'$.module'),json_extract(value,'$.moduleLevel'),json_extract(value,'$.potential'),json_extract(value,'$.skin'),json_extract(value,'$.skillId'),json_extract(value,'$.allMastered'),json_extract(value,'$.skillLevel'),json_extract(value,'$.skillMasteries') FROM json_each(?) WHERE ${guard}`)
        .bind(owner,JSON.stringify(snapshot.supports),owner,revision,mutationId));
      const result=await db.batch(statements);
      if(result[0].results.length!==1)return res.status(409).json({error:'Sharing changed on another device. Review it again.'});
      return res.json(ownerState(await readRow(db,owner,time),time));
    }catch(error){
      if(/UNIQUE constraint|community_account.gameKey/i.test(String(error)))return res.status(409).json({error:'This game account already has a community contribution. Each game account can contribute once.'});
      if(error instanceof Error&&/^(Choose|Import|Invalid|Unexpected|Incomplete|Masteries|Duplicate|Community snapshot|Preview statistics snapshot|Sign-in credentials|Saved data)/.test(error.message))return res.status(400).json({error:error.message});
      return res.status(503).json({error:'Community data is temporarily unavailable. Your private saves are unchanged.'});
    }
  };
}
async function stats(req:NextApiRequest,res:NextApiResponse,db:D1Database){
  const server=req.query.server??'en',operator=req.query.operator,skin=req.query.skin;
  if((server!=='all'&&!isServerId(server))||(typeof operator!=='string'&&typeof skin!=='string')||(typeof operator==='string'&&typeof skin==='string')||String(operator??skin).length>200)return res.status(400).json({error:'Choose a server and operator or outfit.'});
  const serverArgs=server==='all'?[]:[server];
  const accountRegion=server==='all'?'':' AND server=?';
  const joinedRegion=server==='all'?'':' AND a.server=?';
  const contributors=(await db.prepare(`SELECT count(*) AS n FROM community_account WHERE stats=1${accountRegion}`).bind(...serverArgs).first<{n:number}>())?.n??0;
  if(contributors<COMMUNITY_MIN_SAMPLE)return res.json({contributors,owned:null});
  if(typeof skin==='string'){
    const row=await db.prepare(`SELECT count(*) AS owned,COALESCE(sum(a.equipmentKnown),0) AS equipmentOwners,COALESCE(sum(CASE WHEN a.equipmentKnown=1 THEN s.equipped ELSE 0 END),0) AS equipped FROM community_skin s JOIN community_account a ON a.userId=s.userId WHERE s.skin=? AND a.stats=1${joinedRegion}`).bind(skin,...serverArgs).first<{owned:number;equipmentOwners:number;equipped:number}>();
    return res.json({contributors,owned:row?.owned??0,equipmentOwners:row?.equipmentOwners??0,equipped:row?.equipped??0});
  }
  // All E2 owners qualify, including low or unknown character levels.
  // Retain the previous cumulative cohorts for already-open clients during deployments.
  const levels=[0,40,50,60];
  const moduleColumns=levels.map(level=>{
    const comparison=level===0?'=':'>=';
    const eligible=level===0?'o.elite=2':`o.elite=2 AND o.level>=${level}`;
    return [`COALESCE(sum(CASE WHEN ${eligible} THEN 1 ELSE 0 END),0) AS eligible${level}`,
      ...Array.from({length:8},(_,i)=>[1,2,3].map(stage=>`COALESCE(sum(CASE WHEN ${eligible} AND json_extract(o.modules,'$."${i}"')${comparison}${stage} THEN 1 ELSE 0 END),0) AS mod${level}_${i}_${stage}`).join(','))].join(',');
  });
  // Any mastery proves shared skill rank 7 in older snapshots; otherwise a
  // missing ordinary rank remains unknown rather than becoming rank 7 or zero.
  const rank="COALESCE(o.skillLevel,CASE WHEN o.m0>0 OR o.m1>0 OR o.m2>0 THEN 7 END)";
  const skillColumns=Array.from({length:3},(_,i)=>[
    ...[0,1,2,3].map(stage=>`COALESCE(sum(o.elite=2 AND o.m${i}=${stage}${stage===0?` AND ${rank}=7`:''}),0) AS rank${i}_${stage}`),
    `COALESCE(sum(o.elite=2 AND ${rank} IS NULL),0) AS unknown${i}`,
  ].join(',')).join(',');
  const columns=[
    'count(*) AS owned','count(o.elite) AS builds','COALESCE(sum(o.elite=1),0) AS e1','COALESCE(sum(o.elite=2),0) AS e2',
    ...[0,1,2].map(i=>`COALESCE(sum(o.elite=2 AND o.m${i}=3),0) AS s${i}`),
  ];
  // D1 limits SELECT results to 100 columns. Split current (47) and legacy (75)
  // aggregates in one transactional batch so both client versions see the same data.
  const select=(fields:string[])=>db.prepare(`SELECT ${fields.join(',')}
    FROM community_operator o JOIN community_account a ON a.userId=o.userId WHERE o.operator=? AND a.stats=1${joinedRegion}`).bind(operator,...serverArgs);
  const results=await db.batch<Record<string,number>>([
    select(columns.concat(skillColumns,moduleColumns[0])),
    select(moduleColumns.slice(1)),
  ]);
  const row=Object.assign({},...results.map(result=>result.results[0])) as Record<string,number>;
  return res.json({contributors,owned:row?.owned??0,
    builds:row?.builds??0,e1:row?.e1??0,e2:row?.e2??0,
    skillRanks:Array.from({length:3},(_,i)=>[0,1,2,3].map(stage=>row?.[`rank${i}_${stage}`]??0)),
    skillUnknown:[0,1,2].map(i=>row?.[`unknown${i}`]??0),
    masteryOwners:row?.e2??0,skills:[row?.s0??0,row?.s1??0,row?.s2??0],
    moduleOwners:row?.e2??0,modules:Array.from({length:8},(_,i)=>[1,2,3].map(stage=>row?.[`mod0_${i}_${stage}`]??0)),
    moduleGroups:levels.filter(level=>level>0).map(level=>({level,owners:row?.[`eligible${level}`]??0,modules:Array.from({length:8},(_,i)=>[1,2,3].map(stage=>row?.[`mod${level}_${i}_${stage}`]??0))})),
  });
}
async function supports(req:NextApiRequest,res:NextApiResponse,db:D1Database,now:number){
  const server=req.query.server??'en',operator=req.query.operator??'',tag=req.query.tag??'',q=req.query;
  const number=(key:string,low:number,high:number,fallback:number)=>q[key]===undefined||q[key]===''?fallback:typeof q[key]==='string'&&/^\d+$/.test(q[key] as string)&&Number(q[key])>=low&&Number(q[key])<=high?Number(q[key]):NaN;
  const min=number('minLevel',1,90,1),max=number('maxLevel',1,90,90),elite=number('elite',0,2,-1),mastery=number('mastery',0,3,-1),skill=number('skill',1,3,-1),cursor=number('cursor',0,100000,0);
  if(!isServerId(server)||typeof operator!=='string'||operator.length>200||typeof tag!=='string'||tag.length>200||[min,max,elite,mastery,skill,cursor].some(Number.isNaN)||min>max)return res.status(400).json({error:'Check the support filters.'});
  const conditions=['a.server=?','a.shareTag=1','a.openRequests=1','a.friendTag IS NOT NULL','a.slots>0','a.importedAt>=?','s.level>=?','s.level<=?'];
  conditions.push(`(COALESCE(r.fullReports,0)<${FULL_REPORT_THRESHOLD} OR COALESCE(r.openReports,0)>=COALESCE(r.fullReports,0))`);
  const args:(string|number)[]=[server,new Date(now-SUPPORT_MAX_AGE).toISOString(),min,max];
  if(operator){conditions.push('s.operator=?');args.push(operator);}
  if(tag.trim()){conditions.push('instr(lower(a.friendTag),lower(?))>0');args.push(tag.trim());}
  for(const [column,value] of [['elite',elite],['mastery',mastery],['skill',skill]] as const)if(value>=0){conditions.push(`s.${column}=?`);args.push(value);}
  // Return only the expressly public fields, never user IDs, game UIDs or full rosters.
  // Match any equipped support, then return all three on the same player's card.
  const rows=(await db.prepare(`WITH reports AS (${reportCounts}) SELECT a.listingId AS id,a.friendTag,a.server,a.slots,a.importedAt,a.appearance,COALESCE(r.fullReports,0) AS fullReports,COALESCE(r.openReports,0) AS openReports,
    (SELECT json_group_array(json(build)) FROM (SELECT json_object('operator',operator,'elite',elite,'level',level,'skill',skill,'mastery',mastery,'module',module,'moduleLevel',moduleLevel,'potential',potential,'skin',skin,'skillId',skillId,'allMastered',allMastered,'skillLevel',skillLevel,'skillMasteries',json(COALESCE(skillMasteries,'[]'))) AS build FROM community_support WHERE userId=a.userId ORDER BY slot)) AS supports
    FROM community_account a LEFT JOIN reports r ON r.targetId=a.userId AND r.snapshotAt=a.importedAt WHERE EXISTS(SELECT 1 FROM community_support s WHERE s.userId=a.userId AND ${conditions.join(' AND ')}) ORDER BY a.importedAt DESC,a.listingId LIMIT 51 OFFSET ?`).bind(new Date(now-AVAILABILITY_MAX_AGE).toISOString(),...args,cursor).all<{supports:string;appearance:string|null}>()).results;
  return res.json({listings:rows.slice(0,50).map(row=>({...row,appearance:row.appearance?JSON.parse(row.appearance):null,supports:JSON.parse(row.supports).map((s:Record<string,unknown>)=>({...s,allMastered:s.allMastered===null?null:!!s.allMastered}))})),next:rows.length>50?cursor+50:null});
}

async function availability(req:NextApiRequest,res:NextApiResponse,db:D1Database,owner:string,time:number){
  if(req.body?.owner!==owner)return res.status(409).json({error:'Your signed-in account changed. Reload before reporting.'});
  const {listing,importedAt,status}=req.body??{};
  if(typeof listing!=='string'||!/^[a-f0-9-]{36}$/.test(listing)||typeof importedAt!=='string'||(req.method==='POST'&&!['full','open'].includes(status)))return res.status(400).json({error:'Choose an availability report for this listing.'});
  const target=await db.prepare('SELECT * FROM community_account WHERE listingId=?').bind(listing).first<Row>();
  if(!target||!active(target,time)||target.importedAt!==importedAt)return res.status(409).json({error:'This listing changed or expired. Check the support finder again.'});
  if(target.userId===owner)return res.status(400).json({error:'Import your game account to update your own availability.'});
  if(!await db.prepare('SELECT userId FROM arkpedia_profile WHERE userId=?').bind(owner).first())return res.status(428).json({error:'Finish your Arkpedia profile before reporting.'});
  if(!await allowWrite(db,owner,time)){res.setHeader('Retry-After','60');return res.status(429).json({error:'Please wait a minute before reporting again.'});}
  const since=new Date(time-AVAILABILITY_MAX_AGE).toISOString();
  if(req.method==='DELETE')await db.prepare('DELETE FROM community_availability WHERE targetId=? AND reporterId=?').bind(target.userId,owner).run();
  else {
    const result=await db.batch([
      db.prepare('DELETE FROM community_availability WHERE reporterId=? AND createdAt<?').bind(owner,since),
      // The current import and opt-ins are checked inside the write as well as before it.
      db.prepare(`INSERT INTO community_availability(targetId,reporterId,snapshotAt,isFull,createdAt)
        SELECT userId,?,?,?,? FROM community_account WHERE userId=? AND listingId=? AND importedAt=? AND shareTag=1 AND openRequests=1 AND slots>0
        ON CONFLICT(targetId,reporterId) DO UPDATE SET snapshotAt=excluded.snapshotAt,isFull=excluded.isFull,createdAt=excluded.createdAt RETURNING targetId`)
        .bind(owner,importedAt,+(status==='full'),new Date(time).toISOString(),target.userId,listing,importedAt),
    ]);
    if(result[1].results.length!==1)return res.status(409).json({error:'This listing changed. Check the support finder again.'});
  }
  const counts=await db.prepare(`SELECT COALESCE(sum(isFull),0) AS fullReports,COALESCE(sum(1-isFull),0) AS openReports FROM community_availability WHERE targetId=? AND snapshotAt=? AND createdAt>=?`).bind(target.userId,importedAt,since).first<{fullReports:number;openReports:number}>();
  return res.json({...counts,hidden:reportedFull({...target,...counts}),status:req.method==='DELETE'?null:status});
}
