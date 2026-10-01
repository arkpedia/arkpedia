import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { ImportError, md5, readAccount, readNetwork, sendCode, signIn, u8Sign, yostarHeaders, type Transport, type TransportRequest } from '../../lib/account-import/yostar';

test('md5 matches Node for empty, block-boundary, long and non-ASCII input', () => {
  for (const text of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000), 'doctor@exämple.com 日本']) {
    assert.equal(md5(text), createHash('md5').update(text, 'utf8').digest('hex'), JSON.stringify(text.slice(0, 12)));
  }
});

test('a Yostar request is signed over its head and body, as the client signs it', () => {
  const body = JSON.stringify({ Account: 'doctor@example.com', Randstr: '', Ticket: '' });
  const headers = yostarHeaders(body, 'en', 'device-1', 1_790_000_000_500);
  const { Head, Sign } = JSON.parse(headers.Authorization);
  assert.deepEqual([Head.PID, Head.Lang, Head.DeviceID, Head.Time], ['US-ARKNIGHTS', 'en', 'device-1', 1_790_000_000]);
  assert.equal(Sign, createHash('md5').update(JSON.stringify(Head) + body + '886c085e4a8d30a703367b120dd8353948405ec2').digest('hex').toUpperCase());
});

test('the game token request is signed with HMAC-SHA1 over its fields in key order', async () => {
  const fields = { platform: 1, appId: '1', extension: '{"type":1}', deviceId: 'd' };
  const query = 'appId=1&deviceId=d&extension=%7B%22type%22%3A1%7D&platform=1';
  assert.equal(await u8Sign(fields), createHmac('sha1', '91240f70c09a08a6bc72af1a5c8d4670').update(query).digest('hex'));
});

const NETWORK = { content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network: { u8: 'https://as.example/u8', gs: 'https://gs.example:8443', hv: 'https://static.example/{0}/version' } } } }) };

/** A server that answers each address with a canned reply, and records every request. */
function server(answers: Record<string, unknown>) {
  const calls: { url: string; request: TransportRequest; via: string }[] = [];
  const make = (via: string): Transport => async (url, request) => {
    calls.push({ url, request, via });
    if (!(url in answers)) throw new Error(`unexpected ${url}`);
    return { status: 200, json: answers[url] };
  };
  return { calls, relay: make('relay'), direct: make('direct') };
}

const ANSWERS = {
  'https://en-sdk-api.yostarplat.com/yostar/send-code': { Code: 200, Data: {} },
  'https://en-sdk-api.yostarplat.com/yostar/get-auth': { Code: 200, Data: { Token: 'code-token' } },
  'https://en-sdk-api.yostarplat.com/user/login': { Code: 200, Data: { UserInfo: { ID: 4242, Token: 'yostar-token' } } },
  'https://ak-conf.arknights.global/config/prod/official/network_config': NETWORK,
  'https://as.example/u8/user/v1/getToken': { result: 0, uid: '99', token: 'u8-token' },
  'https://static.example/Android/version': { resVersion: 'res-1', clientVersion: 'client-1' },
  'https://gs.example:8443/account/login': { result: 0, uid: '99', secret: 'session-secret' },
  'https://gs.example:8443/account/syncData': { result: 0, user: { status: { nickName: 'Doctor', nickNumber: '1234' }, troop: { chars: {} } } },
};

test('the import makes the five requests in order, each through the transport it needs', async () => {
  const { calls, relay, direct } = server(ANSWERS);
  const options = { transport: relay, server: 'en' as const, deviceId: 'device-1', now: () => 1_790_000_000_000 };
  // The page reads the server list first, when the reader starts typing.
  const network = await readNetwork(relay, 'en');
  assert.deepEqual(network, { u8: 'https://as.example/u8', gs: 'https://gs.example:8443', hv: 'https://static.example/{0}/version' });
  await sendCode(options, 'doctor@example.com');
  const account = await signIn(options, 'doctor@example.com', '123456');
  assert.deepEqual(account, { uid: '4242', token: 'yostar-token' });
  const steps: string[] = [];
  const user = await readAccount({ transport: relay, direct, deviceId: 'device-1', network, onStep: (step) => steps.push(step) }, account);
  assert.equal(user.status.nickName, 'Doctor');
  assert.deepEqual(steps, ['game-token', 'game-login', 'account']);

  // Only the version file, which allows any origin, goes by the page's own fetch.
  const order = Object.keys(ANSWERS);
  order.unshift(...order.splice(3, 1));
  assert.deepEqual(calls.map((call) => [call.via, call.url]), order.map((url) => [url.includes('static.example') ? 'direct' : 'relay', url]));
  const body = (url: string) => JSON.parse(calls.find((call) => call.url === url)!.request.body!);
  const headers = (url: string) => calls.find((call) => call.url === url)!.request.headers;
  assert.deepEqual(body('https://en-sdk-api.yostarplat.com/yostar/get-auth'), { Account: 'doctor@example.com', Code: '123456' });
  assert.equal(body('https://en-sdk-api.yostarplat.com/user/login').Token, 'code-token');

  // The token request carries the Yostar account, one device id, and a valid signature.
  const { sign, ...fields } = body('https://as.example/u8/user/v1/getToken');
  assert.deepEqual(JSON.parse(fields.extension), { type: 1, uid: '4242', token: 'yostar-token' });
  assert.deepEqual([fields.channelId, fields.deviceId], ['3', 'device-1']);
  assert.equal(sign, await u8Sign(fields));

  // The game server: the login with the client's versions, then the data with the session.
  const login = body('https://gs.example:8443/account/login');
  assert.deepEqual([login.token, login.uid, login.assetsVersion, login.clientVersion, login.deviceId], ['u8-token', '99', 'res-1', 'client-1', 'device-1']);
  assert.deepEqual([headers('https://gs.example:8443/account/login').seqnum, headers('https://gs.example:8443/account/login').secret], ['1', '']);
  const sync = headers('https://gs.example:8443/account/syncData');
  assert.deepEqual([sync.secret, sync.uid, sync.seqnum], ['session-secret', '99', '2']);
});

test('a refusal names the step that failed and what the server said', async () => {
  const options = (answers: Record<string, unknown>) => ({ transport: server(answers).relay, server: 'en' as const, deviceId: 'd' });
  const refusal = async (promise: Promise<unknown>, step: string, message: RegExp) => {
    const error = await promise.then(() => null, (caught) => caught);
    assert.ok(error instanceof ImportError, String(error));
    assert.equal(error.step, step);
    assert.match(error.message, message);
  };
  await refusal(sendCode(options({ ...ANSWERS, 'https://en-sdk-api.yostarplat.com/yostar/send-code': { Code: 100403, Msg: 'Too many requests' } }), 'a@b.c'),
    'send-code', /Yostar refused yostar\/send-code: Too many requests/);
  await refusal(signIn(options({ ...ANSWERS, 'https://en-sdk-api.yostarplat.com/yostar/get-auth': { Code: 100110, Msg: 'Wrong code' } }), 'a@b.c', '1'),
    'sign-in', /Wrong code/);
  const { relay, direct } = server({ ...ANSWERS, 'https://as.example/u8/user/v1/getToken': { result: 4 } });
  await refusal(readAccount({ transport: relay, direct, deviceId: 'd', network: await readNetwork(relay, 'en') }, { uid: '1', token: 't' }), 'game-token', /result 4/);
  await refusal(readNetwork(server({ 'https://ak-conf.arknights.global/config/prod/official/network_config': { content: '{}' } }).relay, 'en'), 'network', /server list could not be read/);
  // A transport that cannot connect (the relay refusing a host, the network down).
  const down: Transport = async () => { throw new Error('Request failed with error code 35: SSL connect error'); };
  await refusal(sendCode({ transport: down, server: 'en', deviceId: 'd' }, 'a@b.c'), 'send-code', /could not reach en-sdk-api\.yostarplat\.com: .*SSL connect error/);
});
