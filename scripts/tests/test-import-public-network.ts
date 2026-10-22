import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createPublicNetworkReader } from '../../lib/account-import/publicNetwork';
import { createNetworkTransport } from '../../lib/account-import/relay';
import { SERVER_IDS, SERVERS, type Transport } from '../../lib/account-import/yostar';

const network = { u8: 'https://as.example/u8', gs: 'https://gs.example:8443', hv: 'https://static.example/{0}/version' };
const answer = { content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network } } }) };

test('public metadata coalesces concurrent reads, expires, and stays separate for all three servers', async () => {
  let now = 1000;
  const calls: string[] = [];
  const read = createPublicNetworkReader(async (url, init) => {
    calls.push(String(url));
    // Options a Cloudflare Worker accepts (it throws on `credentials` and on redirect: 'error').
    assert.equal(init?.credentials, undefined);
    assert.equal(init?.redirect, 'manual');
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
    assert.equal(init?.body, undefined);
    return Response.json({ ...answer, ignored: 'not cached' });
  }, () => now);
  for (const server of SERVER_IDS) {
    assert.deepEqual(await Promise.all([read(server), read(server)]), [answer, answer]);
    assert.deepEqual(await read(server), answer);
  }
  assert.deepEqual(calls, SERVER_IDS.map(server => SERVERS[server].networkConfig));
  now += 60_000;
  await read('en');
  assert.equal(calls.length, 4);
});

test('a redirect is a failure, never followed to another address', async () => {
  const read = createPublicNetworkReader(async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/config' } }));
  await assert.rejects(read('en'), /Public server list unavailable/);
});

test('failed, malformed and unsafe metadata are never cached or served stale', async () => {
  for (const value of [null, { content: '{}' }, { content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network: { ...network, gs: 'http://gs.example' } } } }) }]) {
    let calls = 0;
    let now = 0;
    const read = createPublicNetworkReader(async () => {
      calls++;
      return Response.json(calls === 1 || calls === 3 ? answer : value, { status: value === null && calls === 2 ? 503 : 200 });
    }, () => now);
    await read('en');
    now = 60_000;
    await assert.rejects(read('en'));
    assert.deepEqual(await read('en'), answer);
    assert.equal(calls, 3);
  }
});

test('only a public GET can use the cache or its relay fallback; no credentials reach the website', async () => {
  const calls: { via: string; url: string; request: unknown }[] = [];
  let status = 200;
  let json: unknown = answer;
  const transport = (via: string): Transport => async (url, request) => {
    calls.push({ via, url, request });
    return { status: via === 'cache' ? status : 200, json };
  };
  const read = createNetworkTransport(transport('cache'), transport('relay'));
  for (const server of SERVER_IDS) {
    const request = { method: 'GET' as const, headers: { 'User-Agent': 'game-client' } };
    await read(SERVERS[server].networkConfig, request);
    assert.deepEqual(calls.pop(), { via: 'cache', url: `/api/account-import/network?server=${server}`, request: { method: 'GET', headers: {} } });
  }
  for (const failure of ['http', 'malformed']) {
    status = failure === 'http' ? 503 : 200;
    json = failure === 'malformed' ? {} : answer;
    await read(SERVERS.en.networkConfig, { method: 'GET', headers: {} });
    assert.deepEqual(calls.splice(0).map(call => call.via), ['cache', 'relay']);
  }
  for (const url of [SERVERS.en.yostar + '/yostar/send-code', 'https://example.invalid/']) {
    await assert.rejects(read(url, { method: 'POST', headers: {}, body: 'private' }), /Not a public/);
  }
  await assert.rejects(read(SERVERS.en.networkConfig, { method: 'GET', headers: {}, body: 'private' }), /Not a public/);
  assert.equal(calls.length, 0);
});

test('public API rejects private input and arbitrary destinations before fetching', async () => {
  let calls = 0;
  const mocked = mock.method(globalThis, 'fetch', async () => { calls++; return Response.json(answer); });
  try {
    const handler = (await import('../../pages/api/account-import/network')).default;
    const invoke = async (method: string, query: Record<string, unknown>) => {
      const headers = new Map<string, string>();
      const res = { code: 0, body: undefined as unknown, setHeader: (key: string, value: string) => headers.set(key, value),
        status(code: number) { this.code = code; return this; }, end() { return this; }, json(body: unknown) { this.body = body; return this; } };
      await handler({ method, query } as never, res as never);
      return { ...res, headers };
    };
    assert.equal((await invoke('POST', { server: 'en' })).code, 405);
    for (const query of [{ server: 'toString' }, { server: ['en', 'jp'] }, { server: 'https://example.invalid' }, { server: 'en', email: 'private' }]) {
      const res = await invoke('GET', query);
      assert.equal(res.code, 400);
      assert.equal(res.headers.get('Cache-Control'), 'no-store');
    }
    assert.equal(calls, 0);
    const res = await invoke('GET', { server: 'en' });
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, answer);
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=60');
    assert.equal(calls, 1);
  } finally { mocked.mock.restore(); }
});
