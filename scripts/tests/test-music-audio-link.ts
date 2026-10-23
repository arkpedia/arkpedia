import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextApiRequest, NextApiResponse } from 'next';
import { audioLinkExpiry } from '../../lib/music/monsterSirenAudio';
import { audioLinkKeepMs, createAudioLinkMemo, type LinkBucket } from '../../lib/music/audioLinkMemo';
import musicAudio from '../../pages/api/music-audio/[id]';

const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 9, 22, 18, 34, 20);
/** A signed address as Monster Siren gives it, expiring `minutes` after `from`. */
const signed = (minutes: number, from = NOW, token = 'a'.repeat(32)) =>
  `https://res01.hycdn.cn/${token}/${Math.floor((from + minutes * MINUTE) / 1000).toString(16).toUpperCase()}/siren/audio/20260720/song.wav`;

test('the expiry of a signed address is the Unix time in its path, and nothing else is trusted', () => {
  // Measured 2026-10-22: given at 18:34:20 UTC, 6ADA815C is 21:34:20, three hours on.
  assert.equal(audioLinkExpiry('https://res01.hycdn.cn/27b7480022308325e39319a1a6750ae4/6ADA815C/siren/audio/20260720/x.wav', NOW), NOW + 180 * MINUTE);
  assert.equal(audioLinkExpiry(signed(180).toLowerCase(), NOW), NOW + 180 * MINUTE);
  for (const href of [
    signed(-1), // already expired
    signed(25 * 60), // more than a day away: a changed format, not an expiry
    signed(180).replace('https:', 'http:'),
    signed(180).replace('res01.hycdn.cn', 'res01.hycdn.cn.example.com'),
    'https://res01.hycdn.cn/siren/audio/20260720/song.wav', // no token or expiry
    `https://res01.hycdn.cn/${'a'.repeat(31)}/6ADA815C/siren/audio/x.wav`,
    'not an address', '',
  ]) assert.equal(audioLinkExpiry(href, NOW), null, href);
});

test('an address is kept half an hour at most, and never into its last ninety minutes', () => {
  assert.equal(audioLinkKeepMs(signed(180), NOW), 30 * MINUTE);
  assert.equal(audioLinkKeepMs(signed(5 * 60), NOW), 30 * MINUTE);
  assert.equal(audioLinkKeepMs(signed(100), NOW), 10 * MINUTE);
  assert.equal(audioLinkKeepMs(signed(90), NOW), 0);
  assert.equal(audioLinkKeepMs(signed(30), NOW), 0);
  assert.equal(audioLinkKeepMs('https://res01.hycdn.cn/siren/audio/x.wav', NOW), 0);
});

function bucket() {
  const objects = new Map<string, string>();
  const writes: string[] = [];
  let failing = false;
  const store: LinkBucket & { objects: Map<string, string>; writes: string[]; fail(on: boolean): void } = {
    objects, writes, fail: on => { failing = on; },
    async get(key) {
      if (failing) throw new Error('R2 unavailable');
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
    async put(key, value) {
      if (failing) throw new Error('R2 unavailable');
      writes.push(key);
      objects.set(key, value);
    },
  };
  return store;
}

test('the Worker memo answers from memory, then from the shared bucket, and only until the keep time', async () => {
  let clock = NOW;
  const shared = bucket();
  const isolate = createAudioLinkMemo(() => clock);
  const href = signed(180);
  assert.equal(await isolate.get('779443', shared), null);
  await isolate.put('779443', href, shared);
  assert.deepEqual(shared.writes, ['music-audio/779443']);
  assert.equal(await isolate.get('779443', null), href, 'from the isolate\'s memory, no bucket needed');
  // Another isolate has nothing in memory, and reads the bucket.
  const other = createAudioLinkMemo(() => clock);
  assert.equal(await other.get('779443', null), null);
  assert.equal(await other.get('779443', shared), href);
  assert.equal(await other.get('779443', null), href, 'kept in memory once read');
  clock += 30 * MINUTE - 1;
  assert.equal(await isolate.get('779443', shared), href);
  clock += 1;
  assert.equal(await isolate.get('779443', shared), null, 'past the keep time it is asked for again');
  assert.equal(await other.get('779443', shared), null);
});

test('the Worker memo never keeps an address it cannot date, and a failing or tampered bucket is a miss', async () => {
  const shared = bucket();
  const memo = createAudioLinkMemo(() => NOW);
  await memo.put('1', 'https://res01.hycdn.cn/siren/audio/1.wav', shared);
  await memo.put('2', signed(80), shared);
  assert.deepEqual(shared.writes, []);
  assert.equal(await memo.get('1', shared), null);
  assert.equal(await memo.get('2', shared), null);
  shared.objects.set('music-audio/3', '{not json');
  shared.objects.set('music-audio/4', JSON.stringify({ href: 'https://evil.example/x.wav', until: NOW + MINUTE }));
  assert.equal(await memo.get('3', shared), null);
  assert.equal(await memo.get('4', shared), null);
  shared.fail(true);
  assert.equal(await memo.get('5', shared), null);
  await memo.put('5', signed(180), shared);
  assert.equal(await memo.get('5', null), signed(180), 'memory still keeps it when the bucket fails');
});

type Reply = { status: number; headers: Record<string, string> };
const CONTEXT = Symbol.for('__cloudflare-context__');
async function callAudio(query: Record<string, string>, upstream: () => string, context?: unknown): Promise<Reply & { asked: number }> {
  let asked = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    asked++;
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { cid: query.id, sourceUrl: upstream() } }) };
  }) as unknown as typeof fetch;
  // OpenNext's worker sets this getter for each request (its init.js); Vercel never does.
  if (context) Object.defineProperty(globalThis, CONTEXT, { configurable: true, get: () => context });
  const reply: Reply = { status: 0, headers: {} };
  const res = {
    setHeader(name: string, value: string) { reply.headers[name] = value; return res; },
    status(code: number) { reply.status = code; return res; },
    json() { return res; },
    end() { return res; },
  };
  try {
    await musicAudio({ method: 'GET', query } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  } finally {
    globalThis.fetch = original;
    delete (globalThis as Record<symbol, unknown>)[CONTEXT];
  }
  return { ...reply, asked };
}

test('on Vercel the route answers exactly as before: a fresh redirect each call, kept by the edge only', async () => {
  for (const token of ['1', '2']) {
    const href = signed(180, Date.now(), token.repeat(32));
    const reply = await callAudio({ id: '880367' }, () => href);
    assert.equal(reply.status, 302);
    assert.equal(reply.asked, 1);
    assert.deepEqual(reply.headers, { 'Cache-Control': 'public, max-age=60, s-maxage=1800', Location: href });
  }
});

test('on the Worker the route keeps the redirect, and ?retry= asks Monster Siren again and replaces it', async () => {
  const shared = bucket();
  const waited: Promise<unknown>[] = [];
  const context = { env: { NEXT_INC_CACHE_R2_BUCKET: shared }, ctx: { waitUntil: (work: Promise<unknown>) => { waited.push(work); } } };
  let n = 0;
  const upstream = () => signed(180, Date.now(), String(++n).repeat(32));
  const first = await callAudio({ id: '048738' }, upstream, context);
  assert.equal(first.status, 302);
  assert.equal(first.asked, 1);
  assert.equal(first.headers['X-Arkpedia-Audio-Link'], 'asked');
  await Promise.all(waited);
  assert.deepEqual(shared.writes, ['music-audio/048738']);
  const again = await callAudio({ id: '048738' }, upstream, context);
  assert.equal(again.asked, 0, 'no second trip to Monster Siren');
  assert.equal(again.headers['X-Arkpedia-Audio-Link'], 'kept');
  assert.equal(again.headers.Location, first.headers.Location);
  assert.equal(again.headers['Cache-Control'], 'public, max-age=60, s-maxage=1800');
  const retried = await callAudio({ id: '048738', retry: '1' }, upstream, context);
  assert.equal(retried.asked, 1);
  assert.equal(retried.headers['X-Arkpedia-Audio-Link'], 'retry');
  assert.notEqual(retried.headers.Location, first.headers.Location);
  await Promise.all(waited);
  const after = await callAudio({ id: '048738' }, upstream, context);
  assert.equal(after.asked, 0);
  assert.equal(after.headers.Location, retried.headers.Location, 'the fresh address replaced the refused one');
  // A Worker whose bucket binding is missing still keeps the address in the isolate's memory.
  const bare = await callAudio({ id: '461186' }, upstream, { env: {}, ctx: {} });
  assert.equal(bare.headers['X-Arkpedia-Audio-Link'], 'asked');
  assert.equal((await callAudio({ id: '461186' }, upstream, { env: {}, ctx: {} })).headers['X-Arkpedia-Audio-Link'], 'kept');
});
