import type { D1Database } from '@cloudflare/workers-types';
import { communityOperators, communityStages } from './catalogues';
import { COMMUNITY_MIN_SAMPLE } from './model';

export interface StageClear {stageId:string;clears:number;slug:string;code:string;name:string;image:string|null}
interface RosterRanking { operator:string; owned:number; builds:number; e2:number; m9:number; m3?:number[]; unraised:number; maxed:number }
interface RosterAggregate extends Omit<RosterRanking,'m3'> {m3_0:number;m3_1:number;m3_2:number}
interface ReplayRanking { charId:string; skill:number|null; squads:number; deployed:number; deployments:number; activations:number; benched:number }
export interface CommunityRankings { contributors:number; roster:RosterRanking[]|null; replayContributors:number; replays:number; battles:ReplayRanking[]|null; clearContributors?:number; clearRecords?:number; clearedStages?:number; stageClears?:StageClear[]|null; stageCoverage?:{operator:string;stages:number}[]|null; source?:'production-snapshot';capturedAt?:string }

/** Fixed aggregate projections only. Private replay payloads and identities never leave D1. */
export async function communityRankings(db:D1Database,server:string,stage:string):Promise<CommunityRankings>{
  const [stages,operators]=await Promise.all([communityStages(),communityOperators()]);
  const region=server==='all'?'':' AND a.server=?',args=server==='all'?[]:[server];
  const contributors=(await db.prepare(`SELECT count(*) n FROM community_account a WHERE stats=1${region}`).bind(...args).first<{n:number}>())?.n??0;
  // Existing community consent includes archived game accounts. Deduplicate each
  // game-account/stage pair even if it was uploaded by multiple Arkpedia users.
  const eligible=`WITH eligible AS (SELECT r.userId,r.namespace,r.stageId,row_number() OVER(PARTITION BY r.namespace,r.stageId ORDER BY r.updatedAt DESC,r.userId) pick
    FROM auto_deploy_summary r JOIN community_account a ON a.userId=r.userId
    WHERE a.stats=1${server==='all'?'':' AND substr(r.namespace,1,2)=?'}${stage?' AND r.stageId=?':''}),
    runs AS (SELECT * FROM eligible WHERE pick=1)`;
  const replayArgs=[...args,...(stage?[stage]:[])];
  const coverage=await db.prepare(`${eligible} SELECT count(DISTINCT namespace) contributors,count(*) replays FROM runs`).bind(...replayArgs).first<{contributors:number;replays:number}>();
  const roster=contributors<COMMUNITY_MIN_SAMPLE?null:(await db.prepare(`SELECT o.operator,count(*) owned,count(CASE WHEN o.elite IS NOT NULL AND o.level IS NOT NULL THEN 1 END) builds,
    sum(CASE WHEN o.elite=2 THEN 1 ELSE 0 END) e2,
    sum(CASE WHEN o.elite=2 AND o.m0=3 AND o.m1=3 AND o.m2=3 THEN 1 ELSE 0 END) m9,
    sum(CASE WHEN o.elite=2 AND o.m0=3 THEN 1 ELSE 0 END) m3_0,
    sum(CASE WHEN o.elite=2 AND o.m1=3 THEN 1 ELSE 0 END) m3_1,
    sum(CASE WHEN o.elite=2 AND o.m2=3 THEN 1 ELSE 0 END) m3_2,
    sum(CASE WHEN o.elite=0 AND o.level=1 THEN 1 ELSE 0 END) unraised,
    sum(CASE WHEN o.elite=2 AND o.level=90 THEN 1 ELSE 0 END) maxed
    FROM community_operator o JOIN community_account a ON a.userId=o.userId WHERE a.stats=1${region} GROUP BY o.operator`).bind(...args).all<RosterAggregate>()).results.map(({m3_0,m3_1,m3_2,...row})=>({...row,m3:[m3_0,m3_1,m3_2]}));
  const battles=(coverage?.contributors??0)<COMMUNITY_MIN_SAMPLE?null:(await db.prepare(`${eligible} SELECT json_extract(j.value,'$.charId') charId,json_extract(j.value,'$.skill') skill,
    sum(json_extract(j.value,'$.squad')) squads,sum(json_extract(j.value,'$.deployed')) deployed,
    sum(json_extract(j.value,'$.deployments')) deployments,sum(json_extract(j.value,'$.activations')) activations,
    sum(CASE WHEN json_extract(j.value,'$.squad')=1 AND json_extract(j.value,'$.deployed')=0 THEN 1 ELSE 0 END) benched
    FROM runs r JOIN auto_deploy_summary s ON s.userId=r.userId AND s.namespace=r.namespace AND s.stageId=r.stageId,
    json_each(s.units) j GROUP BY charId,skill`).bind(...replayArgs).all<ReplayRanking>()).results;
  const knownStages=JSON.stringify([...new Set(stages.map(s=>s.id))]);
  const charNames=new Map(operators.flatMap(op=>op.charIds.map(id=>[id,op.name] as const)));
  // Lifetime counters are monotonic, unlike the current archived squad. Take the
  // largest counter for duplicate uploads; never attribute historical farming to it.
  const counters=`WITH eligible AS (SELECT d.namespace,d.stageId,json_extract(d.fingerprint,'$[2]') clears
    FROM auto_deploy d JOIN community_account a ON a.userId=d.userId
    WHERE a.stats=1 AND json_valid(d.fingerprint) AND d.stageId IN (SELECT value FROM json_each(?))${server==='all'?'':' AND substr(d.namespace,1,2)=?'}${stage?' AND d.stageId=?':''}),
    counters AS (SELECT namespace,stageId,max(CASE WHEN typeof(clears)='integer' AND clears>=0 THEN clears END) clears FROM eligible GROUP BY namespace,stageId)`;
  const counterArgs=[knownStages,...replayArgs];
  const clearSample=await db.prepare(`${counters} SELECT count(DISTINCT CASE WHEN clears IS NOT NULL THEN namespace END) contributors,count(clears) records FROM counters`).bind(...counterArgs).first<{contributors:number;records:number}>();
  const stageClears=(clearSample?.contributors??0)<COMMUNITY_MIN_SAMPLE?null:(await db.prepare(`${counters} SELECT stageId,sum(clears) clears FROM counters WHERE clears IS NOT NULL GROUP BY stageId`).bind(...counterArgs).all<{stageId:string;clears:number}>()).results;
  const successful=`${eligible}, successful AS (SELECT r.* FROM runs r JOIN auto_deploy d INDEXED BY auto_deploy_community_counters ON d.userId=r.userId AND d.namespace=r.namespace AND d.stageId=r.stageId
    WHERE r.stageId IN (SELECT value FROM json_each(?)) AND CASE WHEN json_valid(d.fingerprint) THEN
    ((typeof(json_extract(d.fingerprint,'$[2]'))='integer' AND json_extract(d.fingerprint,'$[2]')>0) OR (typeof(json_extract(d.fingerprint,'$[4]'))='integer' AND json_extract(d.fingerprint,'$[4]')>=2)) ELSE 0 END)`;
  const stageArgs=[...replayArgs,knownStages];
  const clearedStages=(await db.prepare(`${successful} SELECT count(DISTINCT stageId) n FROM successful`).bind(...stageArgs).first<{n:number}>())?.n??0;
  // Union deployments per public stage before resolving names. Looking up the
  // entire name catalogue for every replay unit exceeds production D1 CPU limits.
  // These rows contain no account identities or individual squads.
  const stageUnits=(coverage?.contributors??0)<COMMUNITY_MIN_SAMPLE?null:(await db.prepare(`${successful}
    SELECT r.stageId,json_group_array(DISTINCT json_extract(j.value,'$.charId')) charIds
    FROM successful r JOIN auto_deploy_summary s ON s.userId=r.userId AND s.namespace=r.namespace AND s.stageId=r.stageId,
    json_each(s.units) j WHERE json_extract(j.value,'$.deployed')=1 GROUP BY r.stageId`)
    .bind(...stageArgs).all<{stageId:string;charIds:string}>()).results;
  const coverageCounts=new Map<string,number>();
  for(const row of stageUnits??[]){
    const names=new Set((JSON.parse(row.charIds) as string[]).flatMap(id=>{const name=charNames.get(id);return name?[name]:[];}));
    for(const name of names)coverageCounts.set(name,(coverageCounts.get(name)??0)+1);
  }
  const stageCoverage=stageUnits===null?null:[...coverageCounts].map(([operator,stages])=>({operator,stages}));
  return {clearContributors:clearSample?.contributors??0,clearRecords:clearSample?.records??0,clearedStages,stageClears:stageClears?.flatMap(row=>{const stage=stages.find(s=>s.id===row.stageId);return stage?[{...row,slug:stage.slug,code:stage.code??stage.slug,name:stage.name??stage.code??stage.slug,image:stage.image}]:[];})??null,stageCoverage,contributors,roster,replayContributors:coverage?.contributors??0,replays:coverage?.replays??0,battles};
}
