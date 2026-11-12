import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertSdChibiIndex, chibiIndex } from '../build/build-chibi-index.mjs';

// data/chibi-art.json is written by arkpedia-data's importer (its scripts/sync/sync-chibi-art.mjs,
// whose own test lives beside it); these hold what the site builds and validates from it.

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

test('Base uses only an explicit native default, preserving the original skin ID and operator identity', () => {
  const sd = { schemaVersion: 1, models: { form: { ...model, id: 'char_form' } }, websiteSkins: { 'char_form#2': { front: 'form' } } };
  const withoutDefault = chibiIndex(sd, revision);
  assert.equal(withoutDefault['char_form#1'], undefined, 'no guessed promotion fallback');
  const withDefault = chibiIndex({ ...sd, websiteDefaultSkins: { char_form: 'char_form#2' } }, revision);
  assert.deepEqual(withDefault['char_form#1'], withDefault['char_form#2']);
  assert.ok(withDefault['char_form#1'].front.skeleton.startsWith(`https://raw.githubusercontent.com/arkpedia/arkpedia-sd-assets/${revision}/`));
  assert.throws(() => chibiIndex({ ...sd, websiteDefaultSkins: { char_other: 'char_form#2' } }, revision), /native default skin/);
  assert.throws(() => chibiIndex({ ...sd, models: { form: { ...model, id: 'char_other' } }, websiteDefaultSkins: { char_form: 'char_form#2' } }, revision), /own operator/);
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
