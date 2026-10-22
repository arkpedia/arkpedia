/* The account-import relay on Cloudflare (workers/relay): what its Worker lets through, what it
   passes the container, and the settings that keep it from logging or reading the traffic. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import relay from '../../config/relay.json';
import { containerEnv, refusal, siteOrigin } from '../../workers/relay/gate.mjs';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const jsonc = (file: string) => JSON.parse(read(file).replace(/^\s*\/\/.*$/gm, ''));
const wrangler = jsonc('workers/relay/wrangler.jsonc');
const worker = read('workers/relay/worker.mjs');
const server = read('workers/relay/container/server.mjs');
const code = (text: string) => text.replace(/^\s*\/\/.*$/gm, '');

const RELAY = 'https://arkpedia-relay.account.workers.dev/wisp/';
const ask = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

test('the relay serves the site\'s own Worker on its workers.dev account, and no other page', () => {
  const origin = siteOrigin(relay, RELAY);
  assert.equal(origin, 'https://arkpedia.account.workers.dev');
  assert.equal(siteOrigin(relay, 'https://relay.example.org/wisp/'), null, 'off workers.dev it serves nobody');
  const socket = { Upgrade: 'websocket' };
  assert.equal(refusal(ask(RELAY, { ...socket, Origin: origin! }), origin), 0);
  for (const other of ['https://www.arkpedia.net', 'https://arkpedia-dev.vercel.app', 'https://other.account.workers.dev', 'https://arkpedia.account.workers.dev.example.com']) {
    assert.equal(refusal(ask(RELAY, { ...socket, Origin: other }), origin), 403, other);
  }
  assert.equal(refusal(ask(RELAY, socket), origin), 403, 'no Origin');
  assert.equal(refusal(ask(RELAY, { Origin: origin! }), origin), 403, 'not a WebSocket');
  assert.equal(refusal(ask('https://arkpedia-relay.account.workers.dev/', { ...socket, Origin: origin! }), origin), 404);
  assert.equal(refusal(ask(RELAY, { ...socket, Origin: 'https://arkpedia.account.workers.dev' }), null), 403);
});

test('the container gets config/relay.json\'s hosts, ports and stream limit, and the one origin', () => {
  const env = containerEnv(relay, 'https://arkpedia.account.workers.dev');
  assert.deepEqual(JSON.parse(env.ARKRELAY_ALLOWED_HOSTS), relay.allowedHosts);
  assert.deepEqual(JSON.parse(env.ARKRELAY_PORTS), [443, 8443]);
  assert.equal(env.ARKRELAY_STREAMS, '8');
  assert.deepEqual(JSON.parse(env.ARKRELAY_ORIGINS), ['https://arkpedia.account.workers.dev']);
  assert.deepEqual(JSON.parse(containerEnv(relay, null).ARKRELAY_ORIGINS), []);
});

test('the names line up: the relay Worker is config/relay.json\'s, and siteWorker is the site\'s', () => {
  assert.equal(wrangler.name, relay.cloudflare.worker);
  assert.equal(relay.cloudflare.siteWorker, jsonc('wrangler.jsonc').name);
});

test('the relay keeps no logs, runs one small instance and limits each address as nginx does', () => {
  assert.equal(wrangler.observability.enabled, false);
  assert.equal(wrangler.preview_urls, false);
  assert.deepEqual(wrangler.containers.map((c: Record<string, unknown>) => [c.class_name, c.image, c.instance_type, c.max_instances]), [['Relay', './container/Dockerfile', 'lite', 1]]);
  assert.deepEqual(wrangler.ratelimits.map((r: { name: string; simple: unknown }) => [r.name, r.simple]), [['VISITORS', { limit: 20, period: 60 }]]);
  assert.match(worker, /env\.VISITORS\.limit\(/);
  assert.match(code(server), /logging\.set_level\(logging\.NONE\)/);
  assert.doesNotMatch(code(server), /console\.(log|info|debug)/);
});

test('the container\'s traffic never goes through Cloudflare\'s HTTP proxy, which could read it', () => {
  for (const option of ['allowedHosts', 'deniedHosts', 'interceptHttps', 'outbound', 'ContainerProxy']) {
    assert.doesNotMatch(code(worker), new RegExp(`\\b${option}\\b`), `${option} on the relay`);
  }
  assert.match(code(worker), /enableInternet = true;/);
  assert.match(code(worker), /sleepAfter = '10m';/);
});

test('the relay refuses raw, private and loopback addresses, and listens where the Worker sends', () => {
  for (const option of ['allow_direct_ip: false', 'allow_private_ips: false', 'allow_loopback_ips: false', 'allow_udp_streams: false', 'stream_limit_total: STREAMS']) {
    assert.ok(code(server).includes(option), option);
  }
  const port = worker.match(/defaultPort = (\d+);/)![1];
  assert.match(code(server), new RegExp(`server\\.listen\\(${port}, `));
  assert.match(read('workers/relay/container/Dockerfile'), /^USER node$/m);
});

test('a container started without its settings stops instead of relaying anywhere', () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'workers/relay/container/server.mjs')], { env: { NODE_ENV: 'production' }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /ARKRELAY_ORIGINS, ARKRELAY_ALLOWED_HOSTS, ARKRELAY_PORTS and ARKRELAY_STREAMS are required/);
});
