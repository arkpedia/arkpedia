import test from 'node:test';
import assert from 'node:assert/strict';
import { domainResponse } from '../../workers/edge/domains.mjs';

test('live domains cannot expose Preview sign-in or cloud-account endpoints', async () => {
  for (const host of ['www.arkpedia.net', 'arkpedia.net', 'arkpedia-cf.mocchibird.com']) {
    for (const path of ['/api/auth/sign-in/social', '/api/auth/callback/google', '/api/cloud-account', '/api/account-profile', '/api/%61uth/get-session']) {
      const response = await domainResponse(new Request(`https://${host}${path}`), () => assert.fail('account request escaped'));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
});

test('apex redirects to canonical www preserving path and query', async () => {
  const response = await domainResponse(new Request('https://arkpedia.net/story?chapter=1'));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://www.arkpedia.net/story?chapter=1');
});

test('production and pilot continue through the existing service-bound front cache', async () => {
  for (const host of ['www.arkpedia.net', 'arkpedia-cf.mocchibird.com', 'other.example']) {
    assert.equal(await domainResponse(new Request(`https://${host}/`), () => assert.fail('unexpected proxy')), null);
  }
});

test('Preview uses only its isolated upstream and excludes account credentials', async () => {
  const response = await domainResponse(new Request('https://preview.arkpedia.net/music?view=library', {
    headers: { cookie: 'session=private', authorization: 'Bearer private' },
  }), async request => {
    assert.equal(request.url, 'https://arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev/music?view=library');
    assert.equal(request.headers.has('cookie'), false);
    assert.equal(request.headers.has('authorization'), false);
    assert.equal(request.redirect, 'manual');
    return new Response('demo', { headers: { 'set-cookie': 'unexpected=value' } });
  });
  assert.equal(await response.text(), 'demo');
  assert.equal(response.headers.has('set-cookie'), false);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('a protocol-relative path cannot select a different Preview upstream', async () => {
  await domainResponse(new Request('https://preview.arkpedia.net//untrusted.example/path'), async request => {
    assert.equal(new URL(request.url).origin, 'https://arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev');
    return new Response('demo');
  });
});

test('Preview account cookies reach only the isolated native Preview and return uncached', async () => {
  const response = await domainResponse(new Request('https://preview.arkpedia.net/api/auth/get-session', {
    headers: { cookie: 'arkpedia.session_token=test', origin: 'https://preview.arkpedia.net' },
  }), async request => {
    assert.equal(request.url, 'https://arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev/api/auth/get-session');
    assert.equal(request.headers.get('cookie'), 'arkpedia.session_token=test');
    assert.equal(request.headers.get('origin'), 'https://preview.arkpedia.net');
    return new Response('null', { headers: { 'set-cookie': 'arkpedia.session_token=new; Secure; HttpOnly; SameSite=Lax' } });
  });
  assert.match(response.headers.get('set-cookie'), /arkpedia.session_token=new/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('Preview keeps request bodies and rewrites only same-upstream redirects', async () => {
  const response = await domainResponse(new Request('https://preview.arkpedia.net/api/search', { method: 'POST', body: 'query' }), async request => {
    assert.equal(request.method, 'POST');
    assert.equal(await request.text(), 'query');
    return new Response(null, { status: 307, headers: { location: 'https://arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev/music?q=test' } });
  });
  assert.equal(response.headers.get('location'), 'https://preview.arkpedia.net/music?q=test');
});
