import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshDailyStatistics, statisticsRefreshToken, verifyStatisticsRefreshToken } from '../deploy/statistics-schedule.mjs';

const secret='fixture-secret-long-enough-for-testing-only',time=Date.parse('2026-11-06T12:00:00Z');
test('refresh capabilities are bound to the cohort, UTC day and secret',async()=>{
  const token=await statisticsRefreshToken(secret,'all',time);
  assert.equal(await verifyStatisticsRefreshToken(secret,'all',token,time),true);
  for(const [other,region,at] of [[secret,'en',time],[secret,'all',time+86400_000],['different','all',time],[secret,'anything',time]])assert.equal(await verifyStatisticsRefreshToken(other,region,token,at),false);
  assert.equal(await verifyStatisticsRefreshToken(secret,'all','untrusted',time),false);
});
test('daily refresh visits four region cohorts and the music chart sequentially through the production self binding',async()=>{
  const seen=[];
  await refreshDailyStatistics({ARKPEDIA_DEPLOYMENT_ROLE:'production',ARKPEDIA_AUTH_URL:'https://www.arkpedia.net',BETTER_AUTH_SECRET:secret,WORKER_SELF_REFERENCE:{async fetch(request){
    const url=new URL(request.url);assert.equal(url.origin,'https://www.arkpedia.net');assert.ok(['/api/community/rankings','/api/music/likes'].includes(url.pathname));
    const server=url.pathname==='/api/music/likes'?'music':url.searchParams.get('server');seen.push(server);
    assert.equal(await verifyStatisticsRefreshToken(secret,server,request.headers.get('x-arkpedia-statistics-refresh')),true);
    assert.equal(request.headers.get('cookie'),null);return Response.json({});
  }}});
  assert.deepEqual(seen,['all','en','jp','kr','music']);
});
test('staging cannot refresh production; a failed cohort makes the schedule fail visibly',async()=>{
  await assert.rejects(refreshDailyStatistics({ARKPEDIA_DEPLOYMENT_ROLE:'staging'}),/production self binding/);
  let calls=0;
  await assert.rejects(refreshDailyStatistics({ARKPEDIA_DEPLOYMENT_ROLE:'production',ARKPEDIA_AUTH_URL:'https://www.arkpedia.net',BETTER_AUTH_SECRET:secret,WORKER_SELF_REFERENCE:{async fetch(){calls++;return new Response('',{status:503});}}}),/all \(HTTP 503\)/);
  assert.equal(calls,5,'a failed cohort does not prevent the other daily snapshots from refreshing');
});
