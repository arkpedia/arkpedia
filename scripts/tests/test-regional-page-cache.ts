import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keepAtLeast, regionalPageCache, REGIONAL_COPY_SECONDS } from '../../lib/cloudflare/regionalPageCache';

/*
 * The Worker keeps a day-long copy of each page in the data centre that served it
 * (lib/cloudflare/regionalPageCache.ts). The lifetime is set inside OpenNext's regional cache,
 * which is not public API, so this runs the real regional cache against a stand-in for
 * Cloudflare's Cache: an OpenNext upgrade that moves it fails here, not as pages that quietly
 * cross the Atlantic again.
 */

class MemoryCache {
  entries = new Map<string, { body: string; cacheControl: string | null }>();
  async put(request: RequestInfo | URL, response: Response) {
    this.entries.set(String(request), { body: await response.text(), cacheControl: response.headers.get('cache-control') });
  }
  async match(request: RequestInfo | URL) {
    const entry = this.entries.get(String(request));
    return entry ? new Response(entry.body, { headers: entry.cacheControl ? { 'cache-control': entry.cacheControl } : {} }) : undefined;
  }
  async delete(request: RequestInfo | URL) { return this.entries.delete(String(request)); }
}

test('a page cached with a 60 s revalidate time keeps its regional copy for a day', async () => {
  const memory = new MemoryCache();
  (globalThis as { caches?: unknown }).caches = { open: async () => memory };
  const store = {
    name: 'test-store',
    async get() { return null; },
    async set() {},
    async delete() {},
  };
  const cache = regionalPageCache(store as unknown as Parameters<typeof regionalPageCache>[0]);
  await cache.set('/operators', { type: 'page', html: '<p>roster</p>', json: {}, revalidate: 60 } as never, 'cache');
  const [[key, entry]] = [...memory.entries];
  assert.match(key, /\/operators\.cache$/, 'the regional cache stored the page');
  assert.equal(entry.cacheControl, `max-age=${REGIONAL_COPY_SECONDS}`, 'a day, not the page\'s 60 s');
  assert.match(entry.body, /roster/);
});

test('a lifetime longer than the floor is kept as it is', async () => {
  const memory = new MemoryCache();
  await keepAtLeast(memory as unknown as Cache, 3600).put('http://cache.local/a', new Response('x', { headers: { 'cache-control': 'max-age=90000' } }));
  await keepAtLeast(memory as unknown as Cache, 3600).put('http://cache.local/b', new Response('y', { headers: { 'cache-control': 'max-age=60' } }));
  assert.equal(memory.entries.get('http://cache.local/a')?.cacheControl, 'max-age=90000');
  assert.equal(memory.entries.get('http://cache.local/b')?.cacheControl, 'max-age=3600');
});
