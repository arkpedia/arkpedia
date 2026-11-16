import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import yaml from 'js-yaml';

const workflow=name=>yaml.load(fs.readFileSync('.github/workflows/'+name+'.yml','utf8'));
const jobs=workflow('check').jobs,guard=jobs.check.steps.find(s=>s.name==='Require parallel checks');
test('approval requires all parallel checks, including failures and skipped browser matrices',()=>{
  const good={VALIDATION:'success',CONTENT:'success',WORKER:'success',BUILD:'success',BROWSERS:'success',LANE:'targeted'};
  const run=env=>spawnSync('bash',['--noprofile','--norc','-eo','pipefail','-c',guard.run],{env:{...process.env,...env},encoding:'utf8',timeout:5000}).status;
  assert.equal(run(good),0);
  for(const key of ['VALIDATION','CONTENT','WORKER','BUILD','BROWSERS'])for(const status of ['failure','cancelled','skipped',''])
    assert.notEqual(run({...good,[key]:status}),0,key+' '+status);
  assert.equal(run({...good,LANE:'none',BROWSERS:'skipped'}),0);
  assert.notEqual(run({...good,LANE:'none'}),0);
});
test('build and validation jobs overlap; only the coordinator waits for every verdict',()=>{
  for(const name of ['validation','production-build','browser-build','content-check'])assert.equal(jobs[name].needs,'seen',name);
  assert.equal(jobs['browser-tests'].needs,'browser-build');
  assert.deepEqual(jobs.check.needs,['seen','validation','production-build','content-check','browser-build','browser-tests']);
  assert.equal(jobs['browser-tests'].strategy['fail-fast'],false,'one shard failure must not cancel evidence from others');
  assert.match(jobs['browser-tests'].strategy.matrix,/needs.browser-build.outputs.matrix/);
  assert.equal(jobs['browser-tests'].name,'browser ('+'$'+'{{ matrix.index }}/'+'$'+'{{ matrix.total }})');
});
test('full census completion consumes merged records and cannot rerun or erase the browser shards',()=>{
  const completion=jobs.check.steps.find(s=>s.name==='Full-census completion contract');
  assert.match(completion.run,/--project after-census --no-deps --output test-results-completion/);
  assert.equal(completion.env.ARKPEDIA_BROWSER_COMPLETION_ONLY,'1');
  assert.equal(completion.env.ARKPEDIA_CENSUS_STACK_DIR,'.cache/census-stack-align');
  assert.match(completion.run,/browser-shards.mjs complete/);
  const order=jobs.check.steps.map(s=>s.name);
  assert.ok(order.indexOf('Merge browser shard evidence')<order.indexOf('Full-census completion contract'));
  assert.ok(order.indexOf('Full-census completion contract')<order.indexOf('Validate browser execution evidence'));
});
test('nightly audit uses pinned Check inputs and never uploads deployment approval artifacts',()=>{
  const audit=workflow('browser-audit').jobs;
  const build=audit['browser-build'].steps;
  assert.match(build.find(s=>s.name==='Pull the pinned game records for the browser specs').run,/--pinned/);
  assert.equal(build.find(s=>s.name==='Build').env.ARKPEDIA_YOUTUBE_FEED_FIXTURE,'tests/fixtures/youtube-feeds.xml');
  assert.equal(audit['browser-tests'].name,jobs['browser-tests'].name);
  assert.ok(audit.audit.steps.some(s=>s.name==='Validate full browser shard execution'));
  for(const job of Object.values(audit))for(const step of job.steps??[])
    assert.ok(!String(step.with?.name??'').startsWith('checked-'),'an audit cannot approve deployment');
});

test('the isolated content job creates its own live runtime fixture before using pinned browser records',()=>{
  const steps=jobs['content-check'].steps;
  const index=name=>steps.findIndex(s=>s.name===name);
  assert.match(steps[index('Prepare runtime content fixture')].run,/content:export -- --check && npm run content:validate/);
  assert.ok(index('Pull the live game records for runtime fixtures')<index('Prepare runtime content fixture'));
  assert.ok(index('Prepare runtime content fixture')<index('Pull the pinned game records for the browser specs'));
  assert.ok(index('Prepare runtime content fixture')<index('Content updates and rollback without rebuilding'));
});

test('browser failures are readable in GitHub annotations as well as exact JSON evidence',()=>{
  for(const workflowName of ['check','browser-audit'])for(const job of Object.values(workflow(workflowName).jobs))
    for(const step of job.steps??[])if(step.env?.PLAYWRIGHT_JSON_OUTPUT_FILE)
      assert.match(step.run,/--reporter=list,json,github/);
});
