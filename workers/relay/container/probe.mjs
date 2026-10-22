// Checks a running relay from outside, with the same TLS-through-the-tunnel the site uses:
//
//   cd workers/relay/container && npm ci
//   node probe.mjs wss://arkpedia-relay.<account>.workers.dev/wisp/ https://arkpedia.<account>.workers.dev
//
// The second argument is the page origin the relay serves. Every host the import uses should
// complete a TLS handshake; every other destination, and a foreign Origin, should be refused.
// Prints how long the relay took to answer (a cold start if it was asleep). Exits 1 on a surprise.
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import { Duplex } from 'node:stream';
import { client as wisp } from '@mercuryworkshop/wisp-js/client';

const [RELAY, SITE] = process.argv.slice(2);
if (!RELAY || !SITE) {
  console.error('usage: node probe.mjs <relay wss:// url> <site origin>');
  process.exit(2);
}
let origin = SITE;
// wisp-js opens its WebSocket through http(s).request in Node; this sets the Origin it sends.
for (const mod of [https, http]) {
  const request = mod.request;
  mod.request = function (opts, ...rest) {
    if (opts && typeof opts === 'object') opts.headers = { ...(opts.headers || {}), Origin: origin };
    return request.call(this, opts, ...rest);
  };
}

async function connect() {
  const conn = new wisp.ClientConnection(RELAY);
  await new Promise((resolve, reject) => {
    conn.onopen = resolve;
    conn.onerror = () => reject(new Error('refused'));
    setTimeout(() => reject(new Error('timeout')), 30000);
  });
  return conn;
}

// One stream per check, closed after it: the relay allows a visitor only a few at once.
function handshake(conn, host, port) {
  return new Promise((done) => {
    const stream = conn.create_stream(host, port);
    const resolve = (result) => { try { stream.close(); } catch {} done(result); };
    const raw = new Duplex({ read() {}, write(chunk, _enc, cb) { stream.send(new Uint8Array(chunk)); cb(); }, final(cb) { cb(); } });
    stream.onmessage = (data) => raw.push(Buffer.from(data));
    stream.onclose = () => raw.push(null);
    const timer = setTimeout(() => resolve('timeout'), 10000);
    raw.on('end', () => { clearTimeout(timer); resolve('refused'); });
    const isIp = /^[\d.]+$|:/.test(host);
    const secure = tls.connect({ socket: raw, ...(isIp ? {} : { servername: host }), rejectUnauthorized: true }, () => { clearTimeout(timer); secure.destroy(); resolve('open'); });
    secure.on('error', () => { clearTimeout(timer); resolve('refused'); });
  });
}

const results = [];
const expect = (label, got, want) => { results.push(got === want); console.log(`${got === want ? 'ok  ' : 'FAIL'} ${label}: ${got} (expected ${want})`); };

const start = Date.now();
const conn = await connect();
console.log(`relay answered after ${Date.now() - start} ms`);
// Every host and port the import reaches (lib/account-import/yostar.ts SERVERS and their
// network configs; KR's game server is on 443).
for (const [host, port] of [
  ['en-sdk-api.yostarplat.com', 443], ['jp-sdk-api.yostarplat.com', 443],
  ['as.arknights.global', 443], ['gs.arknights.global', 8443], ['ak-conf.arknights.global', 443],
  ['as.arknights.jp', 443], ['gs.arknights.jp', 8443], ['ak-conf.arknights.jp', 443],
  ['as.arknights.kr', 443], ['gs.arknights.kr', 443], ['ak-conf.arknights.kr', 443],
  ['account.yo-star.com', 443], ['account.yostar.co.jp', 443], ['account.yostar.kr', 443],
]) expect(`${host}:${port}`, await handshake(conn, host, port), 'open');
for (const [host, port, why] of [
  ['192.168.1.1', 80, 'a private address'], ['127.0.0.1', 22, 'loopback'], ['localhost', 443, 'localhost'],
  ['100.100.100.100', 80, 'a CGNAT/VPN address'], ['169.254.169.254', 80, 'the cloud metadata address'],
  ['1.1.1.1', 443, 'a raw IP'], ['example.com', 443, 'a host not on the list'],
  [new URL(RELAY).hostname, 443, 'the relay itself'], ['gs.arknights.global', 22, 'an allowed host on another port'],
]) expect(why, await handshake(conn, host, port), 'refused');
conn.close();

origin = 'https://not-an-allowed-site.example';
expect('a page from another origin', await connect().then((c) => { c.close(); return 'open'; }, () => 'refused'), 'refused');
process.exit(results.every(Boolean) ? 0 : 1);
