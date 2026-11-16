// Split execution, never coverage: every selected identity must return exactly once.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {executionEvidence, listedCases} from './browser-coverage.mjs';

const AFTER = 'after-census', ROOT = '.cache/browser-shard-result';
const digest = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {fs.mkdirSync(path.dirname(file), {recursive:true});fs.writeFileSync(file, JSON.stringify(value));};
const requireValue = (value, message) => {if (!value) throw Error(message);};

export function shardPlan(plan, count = 4) {
  requireValue(['full','targeted','none'].includes(plan?.coverage?.lane), 'Missing browser coverage plan');
  requireValue(Number.isInteger(count) && count >= 1 && count <= 4, 'Invalid shard count');
  const total = plan.coverage.lane === 'full' ? count : 1;
  const groups = new Map(), completion = [];
  for (const item of plan.coverage.selected) {
    if (item.project === AFTER) {completion.push(item);continue;}
    // Preserve file/project ordering and serial suites. The census explicitly declares parallel mode.
    const key = item.file === 'layout-census.spec.ts' ? item.line : item.project + ':' + item.file;
    const group = groups.get(key) ?? [];group.push(item);groups.set(key, group);
  }
  const shards = Array.from({length:total}, (_, i) => ({index:i+1,total,cases:[]}));
  for (const [key, group] of [...groups].sort((a,b) => b[1].length-a[1].length || a[0].localeCompare(b[0],'en'))) {
    const target = [...shards].sort((a,b) => a.cases.length-b.cases.length || a.index-b.index)[0];
    target.cases.push(...group);
  }
  for (const shard of shards) shard.cases.sort((a,b) => a.line.localeCompare(b.line,'en'));
  const all = [...shards.flatMap(s => s.cases),...completion].map(c => c.line);
  requireValue(new Set(all).size === all.length && all.length === plan.coverage.selected.length, 'Duplicate selected browser identities');
  requireValue(plan.coverage.lane !== 'full' || completion.length === 1, 'Full coverage needs one completion contract');
  return {schema:1,commit:plan.commit,tree:plan.tree,runId:plan.runId,policySha256:plan.policySha256,
    planSha256:digest(JSON.stringify(plan)),shards,completion};
}

export function validateShard(record, report, plan, partition) {
  const expected = partition.shards.find(s => s.index === record?.index);
  requireValue(expected && record.schema === 1 && record.total === expected.total, 'Unknown browser shard');
  for (const key of ['commit','tree','runId','policySha256','planSha256'])
    requireValue(record[key] === partition[key], 'Shard identity differs: ' + key);
  requireValue(partition.planSha256 === digest(JSON.stringify(plan)), 'Browser plan changed');
  requireValue(record.reportSha256 === digest(JSON.stringify(report)), 'Shard reporter checksum differs');
  executionEvidence({...plan.coverage,selected:expected.cases},report);
  return expected;
}

export function mergeShardReports(plan, partition, results) {
  requireValue(results.length === partition.shards.length, 'Missing browser shard results');
  const seen = new Set();
  for (const {record,report} of results) {
    validateShard(record,report,plan,partition);
    requireValue(!seen.has(record.index), 'Repeated browser shard');
    seen.add(record.index);
  }
  return {suites:results.flatMap(r => r.report.suites),errors:results.flatMap(r => r.report.errors)};
}

export function appendCompletion(plan, partition, report, completion) {
  const actual = listedCases(completion,true);
  requireValue(actual.length === partition.completion.length, 'Completion reporter differs');
  executionEvidence({...plan.coverage,selected:partition.completion},completion);
  // A full census must run its global guard, never silently skip after losing shard records.
  requireValue(actual.every(item => item.execution.results[0].status === 'passed'), 'Full-census completion guard did not pass');
  const merged = {suites:[...report.suites,...completion.suites],errors:[...report.errors,...completion.errors]};
  executionEvidence(plan.coverage,merged);
  return merged;
}

function current(plan) {
  const git = args => execFileSync('git',args,{encoding:'utf8'}).trim();
  requireValue(git(['rev-parse','HEAD']) === plan.commit && git(['rev-parse','HEAD^{tree}']) === plan.tree, 'Browser source changed');
  requireValue(Number(process.env.GITHUB_RUN_ID) === plan.runId, 'Browser run changed');
}

function main() {
  const [command,indexText,totalText] = process.argv.slice(2);
  const plan = json('.cache/browser-plan.json');current(plan);
  if (command === 'plan') {
    const partition = shardPlan(plan);write('.cache/browser-shards-plan.json',partition);
    const matrix = {include:partition.shards.map(({index,total}) => ({index,total}))};
    console.log('matrix=' + JSON.stringify(matrix));console.log('partition='+partition.planSha256);return;
  }
  const partition = json('.cache/browser-shards-plan.json');
  requireValue(partition.planSha256 === digest(JSON.stringify(plan)), 'Browser partition belongs to another plan');
  if (command === 'verify-full' || command === 'verify-targeted') {
    const lane = command === 'verify-full' ? 'full' : 'targeted';
    requireValue(plan.coverage.lane === lane && partition.shards.length === (lane === 'full' ? 4 : 1), 'Browser execution lane differs');
    const report = json('.cache/browser-results.json');
    executionEvidence(plan.coverage,report);
    if (lane === 'full') requireValue(listedCases(report,true).filter(c => c.project === AFTER)
      .every(c => c.execution.results[0].status === 'passed'), 'Completion guard was skipped');
    console.log('Verified '+lane+' execution across '+partition.shards.length+' browser runners');return;
  }
  if (command === 'prepare' || command === 'record') {
    const index = Number(indexText),total = Number(totalText),shard = partition.shards.find(s => s.index === index && s.total === total);
    requireValue(shard && shard.cases.length, 'Missing executable shard');
    if (command === 'prepare') {
      fs.writeFileSync('.cache/browser-shard-tests.txt',shard.cases.map(c => c.line).join('\n')+'\n');return;
    }
    const report = json('.cache/browser-shard-report.json');
    const record = {schema:1,index,total,...Object.fromEntries(['commit','tree','runId','policySha256','planSha256'].map(k => [k,partition[k]])),
      reportSha256:digest(JSON.stringify(report)),census:{}};
    const census = 'test-results/layout-census-stack-align';
    if (fs.existsSync(census)) for (const name of fs.readdirSync(census)) {
      requireValue(/^(desktop|mobile)-\d+\.json$/.test(name), 'Unexpected census record');
      const raw = fs.readFileSync(path.join(census,name));
      const data = JSON.parse(raw);
      requireValue([390,1440].includes(data.width) && typeof data.route === 'string' && Array.isArray(data.seen)
        && data.seen.every(s => typeof s === 'string'), 'Invalid census record');
      record.census[name] = digest(raw);
      fs.mkdirSync(ROOT+'/census',{recursive:true});fs.writeFileSync(ROOT+'/census/'+name,raw);
    }
    validateShard(record,report,plan,partition);
    write(ROOT+'/report.json',report);write(ROOT+'/record.json',record);return;
  }
  if (command === 'merge') {
    const folder = '.cache/browser-shard-downloads';
    const prefix='browser-result-'+partition.planSha256+'-';
    requireValue(JSON.stringify(fs.readdirSync(folder).sort()) === JSON.stringify(partition.shards.map(s => prefix+s.index).sort()),
      'Unexpected browser shard artifacts');
    const results = partition.shards.map(s => {
      const root = path.join(folder,prefix+s.index);
      return {root,record:json(root+'/record.json'),report:json(root+'/report.json')};
    });
    const merged = mergeShardReports(plan,partition,results),seen = new Set();
    for (const {root,record} of results) for (const [name,checksum] of Object.entries(record.census)) {
      requireValue(/^(desktop|mobile)-\d+\.json$/.test(name) && !seen.has(name), 'Duplicate or unsafe census record');
      const raw = fs.readFileSync(root+'/census/'+name);requireValue(digest(raw) === checksum, 'Census checksum differs');
      seen.add(name);fs.mkdirSync('.cache/census-stack-align',{recursive:true});fs.writeFileSync('.cache/census-stack-align/'+name,raw);
    }
    write('.cache/browser-results.json',merged);
    fs.writeFileSync('.cache/browser-completion-tests.txt',partition.completion.map(c => c.line).join('\n')+'\n');return;
  }
  if (command === 'complete') {
    const report = appendCompletion(plan,partition,json('.cache/browser-results.json'),json('.cache/browser-completion-report.json'));
    write('.cache/browser-results.json',report);return;
  }
  throw Error('Use plan, prepare, record, merge or complete');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {main();} catch (error) {console.error(error.message);process.exitCode=1;}
}
