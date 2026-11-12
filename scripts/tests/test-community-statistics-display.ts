import assert from 'node:assert/strict';
import test from 'node:test';
import { statisticsRankings,displayStatisticsMetric,statisticsMetrics,formatRankingValue,type StatisticsOperator } from '../../components/community/statisticsModel';
import type { CommunityRankings } from '../../lib/community/rankings';

const operators:StatisticsOperator[]=[
  {name:'A',charIds:['a'],rarity:6,className:'Guard',icon:'',skills:3},
  {name:'B',charIds:['b'],rarity:6,className:'Medic',icon:'',skills:3},
  {name:'C',charIds:['c'],rarity:4,className:'Guard',icon:'',skills:2},
];
const sample=():CommunityRankings=>({contributors:20,replayContributors:12,replays:20,
  roster:[{operator:'A',owned:10,builds:10,e2:5,m9:2,unraised:2,maxed:1},{operator:'B',owned:4,builds:4,e2:3,m9:1,unraised:1,maxed:1},{operator:'C',owned:2,builds:2,e2:1,m9:0,unraised:0,maxed:0}],
  battles:[{charId:'a',skill:0,squads:10,deployed:6,benched:4,deployments:8,activations:12},{charId:'b',skill:0,squads:2,deployed:2,benched:0,deployments:3,activations:2},{charId:'c',skill:0,squads:3,deployed:0,benched:3,deployments:0,activations:1},
    {charId:'unknown',skill:0,squads:5,deployed:5,benched:0,deployments:5,activations:1000},{charId:'a',skill:null,squads:0,deployed:0,benched:0,deployments:0,activations:400}],
});
const rankings=(relative=false,extra={})=>statisticsRankings(operators,sample(),{class:'',rarity:'',relative,...extra});

test('relative upgrades rank by owners while retaining absolute counts and exact ties',()=>{
  assert.deepEqual(rankings().get('e2')!.map(r=>[r.entity.name,r.value]),[['A',5],['B',3],['C',1]]);
  const rows=rankings(true).get('e2')!;
  assert.deepEqual(rows.map(r=>[r.entity.name,r.value,r.count,r.rank]),[['B',.75,3,1],['A',.5,5,2],['C',.5,1,2]]);
  assert.equal(rows.reduce((n,r)=>n+r.count,0),9);
  assert.equal(rows[0].detail,'3 / 4 owners');
});

test('relative deployment and benching normalize by squad appearances and can reorder the leaders',()=>{
  assert.equal(rankings().get('deployed')![0].entity.name,'A');
  assert.equal(rankings(true).get('deployed')![0].entity.name,'B');
  assert.equal(rankings(true).get('deployed')![0].value,1);
  assert.equal(rankings().get('benched')![0].entity.name,'A');
  const benched=rankings(true).get('benched')!;
  assert.deepEqual(benched.map(r=>[r.entity.name,r.value]),[['C',1],['A',.4],['B',0]]);
  assert.equal(benched[0].detail,'3 / 3 squad appearances');
});

test('ownership, squad and activation shares keep the full cohort denominator under display filters',()=>{
  const filtered=rankings(true,{class:'Medic'});
  assert.equal(filtered.get('owned')![0].value,4/20);
  assert.equal(filtered.get('squads')![0].value,2/20);
  assert.equal(filtered.get('activations')![0].value,2/15);
  assert.equal(filtered.get('activations')![0].detail,'2 / 15 recorded activations');
});

test('relative rankings omit unknown denominators and stay finite with no sample or activations',()=>{
  const data=sample();data.roster![2].builds=0;
  assert.equal(statisticsRankings(operators,data,{class:'',rarity:'',relative:true}).get('unraised')!.some(r=>r.entity.name==='C'),false);
  data.contributors=0;data.replays=0;data.battles=data.battles!.map(r=>({...r,activations:0}));
  const rows=statisticsRankings(operators,data,{class:'',rarity:'',relative:true});
  for(const metric of ['owned','squads','activations'])assert.equal(rows.get(metric)!.length,0);
  assert.equal([...rows.values()].flat().every(r=>Number.isFinite(r.value)),true);
});

test('metric labels and formats describe the selected absolute or relative values',()=>{
  const metric=statisticsMetrics.find(m=>m.value==='benched')!;
  assert.equal(formatRankingValue(12,displayStatisticsMetric(metric,false)),'12');
  const relative=displayStatisticsMetric(metric,true);
  assert.equal(relative.label,'Bench presence');assert.equal(relative.unit,'Bench rate');
  assert.equal(formatRankingValue(1/3,relative),'33.3%');
});


test('ascending order reverses values, retains alphabetical ties, and leaves denominators fixed',()=>{
  const rows=rankings(true,{order:'asc'}).get('e2')!;
  assert.deepEqual(rows.map(row=>[row.entity.name,row.value,row.rank]),[['A',.5,1],['C',.5,1],['B',.75,3]]);
});

test('stage clears and operator coverage have separate meaningful percentage denominators',()=>{
  const data=sample();data.clearedStages=10;data.stageCoverage=[{operator:'A',stages:6},{operator:'B',stages:2}];
  data.stageClears=[{stageId:'one',slug:'1-7',code:'1-7',name:'The Tyrant',image:null,clears:90},{stageId:'two',slug:'0-1',code:'0-1',name:'Collapse',image:null,clears:10}];
  const rows=statisticsRankings(operators,data,{class:'Medic',rarity:'',relative:true,order:'asc'});
  assert.equal(rows.get('stage-coverage')![0].value,.2);
  assert.deepEqual(rows.get('clears')!.map(row=>[row.entity.name,row.value]),[['0-1',.1],['1-7',.9]]);
  assert.equal(rows.get('clears')![0].entity.href,'/stages/browse?s=0-1');
  data.stageClears=data.stageClears.map(row=>({...row,clears:0}));
  assert.equal(statisticsRankings(operators,data,{class:'',rarity:'',relative:true}).get('clears')!.length,0);
});


test('individual M3 skills exclude low rarities and nonexistent skills, including in ascending order',()=>{
  const data=sample();data.roster![0].m3=[1,0,4];data.roster![1].m3=[2,1,0];data.roster![2].m3=[0,1,999];
  data.roster!.push({operator:'Low rarity',owned:20,builds:20,e2:0,m9:0,m3:[999,999,999],unraised:0,maxed:0});
  const catalogue=[...operators,{name:'Low rarity',charIds:['low'],rarity:3,className:'Guard',icon:'',skills:1}];
  const rows=statisticsRankings(catalogue,data,{class:'',rarity:''}).get('m3')!;
  assert.equal(rows.length,8);assert.equal(rows[0].entity.name,'A');assert.equal(rows[0].suffix,'Skill 3');assert.equal(rows[0].value,4);
  assert.equal(rows.some(row=>row.operator!.rarity<4||row.entity.name==='C'&&row.suffix==='Skill 3'),false);
  const asc=statisticsRankings(catalogue,data,{class:'',rarity:'',order:'asc'}).get('m3')!;
  assert.equal(asc[0].value,0);assert.equal(asc.at(-1)!.value,4);
  const relative=statisticsRankings(catalogue,data,{class:'Medic',rarity:'',relative:true}).get('m3')!;
  assert.equal(relative[0].value,.5);assert.equal(relative[0].detail,'2 / 4 owners');
  assert.equal(statisticsRankings(catalogue,data,{class:'',rarity:'3'}).get('m3')!.length,0);
  data.roster![0].m3=undefined;
  assert.equal(statisticsRankings(catalogue,data,{class:'',rarity:''}).get('m3')!.some(row=>row.entity.name==='A'),false,'missing aggregate data is not a recorded zero');
});

test('roster counts use regular Amiya, skill forms stay distinct, and ownership is six-star only',()=>{
  const data=sample();const catalogue=[...operators,{name:'Amiya',charIds:['char_002_amiya'],rarity:5,className:'Caster',icon:'',skills:3,skillIcons:['/s1','/s2','/s3']},{name:'Amiya (Guard)',charIds:['char_1001_amiya2'],rarity:5,className:'Guard',icon:'',skills:2,skillIcons:['/g1','/g2']},{name:'Amiya (Medic)',charIds:['char_1037_amiya3'],rarity:5,className:'Medic',icon:'',skills:2}];
  for(const op of catalogue.slice(3))data.roster!.push({operator:op.name,owned:20,builds:20,e2:20,m9:0,m3:[1,2,3],unraised:0,maxed:0});
  const rows=statisticsRankings(catalogue,data,{class:'',rarity:''});
  for(const metric of ['e2','unraised'])assert.deepEqual(rows.get(metric)!.filter(r=>r.entity.name.startsWith('Amiya')).map(r=>r.entity.name),['Amiya']);
  assert.deepEqual(rows.get('owned')!.map(row=>row.entity.name),['A','B']);
  const skills=rows.get('m3')!.filter(row=>row.entity.name.startsWith('Amiya'));assert.equal(skills.length,7);assert.equal(skills.find(row=>row.entity.name==='Amiya (Guard)'&&row.suffix==='Skill 2')!.entity.skillIcon,'/g2');
});
