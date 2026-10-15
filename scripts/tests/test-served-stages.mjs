import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkServedStages, verifyServedStages, publicationExamples } from '../audits/check-served-stages.mjs';
const bytes = Buffer.from(JSON.stringify([{ slug: '17-2' }]));
const release = 'a'.repeat(64);
const manifest = { release, files: { 'stages-index.json': { path: 'public/stages-index.json', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } } };
const page = value => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { __contentRelease: value } } })}</script>`;
const context = { release, baseUrl: `https://raw.githubusercontent.com/arkpedia/arkpedia-data/${'b'.repeat(40)}/release` };
const fake = (context, index = bytes) => async url => new Response(url.endsWith('/stages/browse') ? page(context) : index);

test('served stages match the prepared release and its exact index bytes', async () => {
  const result = await checkServedStages({ origin: 'https://dev.example', manifest, fetch: fake(context) });
  assert.equal(result.stages, 1);
});
test('stale page, bundled fallback, corrupt index, missing file and HTTP errors fail explicitly', async () => {
  for (const value of [undefined, { ...context, release: 'old' }]) await assert.rejects(checkServedStages({ origin: 'https://dev.example', manifest, fetch: fake(value) }), /stale stage page/);
  await assert.rejects(checkServedStages({ origin: 'https://dev.example', manifest, fetch: fake(context, Buffer.from('[]')) }), /differs/);
  await assert.rejects(checkServedStages({ origin: 'https://dev.example', manifest: { ...manifest, files: {} }, fetch: fake(context) }), /no stages-index/);
  await assert.rejects(checkServedStages({ origin: 'https://dev.example', manifest, fetch: async () => new Response('', { status: 503 }) }), /HTTP 503/);
});
test('bounded cache retries recover but exhausted publication checks remain failures', async () => {
  let calls = 0;
  const fetch = async url => { if (++calls === 1) return new Response(page({ ...context, release: 'old' })); return fake(context)(url); };
  assert.equal((await verifyServedStages({ manifest, deployments: [{ url: 'https://dev.example' }], fetch, sleep: async () => {}, log: () => {} })).length, 1);
  await assert.rejects(verifyServedStages({ manifest, deployments: [{ url: 'https://dev.example' }], fetch: fake(undefined), attempts: 2, sleep: async () => {}, log: () => {} }), /stale stage page/);
  await assert.rejects(verifyServedStages({ manifest, deployments: [] }), /No live deployment/);
});
test('publication examples skip excluded modes and check newest real content pages and dates', async () => {
  const contents = [{ id: 'episode17', kind: 'story', release_date: '2026-10-14' },
    { id: 'excluded-mode', kind: 'event', release_date: '2026-09-23' },
    { id: 'people', kind: 'event', release_date: '2026-09-16' }];
  const prepared = { ...manifest, pages: { '/stages/content/episode17': {}, '/stages/content/people': {} } };
  const examples = publicationExamples(contents, prepared);
  assert.deepEqual(examples.map(row => row.id), ['episode17', 'people']);
  const fetch = async url => {
    const content = examples.find(row => url.endsWith(`/stages/content/${row.id}`));
    return content ? new Response(page(context).replace('"__contentRelease":', `"release":"${content.release_date}","__contentRelease":`)) : fake(context)(url);
  };
  await checkServedStages({ origin: 'https://dev.example', manifest, examples, fetch });
  await assert.rejects(checkServedStages({ origin: 'https://dev.example', manifest, examples, fetch: async url => url.includes('/stages/content/') ? new Response('', { status: 404 }) : fake(context)(url) }), /HTTP 404/);
  await assert.rejects(checkServedStages({ origin: 'https://dev.example', manifest, examples, fetch: async url => url.includes('/stages/content/') ? new Response(page(context)) : fake(context)(url) }), /stale stage content\/date/);
});
