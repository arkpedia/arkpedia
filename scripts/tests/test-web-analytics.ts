import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ANALYTICS_SAMPLE_KEY, analyticsPath, createSessionSampler } from '../../lib/analytics/session';

const require = createRequire(import.meta.url);
const configFor = (env: Record<string, string | undefined>) => {
  const keys = ['VERCEL', 'VERCEL_ENV', 'VERCEL_PROJECT_ID', 'ARKPEDIA_CONTENT_CHANNEL', 'ARKPEDIA_WORKER', 'ARKPEDIA_DEPLOYMENT_ROLE', 'WORKERS_CI_BRANCH'];
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

test('only the live production deployment counts analytics, excluding preview, dev and local', () => {
  const production = { VERCEL: '1', VERCEL_ENV: 'production', ARKPEDIA_CONTENT_CHANNEL: 'live' };
  assert.equal(configFor(production).env?.ARKPEDIA_WEB_ANALYTICS, '1');
  for (const env of [{}, { ...production, VERCEL: '0' }, { ...production, VERCEL_ENV: 'preview' }, { ...production, ARKPEDIA_CONTENT_CHANNEL: 'dev-live' }]) {
    assert.equal(configFor(env).env?.ARKPEDIA_WEB_ANALYTICS, '');
  }
});

test('production Workers retain their beacon independently of branch names; staging never counts', () => {
  const production = { ARKPEDIA_WORKER:'1', ARKPEDIA_DEPLOYMENT_ROLE:'production', ARKPEDIA_CONTENT_CHANNEL:'live', WORKERS_CI_BRANCH:'main' };
  assert.equal(configFor(production).env?.ARKPEDIA_WEB_ANALYTICS,'1');
  assert.equal(configFor({...production,WORKERS_CI_BRANCH:'feature/host-check'}).env?.ARKPEDIA_WEB_ANALYTICS,'1');
  assert.equal(configFor({...production,ARKPEDIA_DEPLOYMENT_ROLE:'staging'}).env?.ARKPEDIA_WEB_ANALYTICS,'');
  assert.equal(configFor({...production,ARKPEDIA_CONTENT_CHANNEL:'dev-live'}).env?.ARKPEDIA_WEB_ANALYTICS,'');
  assert.equal(configFor({WORKERS_CI_BRANCH:'cloudflare'}).env?.ARKPEDIA_WEB_ANALYTICS,'');
});

test('a whole session keeps its sample across navigation and reload without a visitor id', () => {
  const values = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  const sample = createSessionSampler();
  assert.equal(sample(storage, () => 0.19), true);
  assert.equal(sample(storage, () => { throw new Error('must not draw again'); }), true);
  assert.equal(createSessionSampler()(storage, () => 0.9), true, 'reload keeps selected session');
  assert.deepEqual([...values], [[ANALYTICS_SAMPLE_KEY, '1']]);
  values.clear();
  assert.equal(createSessionSampler()(storage, () => 0.2), false);
  assert.equal(createSessionSampler()(storage, () => 0), false, 'reload keeps unselected session');
  values.set(ANALYTICS_SAMPLE_KEY, 'invalid');
  assert.equal(createSessionSampler()(storage, () => 0), true, 'invalid old value does not exclude forever');
});

test('blocked storage keeps one decision in memory and query/hash changes are not page views', () => {
  const storage = () => { throw new Error('storage refused'); };
  const sample = createSessionSampler();
  assert.equal(sample(storage, () => 0.8), false);
  assert.equal(sample(storage, () => 0), false);
  assert.equal(analyticsPath('/operators/Penance?tab=skills#details'), '/operators/Penance');
  assert.equal(analyticsPath('/story?chapter=main_17'), '/story');
  assert.equal(analyticsPath('/'), '/');
});
