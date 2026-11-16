import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {shardPlan,validateShard,mergeShardReports,appendCompletion} from '../ci/browser-shards.mjs';
import {validateSiteManifest,safeArchiveEntry} from '../ci/browser-site.mjs';
import {listedCases} from '../ci/browser-coverage.mjs';
import {parallelValidationPassed,browserShardsPassed,fullBrowserBaseline} from '../ci/full-browser-baseline.mjs';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const entry=(project,file,title)=>({project,file,titlePath:[title],line:'['+project+'] › '+file+' › '+title});
function plan(lane='full'){
  const selected=[];
  for(const project of ['desktop','mobile'])for(const file of ['account.spec.ts','story.spec.ts','layout-census.spec.ts'])
    for(let i=0;i<4;i++)selected.push(entry(project,file,file+' case '+i));
  if(lane==='full')selected.push(entry('after-census','layout-census-after.spec.ts','global completion'));
  return {commit:'a'.repeat(40),tree:'b'.repeat(40),runId:17,policySha256:'c'.repeat(64),
    coverage:{policy:'shadow-coverage-v1',lane,reusableCheckProof:false,selected,omitted:[],inventorySha256:'d'.repeat(64)}};
}
const report=cases=>({errors:[],suites:cases.map(c=>({title:c.file,column:0,specs:[{title:c.titlePath[0],file:c.file,
  tests:[{projectName:c.project,expectedStatus:'passed',status:'expected',results:[{status:'passed',duration:1,errors:[]}]}]}]}))});
function results(p,partition){
  return partition.shards.map(s=>{
    const data=report(s.cases);
    return {report:data,record:{schema:1,index:s.index,total:s.total,commit:p.commit,tree:p.tree,runId:p.runId,
      policySha256:p.policySha256,planSha256:sha(p),reportSha256:sha(data),census:{}}};
  });
}
test('four full runners preserve serial files, distribute parallel census cases and reserve the global guard',()=>{
  const p=plan(),partition=shardPlan(p);
  assert.equal(partition.shards.length,4);assert.equal(partition.completion.length,1);
  for(const project of ['desktop','mobile'])for(const file of ['account.spec.ts','story.spec.ts'])
    assert.equal(partition.shards.filter(s=>s.cases.some(c=>c.project===project&&c.file===file)).length,1);
  assert.ok(partition.shards.every(s=>s.cases.some(c=>c.file==='layout-census.spec.ts')));
  assert.ok(partition.shards.every(s=>s.cases.every(c=>c.project!=='after-census')));
  assert.deepEqual(shardPlan({...p,coverage:{...p.coverage,selected:[...p.coverage.selected].reverse()}}).shards,partition.shards);
  assert.equal(shardPlan(plan('targeted')).shards.length,1);
  assert.throws(()=>shardPlan({...p,coverage:{...p.coverage,selected:[...p.coverage.selected,p.coverage.selected[0]]}}),/Duplicate/);
});
test('all shard identities merge exactly once before the full-census completion contract',()=>{
  const p=plan(),partition=shardPlan(p),parts=results(p,partition);
  const merged=mergeShardReports(p,partition,parts);
  assert.equal(listedCases(merged).length,p.coverage.selected.length-1);
  const complete=appendCompletion(p,partition,merged,report(partition.completion));
  assert.deepEqual(listedCases(complete).map(c=>c.line),p.coverage.selected.map(c=>c.line).sort((a,b)=>a.localeCompare(b,'en')));
  assert.throws(()=>mergeShardReports(p,partition,parts.slice(1)),/Missing/);
  assert.throws(()=>mergeShardReports(p,partition,[parts[0],parts[0],...parts.slice(2)]),/Repeated/);
  const skipped=report(partition.completion);Object.assign(skipped.suites[0].specs[0].tests[0],
    {expectedStatus:'skipped',status:'skipped',results:[{status:'skipped',duration:0,errors:[]}]});
  assert.throws(()=>appendCompletion(p,partition,merged,skipped),/did not pass/);
});
test('reports from another source, run or partition and unexecuted cases fail closed',()=>{
  const p=plan(),partition=shardPlan(p),part=results(p,partition)[0];
  for(const [key,value] of [['commit','e'.repeat(40)],['tree','e'.repeat(40)],['runId',18],
    ['policySha256','e'.repeat(64)],['planSha256','e'.repeat(64)],['reportSha256','e'.repeat(64)],['total',3]])
    assert.throws(()=>validateShard({...part.record,[key]:value},part.report,p,partition),undefined,key);
  const incomplete=structuredClone(part.report);incomplete.suites[0].specs[0].tests[0].results=[];
  assert.throws(()=>validateShard({...part.record,reportSha256:sha(incomplete)},incomplete,p,partition),/Missing execution/);
  const extra=report([...partition.shards[0].cases,entry('desktop','other.spec.ts','unselected')]);
  assert.throws(()=>validateShard({...part.record,reportSha256:sha(extra)},extra,p,partition),/identities differ/);
});
test('site artifacts bind source, run, dependencies and fixture pins; archive paths stay within public build inputs',()=>{
  const identity={commit:'a'.repeat(40),tree:'b'.repeat(40),runId:2,lockSha256:'c'.repeat(64),pinSha256:'d'.repeat(64)};
  const checksum='e'.repeat(64),manifest={schema:1,...identity,archiveSha256:checksum};
  validateSiteManifest(manifest,identity,checksum);
  for(const key of Object.keys(identity))assert.throws(()=>validateSiteManifest({...manifest,[key]:'wrong'},identity,checksum));
  assert.throws(()=>validateSiteManifest(manifest,identity,'f'.repeat(64)),/checksum/);
  for(const file of ['.next/server/pages/index.js','data/records.json','public/build-info.json','.cache/browser-plan.json'])
    assert.equal(safeArchiveEntry(file),true,file);
  for(const file of ['/etc/passwd','../.env','.next/../../.env','.env','node_modules/a.js','.next/cache/private','.next/standalone/a','public\\a'])
    assert.equal(safeArchiveEntry(file),false,file);
});
const step=name=>({name,status:'completed',conclusion:'success'});
const job=(name,names,id=1)=>({name,id,run_id:17,status:'completed',conclusion:'success',steps:names.map(step)});
const build=()=>job('browser-build',['Build','Which browser regressions this change needs','Package checked browser site']);
const quality=()=>[
  build(),job('validation',['Application and Python regression tests','Typecheck','Lint','Compile and validate runtime content']),
  job('content-check',['Pages render the live content release','Content updates and rollback without rebuilding']),
  job('production-build',['Compile and check the production Worker']),
];
const shards=(total=4)=>Array.from({length:total},(_,i)=>job('browser ('+(i+1)+'/'+total+')',
  ['Desktop and mobile browser regressions','Record browser shard','Share browser shard evidence'],i+10));
test('a green merge coordinator cannot stand in for missing quality checks or unexecuted matrix jobs',()=>{
  assert.equal(parallelValidationPassed(quality(),17),true);
  for(const missing of quality())assert.equal(parallelValidationPassed(quality().filter(j=>j.name!==missing.name),17),false,missing.name);
  assert.equal(browserShardsPassed(shards(),17,4,'full'),true);
  assert.equal(browserShardsPassed(shards().slice(1),17,4,'full'),false);
  const noExecution=shards();noExecution[0].steps.shift();
  assert.equal(browserShardsPassed(noExecution,17,4,'full'),false);
  const run={id:17,status:'completed',conclusion:'success',path:'.github/workflows/check.yml',event:'push',
    head_sha:'a'.repeat(40),head_branch:'main',repository:{full_name:'arkpedia/arkpedia'},head_repository:{full_name:'arkpedia/arkpedia'}};
  const coordinator=job('check',['Validate full browser shard execution','Full-census completion contract',
    'Validate browser execution evidence','Require parallel checks']);
  const args={run,jobs:[...quality(),...shards(),coordinator],repository:'arkpedia/arkpedia',baseRef:'main',commit:'a'.repeat(40),tree:'b'.repeat(40)};
  assert.equal(fullBrowserBaseline(args)?.coverage,'full');
  assert.equal(fullBrowserBaseline({...args,jobs:args.jobs.filter(j=>j.name!=='validation')}),null);
  assert.equal(fullBrowserBaseline({...args,jobs:args.jobs.filter(j=>j.name!=='browser (4/4)')}),null);
});
