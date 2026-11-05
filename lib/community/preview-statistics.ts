import snapshot from '@/config/preview-community-statistics.json';
import type { CommunityRankings } from './rankings';
import { COMMUNITY_MIN_SAMPLE } from './model';

interface Snapshot {schema:number;capturedAt:string|null;cohorts:Record<string,CommunityRankings>}

/** Public aggregates only; never a production database binding or account proxy. */
export function previewStatistics(role:string|undefined,server:string,stage:string,value:Snapshot=snapshot):CommunityRankings|null{
  if(role!=='staging'||value.schema!==1||!value.capturedAt||!Number.isFinite(Date.parse(value.capturedAt))||!Object.hasOwn(value.cohorts,server))return null;
  if(stage)throw Error('Preview statistics snapshot covers all stages.');
  const cohort=value.cohorts[server];
  return {contributors:cohort.contributors,replayContributors:cohort.replayContributors,replays:cohort.replays,
    roster:cohort.contributors<COMMUNITY_MIN_SAMPLE?null:cohort.roster?.map(({operator,owned,builds,e2,m9,m3,unraised,maxed})=>({operator,owned,builds,e2,m9,...(m3?{m3:m3.slice(0,3)}:{}),unraised,maxed}))??null,
    battles:cohort.replayContributors<COMMUNITY_MIN_SAMPLE?null:cohort.battles?.map(({charId,skill,squads,deployed,deployments,activations,benched})=>({charId,skill,squads,deployed,deployments,activations,benched}))??null,
    clearContributors:cohort.clearContributors??0,clearRecords:cohort.clearRecords??0,clearedStages:cohort.clearedStages??0,
    stageClears:(cohort.clearContributors??0)<COMMUNITY_MIN_SAMPLE?null:cohort.stageClears?.map(({stageId,clears,slug,code,name,image})=>({stageId,clears,slug,code,name,image}))??null,
    stageCoverage:cohort.replayContributors<COMMUNITY_MIN_SAMPLE?null:cohort.stageCoverage?.map(({operator,stages})=>({operator,stages}))??null,
    source:'production-snapshot',capturedAt:value.capturedAt};
}
