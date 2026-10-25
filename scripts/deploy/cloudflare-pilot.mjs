#!/usr/bin/env node
// Main-based build for the existing migration pilot. No deploy/DNS/database action.
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { codeFingerprint } from '../content/code-fingerprint.mjs';

const ACCOUNT = '1ff51c10571eaa9934bc451e1bfdb361';
const AUTH_ORIGIN = 'https://arkpedia-cf.mocchibird.com';
const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function readPilotConfig(file = 'wrangler.jsonc') {
  const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
  if (parsed.error) throw new Error('Invalid pilot JSONC');
  const config = parsed.config;
  const fields = new Set(['$schema', 'name', 'account_id', 'preview_urls', 'main', 'compatibility_date', 'compatibility_flags', 'assets', 'observability', 'd1_databases', 'vars', 'r2_buckets', 'services', 'durable_objects', 'migrations']);
  if (Object.keys(config).some(key => !fields.has(key))) throw new Error('Unexpected pilot configuration field; routes and environment overrides require separate review');
  if (config.name !== 'arkpedia' || config.account_id !== ACCOUNT || config.preview_urls !== false || config.main !== '.open-next/worker.js') throw new Error('Not the existing migration pilot');
  if (!exact(config.assets, { directory: '.open-next/assets', binding: 'ASSETS' })) throw new Error('Pilot static assets differ');
  if (!exact(config.d1_databases, [{ binding: 'ARKPEDIA_ACCOUNTS_DB', database_name: 'arkpedia-accounts-dev', database_id: 'f7daff77-8e8f-4ec2-998b-97fb6e4b948f', migrations_dir: 'migrations/accounts' }])) throw new Error('Pilot account binding must be preserved');
  if (!exact(config.r2_buckets, [{ binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: 'arkpedia-opennext-cache' }])) throw new Error('Pilot must retain its existing ISR cache');
  if (!exact(config.services, [{ binding: 'WORKER_SELF_REFERENCE', service: 'arkpedia' }])) throw new Error('Pilot self-reference must target itself');
  if (!exact(config.durable_objects, { bindings: [{ name: 'NEXT_CACHE_DO_QUEUE', class_name: 'DOQueueHandler' }] })
    || !exact(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] }])) throw new Error('Pilot queue and migration history must be preserved');
  if (!exact(config.vars, { ARKPEDIA_AUTH_URL: AUTH_ORIGIN, ARKPEDIA_CONTENT_CHANNEL: 'live', ARKPEDIA_DEPLOYMENT_ROLE: 'production' })) throw new Error('Pilot must use its existing account origin with main-compatible live data');
  if (config.compatibility_date !== '2026-10-19' || !exact(config.compatibility_flags, ['nodejs_compat', 'global_fetch_strictly_public'])) throw new Error('Pilot runtime compatibility changed');
  return config;
}

export function pilotBuildEnvironment(environment = process.env) {
  const child = { ...environment, ARKPEDIA_WORKER: '1', ARKPEDIA_CONTENT_CHANNEL: 'live', ARKPEDIA_DEPLOYMENT_ROLE: 'production' };
  // Runtime account credentials stay in the existing Worker. The build needs no
  // deployment credential, browser-test override or Vercel project identity.
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL',
    'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET',
    'VERCEL', 'VERCEL_ENV', 'VERCEL_PROJECT_ID', 'ARKPEDIA_CONTENT_PILOT_ORIGIN', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT']) delete child[key];
  return child;
}

export function readPilotBuild(expectedCommit, expectedFingerprint, file = '.open-next/assets/build-info.json') {
  const info = JSON.parse(readFileSync(file, 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(expectedCommit) || info.commit !== expectedCommit || info.dirty !== false
    || info.deploymentRole !== 'production' || info.contentChannel !== 'live' || info.contentSchema !== 2
    || !/^[a-f0-9]{64}$/.test(expectedFingerprint) || info.codeFingerprint !== expectedFingerprint) throw new Error('Pilot build must have the exact clean source, production role and live schema-2 content');
  return info;
}

function main() {
  const action = process.argv[2] || 'check';
  if (!['check', 'build'].includes(action)) throw new Error('Use check or build; deployment remains owned by the provider pipeline');
  readPilotConfig();
  console.log('Existing Cloudflare pilot bindings verified; main live data, production role, alternate-host noindex');
  if (action === 'check') return;
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const fingerprint = codeFingerprint(commit);
  const result = spawnSync(process.execPath, ['node_modules/@opennextjs/cloudflare/dist/cli/index.js', 'build', '--config', 'wrangler.jsonc'], { env: pilotBuildEnvironment(), stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (process.exitCode !== 0) return;
  readPilotBuild(commit, fingerprint);
  const audit = spawnSync(process.execPath, ['scripts/audits/check-worker-bundle.mjs'], { stdio: 'inherit' });
  if (audit.error) throw audit.error;
  process.exitCode = audit.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
