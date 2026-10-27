import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collabTicketGrants } from '../../lib/pulls/collabTickets';
import { availableBannerFreePulls, planBudgets } from '../../lib/pulls/plan';
import { bannerFreePulls } from '../../lib/pulls/pulls';
import { ALL_BANNERS, fillCollabTicketsFromDeployment } from '../../lib/pulls/sources';
import { resolvePullSchedule } from '../../lib/pulls/schedule';

test('issued item counts and login days determine pool-specific tickets', () => {
  const gacha = { linkageGachaItem: [{itemId:'ten',gachaPoolId:'LINKAGE_A',isTen:true},{itemId:'unused',gachaPoolId:'LINKAGE_B',isTen:true}] };
  const activity = { activity: { CHECKIN_ONLY: { sign: {checkInList:{0:{order:1,itemList:[{id:'ten',count:1}]},7:{order:8,itemList:[{id:'ten',count:1},{id:'unrelated',count:100}]}}} } } };
  assert.deepEqual(collabTicketGrants(gacha, activity), {LINKAGE_A:[{day:1,pulls:10},{day:8,pulls:10}]});
});

test('Monster Hunter login tickets count on day 1 and day 8, stay on their pool, and survive date resolution', () => {
  const source = ALL_BANNERS.find(b=>b.poolId==='LINKAGE_74_0_1')!;
  const [banner] = resolvePullSchedule([source], [{name:source.name,global_date:'2026/11/16–2026/11/30',global_window:{timingSource:'client'}}]);
  assert.equal(banner.freeDaily, 0);
  assert.equal(banner.freePulls, 20);
  assert.equal(bannerFreePulls(banner, new Date('2026-11-16T14:59:59Z')), 0);
  assert.equal(bannerFreePulls(banner, new Date('2026-11-16T16:00:00Z')), 10);
  assert.equal(bannerFreePulls(banner, new Date('2026-11-23T16:00:00Z')), 20);
  const now = new Date('2026-11-20T16:00:00Z');
  assert.equal(availableBannerFreePulls(banner,new Date('2026-11-24T16:00:00Z'),now),20);
  assert.equal(availableBannerFreePulls(banner,new Date('2026-11-24T16:00:00Z'),now,true),10);
  assert.equal(availableBannerFreePulls(banner,new Date('2026-12-01'),new Date('2026-12-01')),0);
  const other = {...banner,name:'Later',freeTicket:0,freeTicketSchedule:[],freePulls:0};
  const rows = planBudgets([{banner:banner.name,pulls:120,spendOn:'2026-11-29'},{banner:other.name,pulls:10,spendOn:'2026-11-29'}],[banner,other],now,()=>120);
  assert.equal(rows[0].paid,100);
  assert.equal(rows[1].available,20);
  assert.equal(ALL_BANNERS.find(b=>b.poolId==='LINKAGE_74_0_3')!.freePulls,0);
});

test('Persona includes 20 login pulls and 10 retained mailed singles without inventing daily rolls', () => {
  const source = ALL_BANNERS.find(b=>b.poolId==='LINKAGE_77_0_1')!;
  const banner = {...source,start:'2027-02-19',end:'2027-03-05',startAt:undefined,endAt:undefined};
  assert.equal(banner.freePulls,30);
  assert.equal(banner.freeDaily,0);
  assert.equal(bannerFreePulls(banner,new Date('2027-02-19T12:00:00Z')),11);
  assert.equal(bannerFreePulls(banner,new Date('2027-02-26T12:00:00Z')),28);
  assert.equal(availableBannerFreePulls(banner,new Date('2027-03-01T12:00:00Z'),new Date('2027-02-28T12:00:00Z')),30);
});


test('an older published payload gains sourced collab tickets without overwriting new release data', () => {
  const known = ALL_BANNERS.find(b => b.poolId === 'LINKAGE_74_0_1')!;
  const {freeTicketSchedule: _, ...old} = known;
  const legacy = {...old, name: 'Renamed release banner', start: '2026-11-16', end: '2026-11-30', freeTicket: 0, freePulls: 0};
  const [filled] = fillCollabTicketsFromDeployment([legacy]);
  assert.equal(filled.freePulls, 20);
  assert.equal(filled.name, legacy.name);
  assert.equal(filled.start, legacy.start);
  assert.equal(legacy.freePulls, 0);
  const [row] = planBudgets([{banner: filled.name, pulls: 0, spendOn: filled.end}], [filled], new Date('2026-10-27'), () => 146);
  assert.equal(row.available, 166);
  assert.equal(row.remaining, 146);
  const fresh = {...legacy, freeTicketSchedule: [{day: 3, pulls: 5}], freeTicket: 5, freePulls: 5};
  const removed = {...legacy, freeTicketSchedule: []};
  const unknown = {...legacy, poolId: 'LINKAGE_UNKNOWN'};
  assert.deepEqual(fillCollabTicketsFromDeployment([fresh, removed, unknown]), [fresh, removed, unknown]);
});
