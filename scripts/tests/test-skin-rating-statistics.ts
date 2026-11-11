import assert from 'node:assert/strict';
import test from 'node:test';
import {aggregateRatingBuckets,ratingStatistics,skinRatingRows} from '../../lib/polls/skin-rating-statistics';
const skins=[{id:'a',name:'First',operator:'Aak',image:null,aliases:[]},{id:'b',name:'Second',operator:'Aak',image:null,aliases:[]},{id:'c',name:'Third',operator:'Absinthe',image:null,aliases:[]}];
test('score counts yield interpolated percentiles, multiple modes and population deviation without expanding votes',()=>{
  const stats=ratingStatistics([1,0,0,0,0,0,0,0,0,1])!;
  assert.equal(stats.mean,5.5);assert.equal(stats.median,5.5);assert.equal(stats.q1,3.25);assert.equal(stats.q3,7.75);assert.equal(stats.p5,1.45);assert.ok(Math.abs(stats.p95-9.55)<1e-12);assert.equal(stats.deviation,4.5);assert.deepEqual(stats.modes,[1,10]);
  const single=ratingStatistics([0,0,0,0,0,0,0,1,0,0])!;for(const key of ['mean','median','q1','q3','p5','p95','min','max'] as const)assert.equal(single[key],8);assert.equal(single.deviation,0);
  assert.equal(ratingStatistics(Array(10).fill(0)),null);assert.equal(ratingStatistics([1]),null);assert.equal(ratingStatistics([1,-1,0,0,0,0,0,0,0,0]),null);
  assert.equal(ratingStatistics([1000000000,0,0,0,0,0,0,0,0,1000000000])!.median,5.5);
});
test('operator summaries pool every skin rating, retain exact ties and never fabricate a missing distribution',()=>{
  const aggregates=aggregateRatingBuckets([{skin:'a',rating:10,ratings:1},{skin:'b',rating:1,ratings:3},{skin:'c',rating:10,ratings:2}]);
  const operators=skinRatingRows(aggregates,skins,'operators');assert.equal(operators[1].name,'Aak');assert.equal(operators[1].stats!.mean,3.25);assert.equal(operators[1].stats!.median,1);assert.equal(operators[1].ratings,4);
  assert.equal(operators[0].stats!.n,2);assert.deepEqual(operators[1].histogram,[3,0,0,0,0,0,0,0,0,1]);
  const rows=skinRatingRows(aggregates,skins,'skins');assert.deepEqual(rows.map(row=>row.rank),[1,1,3]);assert.equal(rows[0].id,'c');
  const legacy=skinRatingRows([{skin:'a',total:8,ratings:1}],skins,'skins')[0];assert.equal(legacy.stats,null);assert.equal(legacy.total,8);
  assert.equal(skinRatingRows([{skin:'a',total:2,ratings:1,histogram:[1,0,0,0,0,0,0,0,0,0]}],skins,'skins')[0].stats,null);
  assert.equal(skinRatingRows([{skin:'unknown',total:10,ratings:1}],skins,'skins').length,0);
});
