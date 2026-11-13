import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Node accepts redirect:"error"; workerd rejects it before making a request.
// Exercise the actual fetch, encryption and D1 path in the deployment runtime.
test('Worker sync rotates credentials, saves a complete snapshot and rejects redirects without forwarding credentials', async () => {
  let redirect = false;
  const calls = [];
  const tier = { type: 'tier', id: '10', attributes: { title: 'Fixture tier', amount_cents: 100 } };
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: '2026-10-19',
    script: fs.readFileSync(new URL('../../lib/patreon/sync.mjs', import.meta.url), 'utf8') + `
      export default { async fetch(request, env) {
        try {
          await syncPatreon(env, { now: Number(new URL(request.url).searchParams.get('now')) });
          return Response.json(await readSupporters(env));
        } catch (error) { return Response.json({ code: patreonSyncDiagnostic(error) }, { status: 503 }); }
      } }`,
    d1Databases: ['ARKPEDIA_ACCOUNTS_DB'],
    bindings: {
      ARKPEDIA_DEPLOYMENT_ROLE: 'production', ARKPEDIA_AUTH_URL: 'https://www.arkpedia.net',
      PATREON_CAMPAIGN_ID: '123', PATREON_CLIENT_ID: 'fixture-client', PATREON_CLIENT_SECRET: 'fixture-secret',
      PATREON_CREATOR_ACCESS_TOKEN: 'fixture-access', PATREON_CREATOR_REFRESH_TOKEN: 'fixture-refresh',
    },
    outboundService: async request => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://www.patreon.com');
      calls.push(url.pathname);
      if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } });
      if (url.pathname.endsWith('/token')) {
        const form = new URLSearchParams(await request.text());
        assert.equal(form.get('refresh_token'), 'fixture-refresh');
        return Response.json({ access_token: 'fixture-rotated', refresh_token: 'fixture-rotated-refresh' });
      }
      if (request.headers.get('Authorization') === 'Bearer fixture-access') return new Response(null, { status: 401 });
      assert.equal(request.headers.get('Authorization'), 'Bearer fixture-rotated');
      if (!url.pathname.endsWith('/members')) return Response.json({ data: { type: 'campaign', id: '123' }, included: [tier] });
      return Response.json({ data: [], included: [], meta: { pagination: { total: 0 } } });
    },
  }));
  try {
    const first = await mf.dispatchFetch('http://localhost/?now=1794571200000');
    assert.equal(first.status, 200);
    const snapshot = await first.json();
    assert.deepEqual(snapshot['supporter-tier'], [{ id: '10', name: 'Fixture tier', supporters: [] }]);
    assert.equal(calls.length, 4);
    redirect = true;
    const failed = await mf.dispatchFetch('http://localhost/?now=1794657600000');
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { code: 'CAMPAIGN_HTTP_302' });
    assert.equal(calls.length, 5, 'redirect is returned, never followed');
    const db = await mf.getD1Database('ARKPEDIA_ACCOUNTS_DB');
    const retained = await db.prepare('SELECT snapshot_json FROM patreon_supporter_sync').first();
    assert.deepEqual(JSON.parse(retained.snapshot_json), snapshot, 'failed refresh retains last good public snapshot');
  } finally { await mf.dispose(); }
});
