import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { checkBuildFile, expectedBuildIdentity, readLiveBuild, validateBuildIdentity, waitForBuildIdentity } from '../deploy/check-build-identity.mjs';

const expected = { version: 1, commit: 'a'.repeat(40), codeFingerprint: 'b'.repeat(64),
  contentSchema: 2, contentChannel: 'live', deploymentRole: 'production', dirty: false };
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-build-identity-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}

test('every required identity field must match, including clean metadata and production role', () => {
  assert.equal(validateBuildIdentity(expected, expected), expected);
  for (const [key, value] of Object.entries({ version: 2, commit: 'c'.repeat(40), codeFingerprint: 'd'.repeat(64),
    contentSchema: 3, contentChannel: 'dev-live', deploymentRole: 'staging', dirty: true })) {
    assert.throws(() => validateBuildIdentity({ ...expected, [key]: value }, expected), new RegExp(key));
    const missing = { ...expected }; delete missing[key];
    assert.throws(() => validateBuildIdentity(missing, expected), new RegExp(key));
  }
  assert.throws(() => validateBuildIdentity(null, expected), /mismatch/);
  assert.throws(() => validateBuildIdentity(expected, { ...expected, dirty: true }), /Invalid expected/);
});

test('local output refuses dirty, missing, malformed or oversized metadata before upload', t => {
  const file = path.join(temporary(t), 'build-info.json');
  fs.writeFileSync(file, JSON.stringify(expected));
  assert.deepEqual(checkBuildFile(expected, file), expected);
  fs.writeFileSync(file, JSON.stringify({ ...expected, dirty: true }));
  assert.throws(() => checkBuildFile(expected, file), /dirty/);
  fs.writeFileSync(file, 'PRIVATE-INVALID-JSON');
  assert.throws(() => checkBuildFile(expected, file), error => error.message === 'Build identity is not valid JSON');
  fs.writeFileSync(file, 'x'.repeat(16_385));
  assert.throws(() => checkBuildFile(expected, file), /size limit/);
});

test('the expected identity is bound to the actual checkout and changes with committed code', t => {
  const cwd = temporary(t);
  const git = args => execFileSync('git', ['-c','user.name=fixture','-c','user.email=fixture@example.invalid',...args], { cwd, encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim();
  git(['init','-q']); fs.writeFileSync(path.join(cwd,'app.js'),'first'); git(['add','app.js']); git(['commit','-qm','first']);
  const first = expectedBuildIdentity({ cwd, env: { ARKPEDIA_CONTENT_CHANNEL: 'dev-live' } });
  assert.equal(first.commit, git(['rev-parse','HEAD'])); assert.equal(first.dirty, false); assert.equal(first.contentChannel,'dev-live');
  fs.writeFileSync(path.join(cwd,'app.js'),'second'); git(['add','app.js']); git(['commit','-qm','second']);
  const second = expectedBuildIdentity({ cwd, env: { ARKPEDIA_CONTENT_CHANNEL: 'dev-live' } });
  assert.notEqual(first.commit,second.commit); assert.notEqual(first.codeFingerprint,second.codeFingerprint);
  assert.throws(()=>validateBuildIdentity(first,second),/commit/);
});

test('live alias propagation retries mismatched identities and succeeds only on the exact clean build', async () => {
  const replies = [{ ...expected, dirty:true }, { ...expected, commit:'c'.repeat(40) }, expected];
  const delays = [], urls = [];
  const actual = await waitForBuildIdentity('https://example.invalid',expected,{ attempts:3, delayMs:1,
    read:async url=>{urls.push(url);return replies.shift();},wait:async delay=>{delays.push(delay);} });
  assert.equal(actual,expected); assert.deepEqual(delays,[1,1]); assert.equal(urls.length,3);
  assert.ok(urls.every(url=>new URL(url).pathname==='/build-info.json'&&new URL(url).searchParams.has('identity')));
});

test('HTTP 200 with dirty/wrong identities or unavailable reads cannot approve a live release', async () => {
  for (const read of [async()=>({...expected,dirty:true}),async()=>({...expected,codeFingerprint:'c'.repeat(64)}),async()=>{throw new Error('PRIVATE-RESPONSE');}]) {
    let waits=0;
    await assert.rejects(waitForBuildIdentity('https://example.invalid',expected,{ attempts:2,delayMs:0,read,wait:async()=>{waits++;} }),/retry limit/);
    assert.equal(waits,1);
  }
  for (const origin of ['http://example.invalid','https://token@example.invalid','https://example.invalid?token=PRIVATE','https://example.invalid/path']) {
    await assert.rejects(waitForBuildIdentity(origin,expected),/HTTPS origin/);
  }
  await assert.rejects(waitForBuildIdentity('https://example.invalid',expected,{attempts:100}),/bounds/);
});

test('public identity reads bound response sizes and do not expose invalid response contents', async () => {
  const read = body => readLiveBuild('https://example.invalid/build-info.json',{fetcher:async()=>new Response(body)});
  assert.deepEqual(await read(JSON.stringify(expected)),expected);
  await assert.rejects(read('PRIVATE-RESPONSE'),error=>error.message==='Build identity is not valid JSON');
  await assert.rejects(read('x'.repeat(16_385)),/size limit/);
  await assert.rejects(readLiveBuild('https://example.invalid',{fetcher:async()=>new Response('PRIVATE',{status:500})}),/unavailable/);
});

test('deployment has one locked install and checks local then public identity before success/publication', () => {
  const workflow=yaml.load(fs.readFileSync('.github/workflows/deploy.yml','utf8'));
  const steps=workflow.jobs.deploy.steps, index=name=>steps.findIndex(step=>step.name===name);
  assert.equal(JSON.parse(fs.readFileSync('vercel.json','utf8')).installCommand,'npm ci --include=dev');
  assert.equal(steps.filter(step=>step.run==='npm ci').length,0);
  assert.ok(index('Build')<index('Verify the built output identity'));
  assert.ok(index('Verify the built output identity')<index('Deploy'));
  assert.ok(index('Deploy')<index('Verify the public deployed identity'));
  assert.ok(index('Verify the public deployed identity')<index('Close the failed-deploy report'));
  for(const name of ['Close the failed-deploy report','Release again if one was held for this deploy']){
    assert.match(steps[index(name)].if,/steps\.build-identity\.outcome == 'success'/,name);
  }
  for(const name of ['Verify the built output identity','Verify the public deployed identity']){
    assert.equal(steps[index(name)]['continue-on-error'],undefined);
    assert.equal(steps[index(name)].env.ARKPEDIA_CONTENT_CHANNEL,'${{ matrix.target.contentChannel }}');
  }
});
