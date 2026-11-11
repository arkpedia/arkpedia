import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLiveTwitchStreams } from '../../lib/community/twitch';
import handler from '../../pages/api/twitch-streams';

test('Twitch only returns live streams in the requested category and bypasses fetch caches', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal);
    if (url.includes('oauth2')) return Response.json({ access_token:'fixture', expires_in:3600 });
    if (url.includes('/games?')) return Response.json({ data:[{ id:'arknights' }] });
    const entry = { user_login:'live', user_name:'Live', title:'Arknights', game_id:'arknights', game_name:'Arknights', type:'live', thumbnail_url:'https://example.com/{width}x{height}.jpg', started_at:'2026-10-26', viewer_count:1 };
    return Response.json({ data:[entry, { ...entry, user_login:'switched', game_id:'other' }, { ...entry, user_login:'offline', type:'' }] });
  };
  try {
    assert.deepEqual((await getLiveTwitchStreams('Arknights', 12, 'fixture', 'fixture')).map(s => s.userLogin), ['live']);
    assert.ok(calls.some(url => url.includes('streams?game_id=arknights')));
    await getLiveTwitchStreams('Arknights', 12, 'fixture', 'fixture');
    assert.equal(calls.filter(url => url.includes('/games?')).length, 1, 'reuse category metadata');
    assert.equal(calls.filter(url => url.includes('/streams?')).length, 2, 'refresh live results every time');
    globalThis.fetch = async () => { throw new Error('Offline'); };
    assert.deepEqual(await getLiveTwitchStreams('Arknights', 12, 'fixture', 'fixture'), []);
  } finally { globalThis.fetch = original; }
});

test('Twitch category metadata expires, stays scoped to its name, and retries failed lookups', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  const gameRequests: string[] = [];
  const streamGameIds: string[] = [];
  let gameResult: 'success' | 'missing' | 'error' = 'success';
  Date.now = () => now;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.includes('oauth2')) return Response.json({ access_token:'fixture', expires_in:3600 });
    if (url.pathname === '/helix/games') {
      gameRequests.push(url.searchParams.get('name')!);
      if (gameResult === 'error') return new Response(null, { status:503 });
      return Response.json({ data:gameResult === 'missing' ? [] : [{ id:`game-${gameRequests.length}` }] });
    }
    streamGameIds.push(url.searchParams.get('game_id')!);
    return Response.json({ data:[] });
  };
  const fetchStreams = (name: string) => getLiveTwitchStreams(name, 12, 'fixture', 'fixture');
  try {
    await fetchStreams('Cache fixture');
    now += 23 * 60 * 60 * 1000;
    await fetchStreams('Cache fixture');
    assert.deepEqual(gameRequests, ['Cache fixture']);
    assert.deepEqual(streamGameIds, ['game-1', 'game-1']);

    now += 60 * 60 * 1000;
    await fetchStreams('Cache fixture');
    assert.equal(gameRequests.length, 2, 'refresh metadata after one day');
    assert.equal(streamGameIds.at(-1), 'game-2');

    await fetchStreams('Other category');
    assert.equal(gameRequests.at(-1), 'Other category');
    assert.equal(streamGameIds.at(-1), 'game-3', 'never reuse another category ID');

    gameResult = 'missing';
    await fetchStreams('Retry fixture');
    gameResult = 'error';
    await fetchStreams('Retry fixture');
    assert.equal(streamGameIds.length, 4, 'failed lookups do not request streams');
    gameResult = 'success';
    await fetchStreams('Retry fixture');
    assert.equal(gameRequests.length, 6, 'empty and failed lookups stay retryable');
    assert.equal(streamGameIds.at(-1), 'game-6');
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('live endpoint shares requests for 15 seconds and never serves stale CDN data', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalId = process.env.TWITCH_CLIENT_ID;
  const originalSecret = process.env.TWITCH_CLIENT_SECRET;
  process.env.TWITCH_CLIENT_ID = 'fixture';
  process.env.TWITCH_CLIENT_SECRET = 'fixture';
  let now = originalNow();
  let streamRequests = 0;
  Date.now = () => now;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('oauth2')) return Response.json({ access_token:'fixture', expires_in:3600 });
    if (url.includes('/games?')) return Response.json({ data:[{ id:'arknights' }] });
    streamRequests++;
    return Response.json({ data:[] });
  };
  const request = async () => {
    const headers: Record<string, string> = {};
    let body: unknown;
    let status = 0;
    const response = {
      setHeader: (key: string, value: string) => { headers[key] = value; },
      status: (value: number) => { status = value; return response; },
      json: (value: unknown) => { body = value; },
    };
    await handler({ method:'GET' } as Parameters<typeof handler>[0], response as unknown as Parameters<typeof handler>[1]);
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(status, 200);
    return body;
  };
  try {
    await Promise.all([request(), request(), request()]);
    assert.equal(streamRequests, 1);
    now += 14000;
    await request();
    assert.equal(streamRequests, 1);
    now += 2000;
    await request();
    assert.equal(streamRequests, 2);
    delete process.env.TWITCH_CLIENT_ID;
    assert.deepEqual(await request(), { streams:[], available:false });
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalId === undefined) delete process.env.TWITCH_CLIENT_ID;
    else process.env.TWITCH_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET;
    else process.env.TWITCH_CLIENT_SECRET = originalSecret;
  }
});
