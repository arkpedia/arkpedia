import { operatorHref } from '@/lib/operators/operatorHref';
import type { CommunityRankings } from '@/lib/community/rankings';

export interface StatisticsOperator { name:string; charIds:string[]; rarity:number; className:string; icon:string; skills:number; skillIcons?:(string|null)[]; art?:string|null }
export interface RankingEntity {name:string;icon:string|null;art?:string|null;href:string;subtitle:string;skillIcon?:string|null}
export interface RankingRow { entity:RankingEntity; operator?:StatisticsOperator; key:string; suffix:string; value:number; count:number; detail:string; rank:number }
export const statisticsMetrics = [
  {value:'e2',label:'Elite 2 promotion',unit:'E2 owners',description:'Operators promoted to Elite 2.',relativeUnit:'E2 rate',relativeDescription:'Share of owners recorded with this operator at Elite 2.',battle:false},
  {value:'m3',label:'Skill mastery',unit:'M3 owners',description:'Individual skills trained to Mastery 3, for operators of 4★ and higher.',relativeUnit:'M3 rate',relativeDescription:'Share of this operator’s owners recorded with each skill at Mastery 3. Only operators of 4★ and higher are included.',battle:false},
  {value:'m9',label:'M9 mastery',unit:'M9 owners',description:'All three skills at Mastery 3. Operators with fewer skills are excluded.',relativeUnit:'M9 rate',relativeDescription:'Share of owners recorded with all three skills at Mastery 3. Operators with fewer skills are excluded.',battle:false},
  {value:'owned',label:'6★ ownership',unit:'Owners',description:'Six-star operators owned by contributing game accounts.',relativeUnit:'Ownership rate',relativeDescription:'Share of contributing game accounts that own this six-star operator.',battle:false},
  {value:'unraised',label:'E0 level 1',unit:'E0 Lv1 owners',description:'Owned operators left at E0 level 1. Unknown builds are excluded.',relativeUnit:'E0 Lv1 rate',relativeDescription:'Share of known builds left at E0 level 1. Unknown builds are excluded.',battle:false},
  {value:'maxed',label:'E2 level 90',unit:'E2 Lv90 owners',description:'Six-star operators raised to E2 level 90.',relativeUnit:'E2 Lv90 rate',relativeDescription:'Share of owners recorded with this six-star operator at E2 level 90.',battle:false},
  {value:'deployed',label:'Stage deployment',unit:'Runs deployed',description:'Saved auto-deploy runs in which the operator was deployed, counted once per game account and stage.',relativeUnit:'Deployment rate',relativeDescription:'Share of this operator’s squad appearances in which they were deployed. Each saved auto-deploy game-account/stage run counts once.',battle:true},
  {value:'squads',label:'Squad presence',unit:'Squad picks',description:'Saved auto-deploy runs in which the operator was in the squad, whether deployed or not.',relativeUnit:'Squad share',relativeDescription:'Share of all saved auto-deploy runs in this sample featuring this operator in the squad.',battle:true},
  {value:'benched',label:'Bench presence',unit:'Bench count',description:'Saved auto-deploy squad appearances without a deployment, including squad talents and trust farming.',relativeUnit:'Bench rate',relativeDescription:'Share of this operator’s squad appearances without a deployment, including squad talents and trust farming.',battle:true},
  {value:'stage-coverage',label:'Stage coverage',unit:'Distinct stages',description:'Distinct cleared stages in uploaded auto-deploy data with a recorded deployment of this operator. The same stage counts once across contributors; historical farming teams cannot be inferred.',relativeUnit:'Stage coverage',relativeDescription:'Share of distinct cleared stages in uploaded auto-deploy data with a recorded deployment of this operator. Historical farming teams cannot be inferred.',battle:true},
  {value:'clears',label:'Stage clears',unit:'Recorded clears',description:'Lifetime clear counters from uploaded auto-deploy records, summed across contributing game accounts. Clears from stages that cannot save auto-deploys are excluded. Duplicate uploads of the same game account use the largest counter.',relativeUnit:'Clear share',relativeDescription:'Share of all recorded clears in uploaded auto-deploy data attributed to this stage. Clears from stages that cannot save auto-deploys are excluded. These counters do not identify the squads used for historical clears.',battle:true},
  {value:'activations',label:'Skill activation',unit:'Activations',description:'Manual skill activations recorded in uploaded auto-deploys. Automatic and passive triggers are excluded.',relativeUnit:'Activation share',relativeDescription:'Share of manual skill activations recorded in uploaded auto-deploys across this sample. Automatic and passive triggers are excluded.',battle:true},
];
export type StatisticsMetric = typeof statisticsMetrics[number] & {relative?:boolean};
export const displayStatisticsMetric=(metric:StatisticsMetric,relative:boolean):StatisticsMetric=>({...metric,relative,unit:relative?metric.relativeUnit:metric.unit,description:relative?metric.relativeDescription:metric.description});
export const formatRankingValue=(value:number,metric:StatisticsMetric)=>metric.relative?`${(value*100).toFixed(1)}%`:value.toLocaleString('en-US');
const number=(value:number)=>value.toLocaleString('en-US');

export function statisticsRankings(operators:StatisticsOperator[],data:CommunityRankings|null,filters:{class:string;rarity:string;relative?:boolean;order?:string}):Map<string,RankingRow[]> {
  if(!data)return new Map();
  const roster=new Map(data.roster?.map(r=>[r.operator,r]));
  const replays=new Map<string,{squads:number;deployed:number;benched:number;activations:number;skills:Map<number,number>}>();
  for(const r of data.battles??[]){
    const prev=replays.get(r.charId)??{squads:0,deployed:0,benched:0,activations:0,skills:new Map<number,number>()};
    for(const k of ['squads','deployed','benched','activations'] as const)prev[k]+=r[k];
    if(r.skill!==null)prev.skills.set(r.skill,(prev.skills.get(r.skill)??0)+r.activations);
    replays.set(r.charId,prev);
  }
  const complete=operators.map(op=>({op,r:roster.get(op.name),b:op.charIds.reduce((p,id)=>{
    const v=replays.get(id);if(v){for(const k of ['squads','deployed','benched','activations'] as const)p[k]+=v[k];for(const [skill,count] of v.skills)p.skills.set(skill,(p.skills.get(skill)??0)+count);}return p;
  },{squads:0,deployed:0,benched:0,activations:0,skills:new Map<number,number>()})}));
  // The comparison sample stays fixed when class/rarity filters narrow the displayed operators.
  const activationTotal=complete.reduce((sum,{op,b})=>sum+(b.squads?[0,1,2].filter(skill=>skill<op.skills).reduce((n,skill)=>n+(b.skills.get(skill)??0),0):0),0);
  const eligible=complete.filter(({op})=>(!filters.class||op.className===filters.class)&&(!filters.rarity||op.rarity===Number(filters.rarity)));
  const coverage=new Map(data.stageCoverage?.map(row=>[row.operator,row.stages]));
  const sort=(rows:Omit<RankingRow,'rank'>[])=>{
    rows.sort((a,b)=>(filters.order==='asc'?a.value-b.value:b.value-a.value)||a.entity.name.localeCompare(b.entity.name)||a.key.localeCompare(b.key));
    let rank=1;return rows.map((row,i)=>{if(i===0||row.value!==rows[i-1].value)rank=i+1;return {...row,rank};});
  };
  return new Map(statisticsMetrics.map(metric=>{
    if(metric.value==='clears'){
      const total=(data.stageClears??[]).reduce((sum,row)=>sum+row.clears,0);
      return [metric.value,sort((data.stageClears??[]).flatMap(stage=>filters.relative&&!total?[]:[{entity:{name:stage.code,icon:stage.image?`/stages-images/${encodeURIComponent(stage.image)}`:null,href:`/stages/browse?s=${encodeURIComponent(stage.slug)}`,subtitle:''},key:stage.stageId,suffix:stage.name,count:stage.clears,value:filters.relative?stage.clears/total:stage.clears,detail:filters.relative?`${number(stage.clears)} / ${number(total)} recorded clears`:''}]))];
    }
    const rows=eligible.flatMap(({op,r,b}):Omit<RankingRow,'rank'>[]=>{
      if(['e2','unraised','maxed'].includes(metric.value)&&op.name!=='Amiya'&&op.charIds.some(id=>['char_1001_amiya2','char_1037_amiya3'].includes(id)))return [];
      if(metric.value==='owned'&&op.rarity!==6)return [];
      if(metric.value==='m9'&&op.skills!==3||metric.value==='e2'&&op.rarity<4||metric.value==='maxed'&&op.rarity!==6)return [];
      const make=(count:number,denominator:number,label:string,suffix='',detail='',skill?:number):Omit<RankingRow,'rank'>[]=>{
        if(filters.relative&&denominator<=0)return [];
        return [{operator:op,entity:{name:op.name,icon:op.icon,art:op.art,href:operatorHref(op.name,'community'),subtitle:`${op.className} · ${op.rarity}★`,...(skill===undefined?{}:{skillIcon:op.skillIcons?.[skill]??null})},key:suffix?`${op.name}:${suffix}`:op.name,suffix,count,value:filters.relative?count/denominator:count,detail:filters.relative?`${number(count)} / ${number(denominator)} ${label}`:detail}];
      };
      if(metric.value==='stage-coverage')return data.stageCoverage!=null&&b.squads?make(coverage.get(op.name)??0,data.clearedStages??0,'distinct cleared stages'):[];
      if(metric.battle){
        if(!b.squads)return [];
        if(metric.value==='activations')return [0,1,2].filter(skill=>skill<op.skills).flatMap(skill=>make(b.skills.get(skill)??0,activationTotal,'recorded activations',`Skill ${skill+1}`,'',skill));
        return make(b[metric.value as 'squads'|'deployed'|'benched'],metric.value==='squads'?data.replays:b.squads,metric.value==='squads'?'saved runs':'squad appearances','',`${number(b.squads)} squad appearances`);
      }
      if(!r)return [];
      if(metric.value==='m3'){
        const counts=r.m3;
        if(op.rarity<4||!counts)return [];
        return counts.slice(0,Math.min(3,op.skills)).flatMap((count,skill)=>count==null?[]:make(count,r.owned,'owners',`Skill ${skill+1}`,`${number(r.owned)} owners`,skill));
      }
      const denominator=metric.value==='owned'?data.contributors:metric.value==='unraised'?r.builds:r.owned;
      const label=metric.value==='owned'?'contributors':metric.value==='unraised'?'known builds':'owners';
      return make(r[metric.value as 'e2'|'m9'|'owned'|'unraised'|'maxed'],denominator,label,'',`${number(r.owned)} owners`);
    });
    return [metric.value,sort(rows)];
  }));
}
