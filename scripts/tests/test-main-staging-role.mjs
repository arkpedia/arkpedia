import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function config(values = {}) {
  const env = { ...process.env };
  for (const key of ['ARKPEDIA_WORKER', 'ARKPEDIA_DEPLOYMENT_ROLE', 'ARKPEDIA_CONTENT_CHANNEL', 'VERCEL', 'VERCEL_ENV', 'VERCEL_PROJECT_ID', 'NEXT_DIST_DIR']) delete env[key];
  const source = `const c=require('./next.config.js')('phase-production-server');c.headers().then(h=>console.log(JSON.stringify({output:c.output??null,env:c.env,headers:h.find(x=>x.source==='/:path*').headers})))`;
  return JSON.parse(execFileSync(process.execPath, ['-e', source], { env: { ...env, ...values }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}
const noindex = result => result.headers.some(header => header.key === 'X-Robots-Tag' && header.value === 'noindex');

test('main staging is standalone and noindex while reading compatible live data', () => {
  const result = config({ ARKPEDIA_WORKER: '1', ARKPEDIA_DEPLOYMENT_ROLE: 'staging', ARKPEDIA_CONTENT_CHANNEL: 'live', VERCEL: '1', VERCEL_ENV: 'production' });
  assert.equal(result.output, 'standalone');
  assert.equal(result.env.ARKPEDIA_CONTENT_CHANNEL, 'live');
  assert.equal(result.env.ARKPEDIA_WORKER, '1');
  assert.equal(result.env.ARKPEDIA_WEB_ANALYTICS, '');
  assert.ok(noindex(result));
});

test('ordinary Vercel production remains indexable with its analytics and output', () => {
  const result = config({ VERCEL: '1', VERCEL_ENV: 'production' });
  assert.equal(result.output, null);
  assert.equal(result.env.ARKPEDIA_WEB_ANALYTICS, '1');
  assert.equal(result.env.ARKPEDIA_WORKER, '');
  assert.equal(noindex(result), false);
});

test('future production Worker does not inherit staging noindex', () => {
  const result = config({ ARKPEDIA_WORKER: '1', ARKPEDIA_DEPLOYMENT_ROLE: 'production' });
  assert.equal(noindex(result), false);
  assert.equal(result.env.ARKPEDIA_WEB_ANALYTICS, '');
});

test('dev data stays unindexed and an unknown deployment role fails closed', () => {
  assert.ok(noindex(config({ ARKPEDIA_CONTENT_CHANNEL: 'dev-live' })));
  assert.throws(() => config({ ARKPEDIA_DEPLOYMENT_ROLE: 'production-typo' }));
});
