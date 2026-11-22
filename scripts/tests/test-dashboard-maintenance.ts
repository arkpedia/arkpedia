import test from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceStatus, publicPageOrigin, refreshPublicPage } from '../../lib/dashboard/pageMaintenance';
import { CONTENT_SCHEMA } from '../../lib/content/types';

const origin = 'https://www.arkpedia.net';
const published = 'a'.repeat(64);
const previous = 'b'.repeat(64);

test('page checks use the published pointer, public page identity and recorded refresh independently', async t => {
  const recorded = new Date('2026-11-22T12:34:56Z');
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/current.json')) {
      return Response.json({ schema: CONTENT_SCHEMA, release: published, revision: 'c'.repeat(40), manifestSha256: published });
    }
    if (url.pathname === '/about') return new Response('temporarily unavailable', { status: 503 });
    const page = url.pathname === '/support' ? '/404' : url.pathname;
    const release = url.pathname === '/' ? previous : published;
    return new Response('<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({ page, props: { pageProps: { __contentRelease: { release } } } }) + '</script>');
  });
  const bucket = { list: async () => ({ objects: [{ key: 'dashboard/page-refresh/home', uploaded: recorded }] }) };
  const data = await maintenanceStatus(origin, bucket);
  assert.equal(data.published, published);
  assert.equal(data.historyAvailable, true);
  assert.deepEqual(data.pages.map(p => [p.route, p.served, p.lastRefresh]), [
    ['/', previous, recorded.toISOString()], ['/about', null, null], ['/support', null, null], ['/schedule', published, null],
  ]);
  assert.equal((await maintenanceStatus(origin)).historyAvailable, false);
});

test('a refresh targets the public host, restores admin headers and only records completed regeneration', async () => {
  const headers = { host: 'admin.arkpedia.net', cookie: 'fixture' };
  const req = { headers };
  const keys: string[] = [];
  const bucket = { put: async (key: string) => { keys.push(key); } };
  const run = async (path: string) => {
    assert.equal(path, '/');
    assert.deepEqual(req.headers, { host: 'www.arkpedia.net' });
  };
  assert.deepEqual(await refreshPublicPage('/', origin, req, run, bucket), { refreshed: '/' });
  assert.equal(req.headers, headers);
  await assert.rejects(refreshPublicPage('/about', origin, req, async () => { throw Error('failed'); }, bucket));
  assert.equal(req.headers, headers);
  assert.deepEqual(keys, ['dashboard/page-refresh/home']);
  assert.ok((await refreshPublicPage('/', origin, req, run, { put: async () => { throw Error('storage'); } })).warning);
  assert.equal(publicPageOrigin('staging', origin), null);
  assert.equal(publicPageOrigin('production', origin), origin);
});
