import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const action = process.argv[2] || 'check';
assert.ok(['check', 'build', 'publish'].includes(action), 'Use check, build or publish');
const config = JSON.parse(readFileSync('wrangler.preview.jsonc', 'utf8').replace(/^\/\/.*$/gm, ''));
assert.equal(config.name, 'arkpedia');
assert.equal(config.main, 'scripts/deploy/preview-worker.mjs');
assert.equal(config.previews.vars.ARKPEDIA_DEPLOYMENT_ROLE, 'staging');
assert.equal(config.previews.vars.ARKPEDIA_CONTENT_CHANNEL, 'live');
assert.deepEqual(config.previews.r2_buckets, [{binding:'NEXT_INC_CACHE_R2_BUCKET',bucket_name:'arkpedia-preview-cache'}]);
for (const key of ['services', 'd1_databases', 'routes', 'queues', 'env']) {
  assert.equal(config[key], undefined);
  assert.equal(config.previews[key], undefined);
}
if (action === 'check') { console.log('Native Preview isolation verified'); process.exit(0); }
const env = {...process.env, ARKPEDIA_WORKER:'1', ARKPEDIA_CONTENT_CHANNEL:'live', ARKPEDIA_DEPLOYMENT_ROLE:'staging'};
if (action === 'publish') {
  const build = JSON.parse(readFileSync('.open-next/assets/build-info.json','utf8'));
  assert.equal(build.commit, execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
  assert.equal(build.dirty, false);
  assert.equal(build.deploymentRole, 'staging');
}
const args = action === 'build'
  ? ['node_modules/@opennextjs/cloudflare/dist/cli/index.js','build','--config','wrangler.preview.jsonc','--openNextConfigPath','open-next.preview.config.ts']
  : ['node_modules/wrangler/bin/wrangler.js','preview','--config','wrangler.preview.jsonc','--worker-name','arkpedia','--name','arkpedia'];
const result = spawnSync(process.execPath,args,{env,stdio:'inherit'});
if(result.error) throw result.error;
process.exitCode = result.status ?? 1;
