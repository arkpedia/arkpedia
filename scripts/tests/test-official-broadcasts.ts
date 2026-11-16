import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignBroadcastGroups, featuredBroadcastGroups, importantBroadcast, validBroadcastSnapshot, BROADCAST_LOOKAHEAD,
  type BroadcastCandidate, type OfficialBroadcast } from '../../lib/home/officialBroadcasts';
const now = Date.parse('2026-11-20T12:00:00Z'), hour = 3600000;
const item = (id: string, region: BroadcastCandidate['region'], offset: number, extra: Partial<BroadcastCandidate> = {}): BroadcastCandidate => ({
  id, source:`arknights-${region}`, game:'arknights', region, title:'Arknights 6th Anniversary Special Livestream',
  url:'https://www.youtube.com/watch?v=abcdefghijk', thumbnail:null, startsAt:new Date(now + offset).toISOString(), status:'upcoming', verifiedAt:new Date(now).toISOString(), ...extra,
});

test('one regional event features the soonest stream, stays live until it ends, then prefers Global to a same-time KR stream', () => {
  const upcoming = assignBroadcastGroups([item('jp','jp',hour,{title:'アークナイツ 6周年記念公式生放送'}), item('kr','kr',3*hour,{title:'명일방주 6주년 특별 방송'}), item('global','global',3*hour)]);
  let groups = featuredBroadcastGroups(upcoming,now);
  assert.equal(groups.length,1); assert.equal(groups[0].primary.id,'jp'); assert.deepEqual(groups[0].others.map(row=>row.id),['global','kr']);
  const at = now+3*hour+1000;
  const live = upcoming.map(row=>({...row,status:'live' as const,verifiedAt:new Date(at).toISOString()}));
  assert.equal(featuredBroadcastGroups(live,at)[0].primary.id,'jp','an earlier live broadcast remains featured while the others start');
  const ended = live.map(row=>row.id==='jp'?{...row,status:'ended' as const}:row);
  groups=featuredBroadcastGroups(ended,at);
  assert.equal(groups[0].primary.id,'global'); assert.equal(groups[0].others.find(row=>row.id==='jp')?.status,'ended');
  assert.equal(featuredBroadcastGroups(ended.map(row=>({...row,status:'ended' as const})),at).length,0);
});

test('the seven-day boundary, stale live confirmation and already-ended broadcasts cannot promote old streams', () => {
  assert.equal(featuredBroadcastGroups(assignBroadcastGroups([item('edge','global',BROADCAST_LOOKAHEAD)]),now).length,1);
  for(const row of [item('far','global',BROADCAST_LOOKAHEAD+1),item('ended','global',-hour,{status:'ended'}),
    item('stale','global',-hour,{status:'live',verifiedAt:new Date(now-90001).toISOString()}),item('old','global',-7*hour)]) {
    assert.equal(featuredBroadcastGroups(assignBroadcastGroups([row]),now).length,0,row.id);
  }
});

test('strong identities group localized events and Endfield versions without merging unrelated generic programmes or CN anniversaries', () => {
  const aliases=[{key:'event-a',names:['The New Event','新しいイベント']}];
  const rows=assignBroadcastGroups([item('a','jp',hour,{title:'新しいイベント 生放送'}),item('b','global',2*hour,{title:'The New Event Special Livestream'})],aliases);
  assert.equal(featuredBroadcastGroups(rows,now).length,1);
  assert.equal(featuredBroadcastGroups(assignBroadcastGroups([item('a','jp',hour,{title:'Official Special Livestream'}),item('b','global',hour,{title:'Official Special Livestream'})]),now).length,2);
  assert.equal(featuredBroadcastGroups(assignBroadcastGroups([item('a','cn',hour),item('b','global',hour)]),now).length,2);
  const versions=assignBroadcastGroups([item('a','global',hour,{game:'endfield',title:'Endfield Version 1.2 Special Program'}),item('b','jp',2*hour,{game:'endfield',title:'エンドフィールド 1.2バージョン 特別番組'})]);
  assert.equal(featuredBroadcastGroups(versions,now).length,1);
});

test('only broadcast formats and Endfield patch programmes qualify; DTOs have safe watch links', () => {
  for(const title of ['アークナイツ 6周年記念公式生放送','Arknights Anniversary Special Livestream','《明日方舟》感谢庆典前瞻特别直播节目'])assert.equal(importantBroadcast(title,'','arknights'),true,title);
  assert.equal(importantBroadcast('Endfield Version 1.2 Special Program','','endfield'),true);
  for(const title of ['Arknights Official Operator Trailer','Arknights 24/7 music livestream','Arknights EP - Theme'])assert.equal(importantBroadcast(title,'','arknights'),false,title);
  const snapshot={checkedAt:new Date(now).toISOString(),degraded:false,broadcasts:assignBroadcastGroups([item('a','global',hour)])};
  assert.equal(validBroadcastSnapshot(snapshot),true);
  assert.equal(validBroadcastSnapshot({...snapshot,broadcasts:snapshot.broadcasts.map(row=>({...row,url:'javascript:alert(1)'} as OfficialBroadcast))}),false);
});
