import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Importers are plain JavaScript.
import { coverPlan, importStoryCovers } from '../imports/import-story-covers.mjs';

const manifest = { groups: {
  main_16: { cover: 'main_16.jpg', v: { cover: '123456abcd' } },
  main_17: { cover: 'main_17.jpg', v: { cover: 'abcdef1234' } },
} };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOzgAAAAASUVORK5CYII=', 'base64');

test('story covers stage source bytes, then adopt only published assets without hotlinks', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-story-covers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file: string, data: unknown) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), JSON.stringify(data)); };
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  write('data/assets/external-asset-index.json', { files: [] });
  write('data/story-library-art.json', { images: { main_17: 'https://arknights.timo.beer/covers/main_17.jpg' } });
  const fetched: string[] = [];
  assert.deepEqual(await importStoryCovers(manifest, { root, minimum: 2, fetcher: async (url: string) => { fetched.push(url); return new Response(png); } }), { published: 0, staged: 2 });
  assert.equal(fetched.length, 2);
  assert.deepEqual(read('data/story-library-art.json').images, {}, 'unpublished assets and old hotlinks are never rendered');
  const staged = read('.cache/story-covers/staged.json');
  const targets = coverPlan(manifest).map((row: { target: string }) => row.target);
  assert.deepEqual(Object.keys(staged.files).sort(), targets.sort());
  assert.match(staged.files[targets[0]].source, /^https:\/\/arknights\.timo\.beer\/covers\//);
  assert.match(staged.files[targets[0]].sha256, /^[a-f0-9]{64}$/);
  write('data/assets/external-asset-index.json', { files: targets });
  assert.deepEqual(await importStoryCovers(manifest, { root, minimum: 2, fetcher: () => { throw new Error('published art must not be downloaded again'); } }), { published: 2, staged: 0 });
  const adopted = read('data/story-library-art.json');
  assert.equal(adopted.images.main_17, '/story-map/timo-main_17-abcdef1234.webp');
  assert.equal(read('data/quarantine.json').entries.filter((row: { stage: string }) => row.stage === 'story-covers').length, 0);
  await assert.rejects(importStoryCovers({ groups: {} }, { root, minimum: 2 }), /Incomplete/);
  assert.deepEqual(read('data/story-library-art.json'), adopted, 'a manifest outage preserves mirrored artwork');
  const changed = { groups: { main_17: { cover: 'main_17.jpg', v: { cover: '999999aaaa' } } } };
  await importStoryCovers(changed, { root, minimum: 1, fetcher: async () => new Response('down', { status: 503 }) });
  assert.equal(read('data/story-library-art.json').images.main_17, adopted.images.main_17, 'a new version waits for publication while the old asset stays usable');
});

test('story-cover plans reject unsafe names and use the source version in asset filenames', () => {
  assert.deepEqual(coverPlan({ groups: { '../bad': { cover: 'a.jpg', v: { cover: 'abcdef' } }, safe: { cover: '../bad.jpg', v: { cover: 'abcdef' } }, unknown: { cover: 'a.jpg' } } }), []);
  assert.equal(coverPlan(manifest)[1].target, 'story-map/timo-main_17-abcdef1234.webp');
});
