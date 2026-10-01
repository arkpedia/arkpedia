/**
 * Reading a Global (Yostar) Arknights account, as the game client signs in, from the
 * reader's own browser (issue #94).
 *
 * Five requests, as ArkPRTS and Krooster make them:
 *   1. yostar/send-code   Yostar emails the reader a code.
 *   2. yostar/get-auth    the code for a Yostar token, then
 *      user/login         that token for the account's Yostar uid and access token.
 *   3. u8 getToken        those for a game token (signed, below).
 *   4. account/login      the game token for a session secret, at the game server.
 *   5. account/syncData   the account: operators, items, everything the game shows.
 *
 * Only the first two hosts answer a page's request (they allow any origin). The game
 * token exchange and the game server send no CORS headers, so the page talks to all of
 * them through relay.arkpedia.net (account-import/relay.ts), which carries TLS it cannot
 * read: the TLS runs in the page. Nothing here keeps anything. The email, the code and
 * every token live in the caller's memory for the length of one import.
 *
 * Every request goes through a Transport, so the tests drive the whole flow without a
 * network (scripts/tests/test-account-import.ts).
 */

export interface TransportRequest {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}
export interface TransportResponse {
  status: number;
  json: unknown;
}
export type Transport = (url: string, request: TransportRequest) => Promise<TransportResponse>;

/** The servers this reads. Global only for now; JP and KR differ only in these values. */
export const SERVERS = {
  en: {
    label: 'Global (EN)',
    yostar: 'https://en-sdk-api.yostarplat.com',
    pid: 'US-ARKNIGHTS',
    lang: 'en',
    networkConfig: 'https://ak-conf.arknights.global/config/prod/official/network_config',
  },
} as const;
export type ServerId = keyof typeof SERVERS;

/** The step a request belongs to, so a failure can say which one failed. */
export type ImportStep = 'send-code' | 'sign-in' | 'network' | 'game-token' | 'game-login' | 'account';

export class ImportError extends Error {
  constructor(readonly step: ImportStep, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

// What the Android client sends; the game server and the token exchange expect it.
const CLIENT_HEADERS = {
  'Content-Type': 'application/json',
  'X-Unity-Version': '2017.4.39f1',
  'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 11; KB2000 Build/RP1A.201005.001)',
};
// The keys the client signs its requests with, public in every open client (ArkPRTS).
const YOSTAR_SIGN_SALT = '886c085e4a8d30a703367b120dd8353948405ec2';
const U8_SIGN_KEY = '91240f70c09a08a6bc72af1a5c8d4670';
// The Yostar channel's id at the game token exchange.
const YOSTAR_CHANNEL = '3';

/** MD5 of a string's UTF-8 bytes, as lower-case hex. WebCrypto has no MD5, and the
 *  Yostar header signature is one. */
export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const length = ((bytes.length + 8) >>> 6) + 1;
  const words = new Uint32Array(length * 16);
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  words[length * 16 - 2] = (bytes.length * 8) >>> 0;
  words[length * 16 - 1] = Math.floor(bytes.length / 0x20000000);
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let block = 0; block < words.length; block += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const sum = (a + f + constants[i] + words[block + g]) >>> 0;
      const shift = shifts[round * 4 + (i % 4)];
      [a, d, c] = [d, c, b];
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    [a0, b0, c0, d0] = [(a0 + a) >>> 0, (b0 + b) >>> 0, (c0 + c) >>> 0, (d0 + d) >>> 0];
  }
  return [a0, b0, c0, d0].map((word) => Array.from({ length: 4 }, (_, i) => ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}

/** The Authorization header of a yostarplat.com request: a head the client describes
 *  itself with, signed over the body. */
export function yostarHeaders(body: string, server: ServerId, deviceId: string, now: number): Record<string, string> {
  const { pid, lang } = SERVERS[server];
  const head = {
    PID: pid, Channel: 'googleplay', Platform: 'android', Version: '4.10.0', GVersionNo: '2000112', GBuildNo: '',
    Lang: lang, DeviceID: deviceId, DeviceModel: 'F9', UID: '', Token: '', Time: Math.floor(now / 1000),
  };
  const sign = md5(JSON.stringify(head) + body + YOSTAR_SIGN_SALT).toUpperCase();
  return { ...CLIENT_HEADERS, Authorization: JSON.stringify({ Head: head, Sign: sign }) };
}

/** The token exchange's signature: HMAC-SHA1 over the fields as a query string, in key order. */
export async function u8Sign(fields: Record<string, string | number>): Promise<string> {
  const query = new URLSearchParams(Object.keys(fields).sort().map((key) => [key, String(fields[key])])).toString();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(U8_SIGN_KEY), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(query));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const object = (value: unknown): Record<string, any> => (value && typeof value === 'object' ? value as Record<string, any> : {});

async function post(transport: Transport, step: ImportStep, url: string, headers: Record<string, string>, body: unknown) {
  let response: TransportResponse;
  try {
    response = await transport(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (error) {
    throw new ImportError(step, `could not reach ${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (response.status < 200 || response.status >= 300) throw new ImportError(step, `${new URL(url).host} answered HTTP ${response.status}`);
  return object(response.json);
}

/** A yostarplat.com call, which answers {Code: 200, Data} or another Code with a Msg. */
async function yostar(transport: Transport, step: ImportStep, server: ServerId, path: string, body: unknown, deviceId: string, now: () => number) {
  const text = JSON.stringify(body);
  const answer = await post(transport, step, `${SERVERS[server].yostar}/${path}`, yostarHeaders(text, server, deviceId, now()), body);
  if (answer.Code !== 200) throw new ImportError(step, `Yostar refused ${path}: ${answer.Msg ?? `code ${answer.Code}`}`);
  return object(answer.Data);
}

export interface FlowOptions {
  transport: Transport;
  server: ServerId;
  /** One random id for the whole import, as one device signing in. */
  deviceId: string;
  now?: () => number;
}

/** Step 1: Yostar emails the code. */
export async function sendCode({ transport, server, deviceId, now = Date.now }: FlowOptions, email: string): Promise<void> {
  await yostar(transport, 'send-code', server, 'yostar/send-code', { Account: email, Randstr: '', Ticket: '' }, deviceId, now);
}

export interface YostarAccount {
  uid: string;
  token: string;
}

/** Step 2: the emailed code for the account's Yostar uid and access token. */
export async function signIn({ transport, server, deviceId, now = Date.now }: FlowOptions, email: string, code: string): Promise<YostarAccount> {
  const auth = await yostar(transport, 'sign-in', server, 'yostar/get-auth', { Account: email, Code: code }, deviceId, now);
  if (typeof auth.Token !== 'string') throw new ImportError('sign-in', 'Yostar accepted the code but sent no token');
  const login = await yostar(transport, 'sign-in', server, 'user/login', {
    CheckAccount: 0,
    Geetest: { CaptchaID: null, CaptchaOutput: null, GenTime: null, LotNumber: null, PassToken: null },
    OpenID: email, Secret: '', Token: auth.Token, Type: 'yostar', UserName: email,
  }, deviceId, now);
  const user = object(login.UserInfo);
  if (user.ID == null || typeof user.Token !== 'string') throw new ImportError('sign-in', 'Yostar signed in but sent no account');
  return { uid: String(user.ID), token: user.Token };
}

/** Where the game's token exchange, game server and version file are. */
export interface Network {
  u8: string;
  gs: string;
  hv: string;
}

/** The game's server list, as the client reads it on start. The page reads it first,
 *  through the relay, so it also opens the encrypted connection before it is needed. */
export async function readNetwork(transport: Transport, server: ServerId): Promise<Network> {
  try {
    const answer = object((await transport(SERVERS[server].networkConfig, { method: 'GET', headers: CLIENT_HEADERS })).json);
    const content = JSON.parse(answer.content);
    const network = content.configs[content.funcVer].network;
    if (!network?.u8 || !network?.gs || !network?.hv) throw new Error('missing u8, gs or hv');
    return { u8: network.u8, gs: network.gs, hv: network.hv };
  } catch (error) {
    throw new ImportError('network', `the game's server list could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface AccountOptions {
  transport: Transport;
  /** For the game's version file, which allows any origin and is not on the relay's
   *  list: the page's own fetch. */
  direct: Transport;
  deviceId: string;
  network: Network;
  /** Told as each step starts, for a progress list. */
  onStep?: (step: ImportStep) => void;
}

/** Steps 3 to 5: the account's game data, as syncData sends it (its `user`). */
export async function readAccount({ transport, direct, deviceId, network, onStep = () => {} }: AccountOptions, account: YostarAccount): Promise<Record<string, any>> {
  onStep('game-token');
  const fields: Record<string, string | number> = {
    appId: '1', platform: 1, channelId: YOSTAR_CHANNEL, subChannel: YOSTAR_CHANNEL, worldId: YOSTAR_CHANNEL,
    extension: JSON.stringify({ type: 1, uid: account.uid, token: account.token }),
    deviceId, deviceId2: '', deviceId3: '',
  };
  const u8 = await post(transport, 'game-token', `${network.u8}/user/v1/getToken`, CLIENT_HEADERS, { ...fields, sign: await u8Sign(fields) });
  if (u8.result !== 0 || typeof u8.token !== 'string') throw new ImportError('game-token', `the game refused the Yostar sign-in (result ${u8.result ?? 'none'})`);

  onStep('game-login');
  let version: Record<string, any>;
  try {
    version = object((await direct(network.hv.replace('{0}', 'Android'), { method: 'GET', headers: {} })).json);
  } catch (error) {
    throw new ImportError('game-login', `the game's version could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const login = await post(transport, 'game-login', `${network.gs}/account/login`, { ...CLIENT_HEADERS, secret: '', seqnum: '1', uid: String(u8.uid) }, {
    platform: 1, networkVersion: '1', assetsVersion: version.resVersion, clientVersion: version.clientVersion,
    token: u8.token, uid: String(u8.uid), deviceId, deviceId2: '', deviceId3: '',
  });
  if (login.result !== 0 || typeof login.secret !== 'string') throw new ImportError('game-login', `the game server refused the login (result ${login.result ?? 'none'})`);

  onStep('account');
  const data = await post(transport, 'account', `${network.gs}/account/syncData`, { ...CLIENT_HEADERS, secret: login.secret, seqnum: '2', uid: String(login.uid) }, { platform: 1 });
  if (data.result !== 0 || !data.user) throw new ImportError('account', `the game server sent no account (result ${data.result ?? 'none'})`);
  return object(data.user);
}
