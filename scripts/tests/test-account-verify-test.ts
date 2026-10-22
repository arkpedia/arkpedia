// TEST ONLY route (pages/api/account-verify-test.ts): remove this file with it.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { NextApiRequest, NextApiResponse } from 'next';

const network = { u8: 'https://as.example/u8', gs: 'https://gs.example:8443', hv: 'https://static.example/{0}/version' };
const calls: { url: string; body?: string }[] = [];
// Mocked before the route is imported: it builds its network reader on the fetch it finds then.
mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
  calls.push({ url: String(url), body: init?.body == null ? undefined : String(init.body) });
  if (String(url).endsWith('/user/v1/getToken')) return Response.json({ result: 0, uid: '777', token: 'GAME-TOKEN-SECRET' });
  return Response.json({ content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network } } }) });
});
const route = import('../../pages/api/account-verify-test');

const own = { host: 'arkpedia.example.workers.dev', origin: 'https://arkpedia.example.workers.dev' };
const input = { server: 'en', uid: '123456', token: 'YOSTAR-ACCESS-TOKEN', deviceId: 'device-1', saveUid: '777' };
interface Answer { statusCode: number; body?: Record<string, unknown> }
function call(body: unknown, headers: Record<string, string> = own, method = 'POST'): Promise<Answer> {
  return new Promise(resolve => {
    const res = {
      statusCode: 200, body: undefined as Record<string, unknown> | undefined,
      setHeader() { return res; },
      status(code: number) { res.statusCode = code; return res; },
      json(value: Record<string, unknown>) { res.body = value; resolve(res); return res; },
      end() { resolve(res); return res; },
    };
    void route.then(({ default: handler }) => handler({ method, headers, body } as unknown as NextApiRequest, res as unknown as NextApiResponse));
  });
}
const sentUid = () => JSON.parse(JSON.parse(calls.find(entry => entry.url.endsWith('/user/v1/getToken'))!.body!).extension).uid;

test('the verification test route is inert except on the Worker\'s workers.dev address', async () => {
  for (const host of ['www.arkpedia.net', 'arkpedia-dev.vercel.app', 'workers.dev.example.com']) {
    assert.equal((await call(input, { host, origin: `https://${host}` })).statusCode, 404, host);
  }
  assert.equal(calls.length, 0, 'nothing is sent anywhere');
});

test('it answers only a POST from its own pages, with well-formed input, before calling out', async () => {
  assert.equal((await call(input, own, 'GET')).statusCode, 405);
  assert.equal((await call(input, { ...own, origin: 'https://elsewhere.example' })).statusCode, 403);
  assert.equal((await call(input, { host: own.host })).statusCode, 403, 'no Origin');
  for (const bad of [{ ...input, uid: '12a' }, { ...input, server: 'cn' }, { ...input, token: 'short' }, { ...input, saveUid: undefined }]) {
    assert.equal((await call(bad)).statusCode, 400);
  }
  assert.equal(calls.length, 0);
});

test('one call to the token exchange, and only the verdict back: never a token', async () => {
  calls.length = 0;
  const answer = await call(input);
  assert.equal(answer.statusCode, 200);
  assert.equal(calls.filter(entry => entry.url === `${network.u8}/user/v1/getToken`).length, 1);
  assert.equal(sentUid(), '123456');
  assert.equal(answer.body?.accepted, true);
  assert.equal(answer.body?.gameUidIsTheSaves, true);
  const text = JSON.stringify(answer.body);
  assert.ok(!text.includes('YOSTAR-ACCESS-TOKEN') && !text.includes('GAME-TOKEN-SECRET'), text);
  assert.deepEqual(Object.keys(answer.body!).sort(), ['accepted', 'check', 'colo', 'gameUidIsTheSaves', 'ms', 'namesAGameUid', 'result', 'server']);

  calls.length = 0;
  const wrong = await call({ ...input, wrongUid: true });
  assert.equal(sentUid(), '123457', 'the same token with the uid plus one');
  assert.equal(wrong.body?.check, 'wrong-uid');
});
