import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import webAnalytics from '../../config/web-analytics.json';

const require = createRequire(import.meta.url);
const configFor = (env: Record<string, string | undefined>) => {
  const keys = ['VERCEL', 'VERCEL_ENV', 'VERCEL_PROJECT_ID', 'ARKPEDIA_CONTENT_CHANNEL', 'WORKERS_CI_BRANCH'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    delete require.cache[require.resolve('../../next.config.js')];
    return require('../../next.config.js')('phase-test') as { env?: Record<string, string> };
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    delete require.cache[require.resolve('../../next.config.js')];
  }
};

test('only the Worker\'s own build of the cloudflare branch counts visits, once the site has a token', () => {
  const worker = configFor({ WORKERS_CI_BRANCH: 'cloudflare' }).env?.ARKPEDIA_WEB_ANALYTICS;
  assert.equal(worker, webAnalytics.cloudflareToken ? '1' : '', 'the Worker counts with a token and loads nothing without one');
  // Vercel's analytics is gone from this branch, and no other build loads Cloudflare's.
  for (const env of [{}, { VERCEL: '1', VERCEL_ENV: 'production', ARKPEDIA_CONTENT_CHANNEL: 'live' }, { WORKERS_CI_BRANCH: 'dev' }, { WORKERS_CI_BRANCH: 'feat/x' }]) {
    assert.equal(configFor(env).env?.ARKPEDIA_WEB_ANALYTICS, '', JSON.stringify(env));
  }
});

test('the token, once set, is the shape Cloudflare issues', () => {
  if (!webAnalytics.cloudflareToken) return;
  assert.match(webAnalytics.cloudflareToken, /^[a-f0-9]{32}$/);
});
