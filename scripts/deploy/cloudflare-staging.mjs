#!/usr/bin/env node
// Explicit staging only: local iteration does not deploy anything.
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export function readStagingConfig(file = 'wrangler.staging.jsonc') {
  const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
  if (parsed.error) throw new Error('Invalid staging JSONC');
  const config = parsed.config;
  const allowed = new Set(['$schema', 'name', 'main', 'compatibility_date', 'compatibility_flags', 'workers_dev', 'preview_urls', 'assets', 'observability', 'vars', 'r2_buckets', 'services', 'durable_objects', 'migrations']);
  if (Object.keys(config).some(key => !allowed.has(key))) throw new Error('Unexpected staging configuration field');
  if (config.name !== 'arkpedia-staging' || config.workers_dev !== true) throw new Error('Not the dedicated staging Worker');
  if (config.routes?.length || config.route || config.env) throw new Error('Staging must have no production routes or environment overrides');
  if (config.r2_buckets?.length !== 1 || config.r2_buckets[0].bucket_name !== 'arkpedia-staging-cache' || config.r2_buckets[0].binding !== 'NEXT_INC_CACHE_R2_BUCKET') throw new Error('Staging must use only its own cache bucket');
  if (config.services?.length !== 1 || config.services[0].binding !== 'WORKER_SELF_REFERENCE' || config.services[0].service !== config.name) throw new Error('Staging self-reference must target itself');
  if (config.d1_databases?.length || config.kv_namespaces?.length || config.queues || config.containers) throw new Error('Unexpected writable staging resource');
  if (config.vars?.ARKPEDIA_CONTENT_CHANNEL !== 'live' || config.vars?.ARKPEDIA_DEPLOYMENT_ROLE !== 'staging' || Object.keys(config.vars).some(key => !['ARKPEDIA_CONTENT_CHANNEL', 'ARKPEDIA_DEPLOYMENT_ROLE'].includes(key))) throw new Error('Main staging must read live with an explicit staging role and no account settings');
  const queues = config.durable_objects?.bindings;
  if (queues?.length !== 1 || queues[0].name !== 'NEXT_CACHE_DO_QUEUE' || queues[0].class_name !== 'DOQueueHandler' || Object.keys(queues[0]).some(key => !['name', 'class_name'].includes(key))) throw new Error('Staging must own its revalidation queue');
  return config;
}

export function stagingEnvironment(environment = process.env) {
  // Code from main needs its compatible live data. Indexing is controlled independently.
  const isolated = { ...environment, ARKPEDIA_CONTENT_CHANNEL: 'live', ARKPEDIA_WORKER: '1', ARKPEDIA_DEPLOYMENT_ROLE: 'staging' };
  for (const key of ['ARKPEDIA_AUTH_URL', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET']) delete isolated[key];
  return isolated;
}

export function readStagingBuild(expectedCommit, file = '.open-next/assets/build-info.json') {
  const info = JSON.parse(readFileSync(file, 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(expectedCommit) || info.commit !== expectedCommit || info.dirty !== false
    || info.deploymentRole !== 'staging' || info.contentChannel !== 'live' || !/^[a-f0-9]{64}$/.test(info.codeFingerprint)) {
    throw new Error('Staging output must be a clean, explicitly staged build of the expected commit and live data');
  }
  return info;
}

function main() {
  const action = process.argv[2] || 'check';
  if (!['check', 'build', 'deploy'].includes(action)) throw new Error('Use check, build or deploy');
  const config = readStagingConfig();
  console.log(`Staging isolation verified: ${config.name}, cache ${config.r2_buckets[0].bucket_name}, content live, role staging`);
  if (action === 'check') return;
  if (action === 'deploy') readStagingBuild(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  const cli = 'node_modules/@opennextjs/cloudflare/dist/cli/index.js';
  const args = [cli, action, '--config', 'wrangler.staging.jsonc'];
  if (action === 'build') args.push('--openNextConfigPath', 'open-next.staging.config.ts');
  const result = spawnSync(process.execPath, args, { env: stagingEnvironment(), stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (action === 'build' && process.exitCode === 0) {
    const audit = spawnSync(process.execPath, ['scripts/audits/check-worker-bundle.mjs'], { stdio: 'inherit' });
    if (audit.error) throw audit.error;
    process.exitCode = audit.status ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
