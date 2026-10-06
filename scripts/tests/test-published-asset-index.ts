import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { nextIndex, readRetired } from '../lib/published-asset-index.mjs';

/*
 * The asset pin step refused every removal, so on 2026-10-06 the four images
 * arkpedia-image-assets removed on purpose (#32: CN Joint Operation/Orienteering art; #33: a
 * stand-in Standard Pool banner) kept the day's content release on the old pins, and www kept
 * showing the stand-in. A repository now declares such removals in retired-assets.json.
 */

const sha = (c: string) => c.repeat(64);
const index = {
  files: ['a/keep.webp', 'a/gone.webp', 'a/changed.webp'],
  sha256: { 'a/keep.webp': sha('1'), 'a/gone.webp': sha('2'), 'a/changed.webp': sha('3') },
  hashes: { 'a/keep.webp': '11111111', 'a/gone.webp': '22222222', 'a/changed.webp': '33333333' },
  other: 'kept',
};
const published = { 'a/keep.webp': { sha256: sha('1') }, 'a/changed.webp': { sha256: sha('4') }, 'a/new.webp': { sha256: sha('5') } };

test('a published path gone without a retirement is still refused', () => {
  assert.throws(() => nextIndex(index, published, new Map()), /Refusing to remove published paths: a\/gone\.webp/);
});

test('a retired path leaves the index; everything else is adopted as before', () => {
  const { next, retiredNow } = nextIndex(index, published, new Map([['a/gone.webp', 'replaced by Global art']]));
  assert.deepEqual(retiredNow, ['a/gone.webp']);
  assert.deepEqual(next.files, ['a/changed.webp', 'a/keep.webp', 'a/new.webp']);
  assert.equal(next.sha256['a/gone.webp'], undefined);
  assert.equal(next.hashes['a/gone.webp'], undefined);
  assert.equal(next.hashes['a/keep.webp'], '11111111');
  assert.equal(next.hashes['a/changed.webp'], '44444444');
  assert.equal(next.other, 'kept');
});

test('a path retired while still published is a contradiction', () => {
  assert.throws(() => nextIndex(index, { ...published, 'a/gone.webp': { sha256: sha('2') } }, new Map([['a/gone.webp', 'x']])), /Retired but still published: a\/gone\.webp/);
});

test('retired-assets.json is read strictly', () => {
  assert.equal(readRetired(null, 'r').size, 0);
  const list = readRetired({ schemaVersion: 1, paths: { 'headhunting-banner-images/Standard Pool 177 (Global).webp': { reason: 'a stand-in, not the official art' } } }, 'r');
  assert.equal(list.get('headhunting-banner-images/Standard Pool 177 (Global).webp'), 'a stand-in, not the official art');
  for (const bad of [{}, { schemaVersion: 2, paths: {} }, { schemaVersion: 1, paths: [] }, { schemaVersion: 1, paths: { 'x.webp': {} } },
    { schemaVersion: 1, paths: { '../x.webp': { reason: 'r' } } }, { schemaVersion: 1, paths: { '/x.webp': { reason: 'r' } } }, { schemaVersion: 1, paths: { 'a/./x.webp': { reason: 'r' } } }]) {
    assert.throws(() => readRetired(bad, 'r'), /retired-assets\.json/, JSON.stringify(bad));
  }
});
