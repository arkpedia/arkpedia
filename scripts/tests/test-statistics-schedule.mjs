import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshDailyStatistics, statisticsRefreshToken, verifyStatisticsRefreshToken } from '../deploy/statistics-schedule.mjs';
import { refreshDailyServices } from '../deploy/daily-refresh.mjs';

const secret='fixture-secret-long-enough-for-testing-only',time=Date.parse('2026-11-06T12:00:00Z');
const production = { ARKPEDIA_DEPLOYMENT_ROLE:'production', ARKPEDIA_AUTH_URL:'https://www.arkpedia.net', BETTER_AUTH_SECRET:secret };
test('refresh capabilities are bound to the cohort, UTC day and secret',async()=>{
  const token=await statisticsRefreshToken(secret,'all',time);
  assert.equal(await verifyStatisticsRefreshToken(secret,'all',token,time),true);
  for(const [other,region,at] of [[secret,'en',time],[secret,'all',time+86400_000],['different','all',time],[secret,'anything',time]])assert.equal(await verifyStatisticsRefreshToken(other,region,token,at),false);
  assert.equal(await verifyStatisticsRefreshToken(secret,'all','untrusted',time),false);
});
test('the schedule refreshes music first and gives each job a separate D1 window',async()=>{
  const seen=[];
  const env = {...production, WORKER_SELF_REFERENCE:{async fetch(request){
    const url=new URL(request.url);assert.equal(url.origin,'https://www.arkpedia.net');assert.ok(['/api/community/rankings','/api/music/likes'].includes(url.pathname));
    const server=url.pathname==='/api/music/likes'?'music':url.searchParams.get('server');seen.push(server);
    assert.equal(await verifyStatisticsRefreshToken(secret,server,request.headers.get('x-arkpedia-statistics-refresh')),true);
    assert.equal(request.headers.get('cookie'),null);return Response.json({});
  }}};
  await refreshDailyServices(env, {
    patreon: async () => seen.push('patreon'),
    wait: async ms => seen.push(ms),
  });
  assert.deepEqual(seen, ['music', 20_000, 'all', 20_000, 'en', 20_000, 'jp', 20_000, 'kr', 20_000, 'patreon']);
});
test('staging cannot refresh production; a failed cohort is reported without rerunning the scan',async()=>{
  await assert.rejects(refreshDailyStatistics({ARKPEDIA_DEPLOYMENT_ROLE:'staging'}, 'all'),/production self binding/);
  let calls=0;
  const env = {...production, WORKER_SELF_REFERENCE:{async fetch(){calls++;return new Response('',{status:503});}}};
  await assert.rejects(refreshDailyStatistics(env, 'all'),/all \(HTTP 503\)/);
  assert.equal(calls,1);
});
test('music retries a temporary failure once after the D1 resource window', async () => {
  for (const finalStatus of [200, 503]) {
    const calls = [];
    const env = {...production, WORKER_SELF_REFERENCE:{async fetch(request){
      assert.equal(new URL(request.url).pathname, '/api/music/likes');
      calls.push('fetch');
      return new Response('', {status:calls.length === 1 ? 503 : finalStatus});
    }}};
    const result = refreshDailyStatistics(env, 'music', async ms => calls.push(ms));
    if (finalStatus === 200) await result;
    else await assert.rejects(result, /music \(HTTP 503\)/);
    assert.deepEqual(calls, ['fetch', 15_000, 'fetch']);
  }
});
