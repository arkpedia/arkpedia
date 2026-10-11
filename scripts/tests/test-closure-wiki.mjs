import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseOperation, operationUrl, fetchOperationPreview, fallbackBatch } from '../lib/closure-wiki.mjs';
import { importStageRenders } from '../imports/import-stage-renders.mjs';

const stageId = 'act52side_08';
const levelId = 'Activities/act52side/level_act52side_08';
const preview = `https://static.closure.wiki/v3/mappreviews/${stageId}.webp`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64');
const rawLevel = { mapData: { map: { row_size: 1, column_size: 2, matrix_data: [0, 1] }, tiles: [{}, {}] } };
const code = value => `<code><span>${JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}</span></code>`;
const html = (stage = { stageId, levelId }, image = preview, level = rawLevel) =>
  `<meta property="og:image" content="${image}"/>${code(stage)}${code(level)}`;

test('Closure references use exact IDs, verify the client layout and preserve raw data', () => {
  const result = parseOperation(html(), { stageId, levelId: levelId.toUpperCase() });
  assert.equal(result.reference, operationUrl(stageId));
  assert.equal(result.preview, preview);
  assert.deepEqual(result.level, rawLevel);
  assert.throws(() => operationUrl('../foo'), /Invalid/);
  assert.throws(() => parseOperation(html({ stageId: 'act52side_09', levelId }), { stageId, levelId }), /match/);
  assert.throws(() => parseOperation(html({ stageId, levelId: 'Activities/wrong' }), { stageId, levelId }), /match/);
  assert.throws(() => parseOperation(html(undefined, 'https://elsewhere.test/map.webp'), { stageId, levelId }), /preview/);
  assert.throws(() => parseOperation(html(undefined, preview.replace('_08', '_09')), { stageId, levelId }), /preview/);
  assert.throws(() => parseOperation(html(undefined, preview, { mapData: {} }), { stageId, levelId }), /map data/);
});

test('Closure fallback fetches only a validated preview and rejects outages and oversized or non-image bodies', async () => {
  const urls = [];
  const fetcher = async (url, options) => {
    urls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return new Response(url === preview ? png : html());
  };
  assert.deepEqual((await fetchOperationPreview({ stageId, levelId }, { fetcher })).bytes, png);
  assert.deepEqual(urls, [operationUrl(stageId), preview]);
  await assert.rejects(fetchOperationPreview({ stageId, levelId }, { fetcher: async () => new Response('missing', { status: 404 }) }), /failed/);
  await assert.rejects(fetchOperationPreview({ stageId, levelId }, { fetcher: async () => new Response('large', { headers: { 'Content-Length': 4000000 } }) }), /size limit/);
  await assert.rejects(fetchOperationPreview({ stageId, levelId }, { fetcher: async url => new Response(url === preview ? '<html>error</html>' : html()) }), /not an image/);
  await assert.rejects(fetchOperationPreview({ stageId, levelId }, { fetcher: async () => new Response('x'.repeat(3 * 1024 * 1024 + 1)) }), /size limit/);
});

test('daily fallback budget rotates through missing maps rather than retrying the same unavailable first page', () => {
  const candidates = Array.from({ length: 43 }, (_, index) => index);
  const found = new Set();
  for (let day = 0; day < 3; day++) {
    const batch = fallbackBatch(candidates, { limit: 20, now: new Date(Date.UTC(2026, 9, 1 + day)) });
    assert.equal(batch.length, 20);
    for (const id of batch) found.add(id);
  }
  assert.equal(found.size, 43);
  assert.deepEqual(fallbackBatch([], {}), []);
  assert.deepEqual(fallbackBatch(candidates, { limit: 0 }), []);
});

test('nightly map fallback preserves primary art, skips exclusions, survives failure and adopts only after publication', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-closure-'));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  try {
    const stages = Object.fromEntries(['primary', 'published', 'missing', 'excluded', 'failed'].map(id => [id, { code: id.toUpperCase(), levelId: `Activities/test/level_${id}`, difficulty: 'NORMAL' }]));
    for (const id of Object.keys(stages)) write(`data/stages/${id}.json`, { slug: id, id, code: stages[id].code, preview: null, content: { id: id === 'excluded' ? 'excluded-event' : 'event' } });
    write('data/stages/already.json', { slug: 'already', id: 'missing', preview: 'images/stages/hand-picked.png' });
    write('data/excluded-contents.json', { 'excluded-event': {} });
    write('data/assets/external-asset-index.json', { files: ['stages-images/published.webp'] });
    write('cn/map/primary.png', png);
    const looked = [];
    const closureLookup = async candidate => {
      looked.push(candidate.stageId);
      if (candidate.stageId === 'failed') throw new Error('Unavailable');
      return { bytes: png, preview: `https://static.closure.wiki/v3/mappreviews/${candidate.stageId}.webp` };
    };
    const run = options => importStageRenders({ root, stages, cn: 'cn', closureLookup, log: () => {}, ...options });
    const first = await run();
    assert.deepEqual(looked.sort(), ['failed', 'missing']);
    assert.deepEqual(first.staged.sort(), ['missing', 'primary']);
    assert.equal(read('data/stages/missing.json').preview, null);
    assert.equal(read('data/stages/already.json').preview, 'images/stages/hand-picked.png');
    const staged = read('.cache/stage-renders/staged.json').files;
    assert.equal(staged['stages-images/missing.webp'].source, 'https://static.closure.wiki/v3/mappreviews/missing.webp');
    assert.ok(read('data/quarantine.json').entries.some(row => row.key === 'stage-render:failed'));
    write('data/assets/external-asset-index.json', { files: ['stages-images/published.webp', 'stages-images/missing.webp', 'stages-images/primary.webp'] });
    looked.length = 0;
    await run();
    assert.deepEqual(looked, ['failed']);
    assert.equal(read('data/stages/missing.json').preview, 'images/stages/missing.png');
    assert.ok(!read('data/quarantine.json').entries.some(row => row.key === 'stage-render:missing'));
    // An unavailable art mirror must not disable the supplementary source.
    fs.rmSync(path.join(root, 'cn'), { recursive: true });
    await run({ closureLookup: async candidate => ({ bytes: png, preview: `https://static.closure.wiki/v3/mappreviews/${candidate.stageId}.webp` }) });
    assert.ok(read('.cache/stage-renders/staged.json').files['stages-images/failed.webp']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
