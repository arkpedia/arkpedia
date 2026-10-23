import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogueStore } from '../../lib/music/catalogueStore';

/* The player's catalogue follows the page's content release (lib/music/catalogueStore.ts): a tab
   open across a release (Endfield's, 2026-10-22) queues the new release's songs too. */

test('one download per release address, shared by every caller asking at once', async () => {
  const loads: string[] = [];
  const store = createCatalogueStore(async (url: string) => { loads.push(url); return [`${url}:song`]; });
  assert.equal(store.current, null);
  const [a, b] = await Promise.all([store.get('/r1/music-catalogue.json'), store.get('/r1/music-catalogue.json')]);
  assert.deepEqual(a, ['/r1/music-catalogue.json:song']);
  assert.equal(a, b);
  assert.equal(await store.get('/r1/music-catalogue.json'), a, 'the same release: the same catalogue, no download');
  assert.deepEqual(loads, ['/r1/music-catalogue.json']);
});

test('a page from a newer release loads that release\'s catalogue', async () => {
  const store = createCatalogueStore(async (url: string) => [url.includes('r2') ? 'endfield-song' : 'arknights-song']);
  assert.deepEqual(await store.get('/r1/music-catalogue.json'), ['arknights-song']);
  assert.deepEqual(await store.get('/r2/music-catalogue.json'), ['endfield-song']);
  assert.deepEqual(store.current, ['endfield-song']);
});

test('a newer release that fails to load leaves the catalogue already loaded', async () => {
  const store = createCatalogueStore(async (url: string) => { if (url.includes('r2')) throw new Error('offline'); return ['kept']; });
  await store.get('/r1/music-catalogue.json');
  assert.deepEqual(await store.get('/r2/music-catalogue.json'), ['kept']);
  // With nothing loaded yet, the failure is the caller's to handle.
  await assert.rejects(createCatalogueStore(async () => { throw new Error('offline'); }).get('/r1/music-catalogue.json'), /offline/);
});

test('the newest ask wins when two releases\' downloads finish out of order', async () => {
  let release!: (songs: string[]) => void;
  const slow = new Promise<string[]>((resolve) => { release = resolve; });
  const store = createCatalogueStore((url: string) => (url.includes('r1') ? slow : Promise.resolve(['r2'])));
  const first = store.get('/r1/music-catalogue.json');
  assert.deepEqual(await store.get('/r2/music-catalogue.json'), ['r2']);
  release(['r1']);
  assert.deepEqual(await first, ['r1'], 'the older caller still gets what it asked for');
  assert.deepEqual(store.current, ['r2'], 'the newer release stays the loaded one');
});
