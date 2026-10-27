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
    globalThis.fetch = async () => { throw new Error('Offline'); };
    assert.deepEqual(await getLiveTwitchStreams('Arknights', 12, 'fixture', 'fixture'), []);
  } finally { globalThis.fetch = original; }
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
