import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { ImportError, md5, pullRow, readAccount, readNetwork, readPulls, sendCode, sessionCookie, signIn, u8Sign, yostarHeaders, type Transport, type TransportRequest, type TransportResponse } from '../../lib/account-import/yostar';

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
  // The code's own token comes back too: the Account Center signs in with it (readPulls).
  assert.deepEqual(account, { uid: '4242', token: 'yostar-token', authToken: 'code-token' });
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
  await refusal(readAccount({ transport: relay, direct, deviceId: 'd', network: await readNetwork(relay, 'en') }, { uid: '1', token: 't', authToken: 'a' }), 'game-token', /result 4/);
  await refusal(readNetwork(server({ 'https://ak-conf.arknights.global/config/prod/official/network_config': { content: '{}' } }).relay, 'en'), 'network', /server list could not be read/);
  // A transport that cannot connect (the relay refusing a host, the network down).
  const down: Transport = async () => { throw new Error('Request failed with error code 35: SSL connect error'); };
  await refusal(sendCode({ transport: down, server: 'en', deviceId: 'd' }, 'a@b.c'), 'send-code', /could not reach en-sdk-api\.yostarplat\.com: .*SSL connect error/);
});

test('no login is kept: the sign-in removes the one an earlier build saved, and writes none', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync('components/account-import/GameSignIn.tsx', 'utf8');
  assert.match(source, /removeItem\(LEGACY_LOGIN_KEY\)/);
  assert.doesNotMatch(source, /setItem/);
  assert.ok(!fs.existsSync('lib/account-import/savedLogin.ts'));
});

test('the relay address is config/relay.json\'s, a wss:// Wisp endpoint', async () => {
  const { RELAY_URL } = await import('../../lib/account-import/relay');
  const config = (await import('../../config/relay.json')).default as { url: string };
  assert.equal(RELAY_URL, config.url);
  // libcurl.js needs the trailing slash, and only an encrypted WebSocket is acceptable.
  assert.match(RELAY_URL, /^wss:\/\/[a-z0-9.-]+\/wisp\/$/);
});

/* The Account Center: a sign-in that sets the session in two cookies, then the pull history a
   page at a time. `pages` is how many full pages of 50 there are before the last short one. */
function accountCenter({ pages = 1, cookies = ['YSSID=session-id; Path=/; HttpOnly', 'YSSID.sig=session-sig; Path=/; HttpOnly'], login = 200 } = {}) {
  const calls: { url: string; request: TransportRequest }[] = [];
  const row = (n: number) => ({ charId: `char_${n}_test`, charName: `Test ${n}`, star: n > 0 && n % 7 === 0 ? '6' : '3', poolId: 'LIMITED_EN_41_0_1', poolName: 'A Limited Banner', typeName: 'Limited', at: String(1_790_000_000 - Math.floor(n / 10)) });
  const transport: Transport = async (url, request): Promise<TransportResponse> => {
    calls.push({ url, request });
    if (url === 'https://account.yo-star.com/api/user/login') return { status: login, json: { code: 0 }, headers: [['content-type', 'application/json'], ...cookies.map((value) => ['Set-Cookie', value] as [string, string])] };
    const index = Number(new URL(url).searchParams.get('index'));
    const count = index <= pages ? 50 : 7;
    return { status: 200, json: { code: 0, data: { rows: Array.from({ length: count }, (_, i) => row((index - 1) * 50 + i)), count: pages * 50 + 7 } } };
  };
  return { calls, transport };
}

test('the pull history: the Account Center signed in with the code token, then every page read with its session', async () => {
  const site = accountCenter({ pages: 2 });
  const rows = await readPulls(site.transport, 'doctor@example.com', { uid: '4242', token: 'yostar-token', authToken: 'code-token' });
  assert.equal(rows.length, 107);
  assert.deepEqual(rows[0], { at: 1_790_000_000, poolId: 'LIMITED_EN_41_0_1', poolName: 'A Limited Banner', charId: 'char_0_test', charName: 'Test 0', star: 3 });
  assert.equal(rows[7].star, 6, 'the star arrives as a string and is read as a number');
  const [login, ...pages] = site.calls;
  assert.equal(login.request.method, 'POST');
  assert.deepEqual(JSON.parse(login.request.body!), { channel: 'yostar', token: 'code-token', openId: 'doctor@example.com', account: 'doctor@example.com', checkAccount: false });
  assert.equal(login.request.headers.Origin, 'https://account.yo-star.com');
  // Three pages (50, 50, then 7), each with the session the sign-in set, and nothing after the short one.
  assert.deepEqual(pages.map((call) => call.url), [1, 2, 3].map((index) => `https://account.yo-star.com/api/game/gachas?key=ark&index=${index}&size=50`));
  assert.ok(pages.every((call) => call.request.method === 'GET' && call.request.headers.Cookie === 'YSSID=session-id; YSSID.sig=session-sig'));
});

test('a pull history the Account Center will not give is an ImportError of its own step, and a malformed row is left out', async () => {
  const refusal = async (promise: Promise<unknown>, message: RegExp) => {
    const error = await promise.then(() => null, (thrown) => thrown);
    assert.ok(error instanceof ImportError && error.step === 'pulls' && message.test(error.message), String(error));
  };
  const account = { uid: '1', token: 't', authToken: 'a' };
  await refusal(readPulls(accountCenter({ cookies: ['YSSID=only-half; Path=/'] }).transport, 'a@b.c', account), /did not sign in/);
  await refusal(readPulls(accountCenter({ login: 403 }).transport, 'a@b.c', account), /HTTP 403/);
  await refusal(readPulls(async () => { throw new Error('the relay refused the host'); }, 'a@b.c', account), /could not reach the Account Center: the relay refused the host/);
  // Cookies: two Set-Cookie lines, any case, attributes dropped; a name merely starting with YSSID is not it.
  assert.equal(sessionCookie([['set-cookie', 'YSSID.sig=s; Path=/'], ['SET-COOKIE', 'YSSID=i; Secure'], ['Set-Cookie', 'YSSIDX=no']]), 'YSSID=i; YSSID.sig=s');
  assert.equal(sessionCookie(undefined), null);
  assert.equal(pullRow({ charId: 'char_1_a', poolId: 'P', at: 0 }), null, 'no time');
  assert.equal(pullRow({ charId: '../x', poolId: 'P', at: 5 }), null, 'not an id');
  assert.deepEqual(pullRow({ charId: 'char_1_a', poolId: 'P', at: 5, star: 9 }), { at: 5, poolId: 'P', poolName: null, charId: 'char_1_a', charName: null, star: null });
});

test('the sign-in reads the pull history after the account, and a history it cannot read stops nothing', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync('components/account-import/GameSignIn.tsx', 'utf8');
  const read = source.slice(source.indexOf('async function read('), source.indexOf('async function onImport'));
  assert.ok(read.indexOf('readAccount(') < read.indexOf('readPulls('), 'the account first');
  assert.match(read, /try \{\s*pulls = \{ rows: await readPulls\(/);
  assert.match(read, /catch \(error\) \{\s*pulls = \{ rows: null, error: describe\(error\) \};/);
});
