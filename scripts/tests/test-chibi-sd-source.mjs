import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSdChibiIndex, chibiIndex } from '../build/build-chibi-index.mjs';
import { readChibiArt, writeChibiArt } from '../sync/sync-chibi-art.mjs';

const revision = 'a'.repeat(40);
const file = name => ({ path: `models/operator/char_1/outfit/front/${'b'.repeat(40)}/${name}`, bytes: 1, sha256: 'c'.repeat(64) });
const model = { kind: 'operator', skeleton: file('unit.skel'), atlas: file('unit.atlas'), textures: [file('unit.png')], premultipliedAlpha: false };
const manifest = { schemaVersion: 1, models: { battle: model, base: { ...model, skeleton: file('build_unit.skel'), premultipliedAlpha: true } },
  websiteSkins: { 'char_1@outfit#1': { front: 'battle', walk: 'base' } } };

test('SD catalogue preserves exact skins, distinct base models and alpha blending', () => {
  const index = chibiIndex(manifest, revision);
  assert.deepEqual(Object.keys(index), ['char_1@outfit#1']);
  assert.equal(index['char_1@outfit#1'].back, undefined);
  assert.match(index['char_1@outfit#1'].front.skeleton, /\/unit.skel$/);
  assert.match(index['char_1@outfit#1'].walk.skeleton, /\/build_unit.skel$/);
  assert.equal(index['char_1@outfit#1'].walk.premultipliedAlpha, true);
  for (const facing of Object.values(index['char_1@outfit#1'])) for (const url of [facing.skeleton, facing.atlas, ...Object.values(facing.textures)])
    assert.ok(url.startsWith(`https://raw.githubusercontent.com/arkpedia/arkpedia-sd-assets/${revision}/`));
});

test('incomplete or unsafe SD models fail without an upstream fallback', () => {
  assert.throws(() => chibiIndex(manifest, 'main'), /pinned/);
  assert.throws(() => chibiIndex({ ...manifest, websiteSkins: undefined }, revision), /catalogue/);
  assert.throws(() => chibiIndex({ ...manifest, models: { battle: model } }, revision), /incomplete walk/);
  assert.throws(() => chibiIndex({ ...manifest, models: { ...manifest.models, battle: { ...model, atlas: { ...file('unit.atlas'), path: 'models/../unit.atlas' } } } }, revision), /file record/);
});

test('sync pins both manifest reads and runtime assets to one SD commit', async () => {
  const calls = [];
  const index = await readChibiArt({ token: 'test-token', fetch: async (url, options) => {
    calls.push([url, options]);
    return { ok: true, json: async () => calls.length === 1 ? { sha: revision } : manifest };
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], `https://raw.githubusercontent.com/arkpedia/arkpedia-sd-assets/${revision}/manifest.json`);
  assert.equal(calls[1][1].headers, undefined);
  assert.ok(index['char_1@outfit#1'].front.skeleton.includes(`/${revision}/`));
});

test('failed or partial imports keep the previous website catalogue unchanged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-chibi-sync-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    const index = chibiIndex(manifest, revision), filePath = path.join(root, 'data/chibi-art.json');
    const previous = JSON.stringify(index) + '\n';
    fs.writeFileSync(filePath, previous);
    assert.throws(() => writeChibiArt(root, {}), /Empty/);
    assert.throws(() => writeChibiArt(root, { 'char_1@outfit#1': { front: index['char_1@outfit#1'].front } }), /walk/);
    assert.equal(fs.readFileSync(filePath, 'utf8'), previous);
    assert.equal(writeChibiArt(root, index), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release validation rejects upstream regressions and mixed SD commits', () => {
  const index = chibiIndex(manifest, revision);
  const foreign = structuredClone(index);
  foreign['char_1@outfit#1'].walk.skeleton = foreign['char_1@outfit#1'].walk.skeleton.replace('arkpedia/arkpedia-sd-assets', 'fexli/ArknightsResource');
  assert.throws(() => assertSdChibiIndex(foreign), /pinned SD/);
  const mixed = structuredClone(index);
  mixed['char_1@outfit#1'].walk.atlas = mixed['char_1@outfit#1'].walk.atlas.replace(revision, 'd'.repeat(40));
  assert.throws(() => assertSdChibiIndex(mixed), /Mixed/);
  assert.match(fs.readFileSync('scripts/content/validate-release.mjs', 'utf8'), /name === 'data\/chibi-art\.json'\) assertSdChibiIndex\(record\)/);
});
