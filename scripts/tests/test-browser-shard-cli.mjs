import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {coveragePlan,listedCases} from '../ci/browser-coverage.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const cli=path.join(repository,'node_modules/playwright/cli.js');
const helper=path.join(repository,'scripts/ci/browser-shards.mjs');
const site=path.join(repository,'scripts/ci/browser-site.mjs');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'browser-shard-cli-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.symlinkSync(path.join(repository,'node_modules'),root+'/node_modules','dir');
  fs.mkdirSync(root+'/tests/browser',{recursive:true});fs.mkdirSync(root+'/.cache');
  fs.writeFileSync(root+'/package-lock.json','{}');fs.writeFileSync(root+'/tests/browser/data-pin.json','{}');
  fs.writeFileSync(root+'/playwright.config.cjs','module.exports={testDir:"./tests",workers:1,projects:[{name:"desktop",testIgnore:"**/layout-census-after.spec.ts"},{name:"mobile",testIgnore:"**/layout-census-after.spec.ts"},{name:"after-census",testMatch:"**/layout-census-after.spec.ts"}]};');
  for(const [name,index] of [['alpha',1],['beta',2]])fs.writeFileSync(root+'/tests/'+name+'.spec.ts',[
    'const {test}=require("@playwright/test");const fs=require("node:fs");',
    'test("case",({},info)=>{fs.mkdirSync("test-results/layout-census-stack-align",{recursive:true});',
    'fs.writeFileSync("test-results/layout-census-stack-align/"+info.project.name+"-'+index+'.json",JSON.stringify({width:info.project.name==="desktop"?1440:390,route:"/'+name+'",seen:[]}));});',
  ].join('\n'));
  fs.writeFileSync(root+'/tests/layout-census-after.spec.ts',[
    'const {test,expect}=require("@playwright/test");const fs=require("node:fs");',
    'test("global completion",()=>{expect(fs.readdirSync(process.env.ARKPEDIA_CENSUS_STACK_DIR).length).toBe(4);});',
  ].join('\n'));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init','-q']);git(['config','user.email','ci-fixture@example.invalid']);git(['config','user.name','CI fixture']);
  git(['add','tests','package-lock.json','playwright.config.cjs']);
  git(['-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-qm','fixture']);
  const env={...process.env,GITHUB_RUN_ID:'17',CI:'1'};
  const run=(file,args=[],extra={})=>execFileSync(process.execPath,[file,...args],{cwd:root,env:{...env,...extra},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});
  const inventory=JSON.parse(run(cli,['test','--list','--reporter=json']));
  const coverage=coveragePlan({lane:'full',reason:'fixture',selected:['tests/browser/alpha.spec.ts','tests/browser/beta.spec.ts','tests/browser/layout-census-after.spec.ts'],omitted:[]},inventory);
  const plan={commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),runId:17,policySha256:'c'.repeat(64),coverage};
  fs.writeFileSync(root+'/.cache/browser-plan.json',JSON.stringify(plan));
  run(helper,['plan']);
  return {root,run,plan};
}
test('real Playwright reporters survive partition, isolated execution, census collection and completion', {timeout:60000}, t=>{
  const {root,run,plan}=fixture(t);
  const partition=JSON.parse(fs.readFileSync(root+'/.cache/browser-shards-plan.json','utf8'));
  const prefix=root+'/.cache/browser-shard-downloads/browser-result-'+partition.planSha256+'-';
  for(let index=1;index<=4;index++) {
    run(helper,['prepare',String(index),'4']);
    const annotations=run(cli,['test','--test-list','.cache/browser-shard-tests.txt','--project','desktop','--project','mobile','--reporter=json,github'],
      {PLAYWRIGHT_JSON_OUTPUT_FILE:'.cache/browser-shard-report.json'});
    assert.match(annotations,/::notice .*Playwright Run Summary/);
    run(helper,['record',String(index),'4']);
    fs.mkdirSync(root+'/.cache/browser-shard-downloads',{recursive:true});
    fs.renameSync(root+'/.cache/browser-shard-result',prefix+index);
  }
  run(helper,['merge']);
  run(cli,['test','--test-list','.cache/browser-completion-tests.txt','--project','after-census','--no-deps',
    '--output','test-results-completion','--reporter=json'],{PLAYWRIGHT_JSON_OUTPUT_FILE:'.cache/browser-completion-report.json',
      ARKPEDIA_CENSUS_STACK_DIR:'.cache/census-stack-align'});
  run(helper,['complete']);run(helper,['verify-full']);
  const merged=JSON.parse(fs.readFileSync(root+'/.cache/browser-results.json','utf8'));
  assert.equal(listedCases(merged).length,plan.coverage.selected.length);
  assert.equal(fs.readdirSync(root+'/.cache/census-stack-align').length,4);
  fs.rmSync(prefix+'4',{recursive:true});
  assert.throws(()=>run(helper,['merge']),/Command failed/);
});
test('the actual site archive excludes compiler caches and refuses changed fixture pins', {timeout:60000}, t=>{
  const {root,run}=fixture(t);
  for(const dir of ['.next/server','.next/cache','.next/standalone','data','public'])fs.mkdirSync(root+'/'+dir,{recursive:true});
  for(const file of ['.next/server/entry.js','.next/cache/not-shared','.next/standalone/not-shared','data/table.json','public/art.json','.env'])
    fs.writeFileSync(root+'/'+file,'fixture');
  fs.linkSync(root+'/.next/server/entry.js',root+'/.next/server/copy.js');
  fs.writeFileSync(root+'/.cache/native-media-delivery.json','{}');
  run(site,['pack']);
  const listing=execFileSync('tar',['-tzf','.cache/browser-site.tgz'],{cwd:root,encoding:'utf8'});
  assert.match(listing,/data\/table.json/);assert.ok(!/not-shared|\.env/.test(listing));
  fs.rmSync(root+'/public',{recursive:true});run(site,['restore']);
  assert.equal(fs.readFileSync(root+'/public/art.json','utf8'),'fixture');
  fs.writeFileSync(root+'/tests/browser/data-pin.json','{"changed":true}');
  assert.throws(()=>run(site,['restore']),/Command failed/);
});
