import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/*
 * Only www (the live content channel) may be listed by search engines. arkpedia-dev and the
 * site's Worker serve the same pages from other channels; next.config.js marks every response
 * of theirs noindex, so they never compete with www in search results.
 */
const require = createRequire(import.meta.url);
type Header = { key: string; value: string };
const robotsTag = async (env: Record<string, string | undefined>): Promise<string | undefined> => {
  const keys = ['VERCEL', 'VERCEL_ENV', 'VERCEL_PROJECT_ID', 'ARKPEDIA_CONTENT_CHANNEL', 'WORKERS_CI_BRANCH'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    delete require.cache[require.resolve('../../next.config.js')];
    const config = require('../../next.config.js')('phase-test') as { headers: () => Promise<{ source: string; headers: Header[] }[]> };
    const all = (await config.headers()).find(rule => rule.source === '/:path*');
    return all?.headers.find(header => header.key === 'X-Robots-Tag')?.value;
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    delete require.cache[require.resolve('../../next.config.js')];
  }
};

test('www stays listed, and arkpedia-dev and the Worker are noindex on every page', async () => {
  assert.equal(await robotsTag({ ARKPEDIA_CONTENT_CHANNEL: 'live' }), undefined, 'www: no X-Robots-Tag');
  assert.equal(await robotsTag({}), undefined, 'a build that names no channel reads live, as www does');
  assert.equal(await robotsTag({ ARKPEDIA_CONTENT_CHANNEL: 'dev-live' }), 'noindex', 'arkpedia-dev');
  assert.equal(await robotsTag({ WORKERS_CI_BRANCH: 'cloudflare' }), 'noindex', 'the site\'s Worker, which reads dev\'s channel');
});
