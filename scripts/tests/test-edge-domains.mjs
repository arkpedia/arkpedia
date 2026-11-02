import test from 'node:test';
import assert from 'node:assert/strict';
import { domainResponse } from '../../workers/edge/domains.mjs';

test('canonical account routes reach the production service; apex preserves the canonical redirect', async () => {
  for (const path of ['/api/auth/sign-in/social', '/api/auth/callback/google', '/api/cloud-account', '/api/account-profile', '/api/%61uth/get-session']) {
    assert.equal(await domainResponse(new Request(`https://www.arkpedia.net${path}`), () => assert.fail('production reached Preview')), null);
    const response = await domainResponse(new Request(`https://arkpedia.net${path}`));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), `https://www.arkpedia.net${path}`);
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


test('Preview community writes and private choices retain the login only for their exact routes',async()=>{
  for(const path of ['/api/community/sharing','/api/community/availability','/api/community/%73haring','/api/community/sharing/']){
    const response=await domainResponse(new Request(`https://preview.arkpedia.net${path}`,{headers:{cookie:'arkpedia.session_token=test'}}),async request=>{
      assert.equal(new URL(request.url).origin,'https://arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev');
      assert.equal(request.headers.get('cookie'),'arkpedia.session_token=test');
      return new Response('{}',{headers:{'set-cookie':'arkpedia.session_token=renewed; Secure; HttpOnly'}});
    });
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.ok(response.headers.has('set-cookie'));
    assert.equal(await domainResponse(new Request(`https://www.arkpedia.net${path}`)),null,'production routing is unchanged');
  }
  for(const path of ['/api/community/supports','/api/community/stats','/api/community/sharing-extra','/api/community/sharing/nested']){
    const response=await domainResponse(new Request(`https://preview.arkpedia.net${path}`,{headers:{cookie:'private',authorization:'Bearer private'}}),async request=>{
      assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('authorization'),false);
      return new Response('{}',{headers:{'set-cookie':'unexpected=value'}});
    });
    assert.equal(response.headers.has('set-cookie'),false);
  }
});
